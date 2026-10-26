#!/usr/bin/env bash
# fray-vault operator actions (ADR-008). Secrets are read/written only via the
# operator file and HTTP request bodies on stdin; never echoed or put in argv.
set -euo pipefail
PODMAN="${PODMAN:-podman}"
ADDR="http://127.0.0.1:${FRAY_VAULT_HOST_PORT:-8270}"
INIT="${VAULT_INIT_FILE:?}"
BACKUP_DIR="${FRAY_BACKUP_DIR:?}"

status_json() { curl -s --max-time 5 "$ADDR/v1/sys/seal-status"; }
field() { python3 -c "import json,sys;print(str(json.load(sys.stdin).get('$1')).lower())"; }

wait_up() {
  for _ in $(seq 30); do
    status_json >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo 'BLOCKED: fray-vault API not reachable on 127.0.0.1' >&2
  exit 2
}

case "${1:-status}" in
status)
  wait_up
  s="$(status_json)"
  echo "fray-vault initialized=$(field initialized <<<"$s") sealed=$(field sealed <<<"$s") version=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["version"])' <<<"$s")"
  ;;
init)
  wait_up
  [[ "$(status_json | field initialized)" == false ]] || {
    echo 'fray-vault already initialised; nothing to do.'
    exit 0
  }
  [[ ! -e "$INIT" ]] || {
    echo "REFUSED: $INIT exists but Vault is uninitialised; inspect manually." >&2
    exit 3
  }
  umask 077
  mkdir -p "$(dirname "$INIT")"
  tmp="$(mktemp "$(dirname "$INIT")/.vault-init.XXXXXX")"
  curl -sf --max-time 30 -X PUT "$ADDR/v1/sys/init" -d '{"secret_shares":1,"secret_threshold":1}' >"$tmp"
  python3 -c "import json,sys;d=json.load(open(sys.argv[1]));assert d['keys_base64'] and d['root_token']" "$tmp"
  mv "$tmp" "$INIT"
  chmod 600 "$INIT"
  echo "INIT_OK: unseal key + initial root token written ONLY to $INIT (0600)."
  echo 'ACTION: copy this file to your password manager / protected offline media now.'
  "$0" unseal
  ;;
unseal)
  wait_up
  [[ "$(status_json | field sealed)" == true ]] || {
    echo 'fray-vault already unsealed.'
    exit 0
  }
  [[ -f "$INIT" ]] || {
    echo "BLOCKED: $INIT missing; cannot unseal." >&2
    exit 2
  }
  python3 -c "import json,sys;print(json.dumps({'key':json.load(open(sys.argv[1]))['keys_base64'][0]}))" "$INIT" |
    curl -sf --max-time 10 -X PUT "$ADDR/v1/sys/unseal" -d @- | field sealed | grep -qx false
  echo 'UNSEAL_OK'
  ;;
bootstrap)
  # One-time: create a scoped, periodic fray-operator token, then revoke the initial
  # root token. Tokens travel only in request headers/bodies via stdin, never argv.
  wait_up
  OP="${FRAY_CONFIG_DIR:?}/operator-token"
  if [[ -s "$OP" ]]; then
    echo 'operator token already present; bootstrap skipped.'
    exit 0
  fi
  root="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('root_token',''))" "$INIT")"
  [[ "$root" == hvs.* || "$root" == s.* ]] || {
    echo 'BLOCKED: no usable root token in init file (already revoked?). Use: vault operator generate-root.' >&2
    exit 2
  }
  repo="$(cd "$(dirname "$0")/.." && pwd)"
  hdr() { printf 'X-Vault-Token: %s\n' "$root"; }
  python3 -c "import json,sys;print(json.dumps({'policy':open(sys.argv[1]).read()}))" "$repo/infra/vault/policies/fray-operator.hcl" |
    curl -sf -X PUT -H @<(hdr) "$ADDR/v1/sys/policies/acl/fray-operator" -d @- >/dev/null
  umask 077
  curl -sf -X POST -H @<(hdr) "$ADDR/v1/auth/token/create-orphan" \
    -d '{"policies":["fray-operator"],"period":"768h","display_name":"fray-operator"}' |
    python3 -c "import json,sys;print(json.load(sys.stdin)['auth']['client_token'],end='')" >"$OP.partial"
  mv "$OP.partial" "$OP"
  chmod 600 "$OP"
  # Prove the operator token works before giving up root.
  curl -sf -H @<(printf 'X-Vault-Token: %s\n' "$(cat "$OP")") "$ADDR/v1/auth/token/lookup-self" >/dev/null
  curl -sf -X POST -H @<(hdr) "$ADDR/v1/auth/token/revoke-self" >/dev/null
  python3 - "$INIT" <<'PY'
import datetime, json, sys
p = sys.argv[1]
d = json.load(open(p))
d["root_token"] = "REVOKED " + datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump(d, open(p, "w"), indent=2)
PY
  echo "BOOTSTRAP_OK: fray-operator token at $OP (0600, periodic 768h); initial root token revoked."
  ;;
tinyfish-key)
  # Store (or clear with an empty line) the TinyFish API key at kv/fray/tinyfish (ADR-013).
  # The key is read from stdin or a hidden prompt and travels only in the request body; the
  # operator token only in a header from a pipe. Vault Agent re-renders it within 5 minutes.
  wait_up
  OP="${FRAY_CONFIG_DIR:?}/operator-token"
  [[ -s "$OP" ]] || {
    echo "BLOCKED: $OP missing; run make vault-bootstrap first." >&2
    exit 2
  }
  if [[ -t 0 ]]; then
    read -rs -p 'TinyFish API key (empty clears it): ' key
    echo
  else
    IFS= read -r key || true
  fi
  key="${key//[$'\r\n\t ']/}"
  # Length checked separately: macOS regex caps repetition counts at 255.
  [[ -z "$key" || (${#key} -ge 8 && ${#key} -le 512 && "$key" =~ ^[[:graph:]]+$) ]] || {
    echo 'REFUSED: that does not look like an API key (8-512 printable characters, no spaces).' >&2
    exit 2
  }
  printf '%s' "$key" | python3 -c 'import json,sys;print(json.dumps({"data":{"api_key":sys.stdin.read()}}))' |
    curl -sf --max-time 10 -X POST -H @<(printf 'X-Vault-Token: %s\n' "$(cat "$OP")") "$ADDR/v1/kv/data/fray/tinyfish" -d @- >/dev/null
  unset key
  echo 'TINYFISH_KEY_OK: stored in fray-vault kv/fray/tinyfish; Vault Agent renders it for the API within 5 minutes (make recreate SERVICE=vault-agent applies it now).'
  ;;
snapshot)
  wait_up
  : "${VAULT_TOKEN:?export a token with sys/storage/raft/snapshot read (never the app token)}"
  umask 077
  mkdir -p "$BACKUP_DIR/vault"
  out="$BACKUP_DIR/vault/fray-vault-$(date -u +%Y%m%dT%H%M%SZ).snap"
  curl -sf --max-time 60 -H @<(printf 'X-Vault-Token: %s\n' "$VAULT_TOKEN") "$ADDR/v1/sys/storage/raft/snapshot" -o "$out.partial"
  mv "$out.partial" "$out"
  shasum -a 256 "$out" >"$out.sha256"
  echo "SNAPSHOT_OK $out"
  ;;
*)
  echo 'usage: vault.sh status|init|unseal|bootstrap|snapshot' >&2
  exit 2
  ;;
esac
