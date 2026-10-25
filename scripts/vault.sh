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
  echo 'usage: vault.sh status|init|unseal|snapshot' >&2
  exit 2
  ;;
esac
