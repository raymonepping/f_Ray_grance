#!/usr/bin/env bash
# Integration health. Prints PASS/FAIL per check; exits 1 if any REQUIRED check fails.
# Optional checks (API before Phase 02, agent before Phase 03) report SKIP honestly.
set -uo pipefail
PODMAN="${PODMAN:-podman}"
GW="http://127.0.0.1:${FRAY_GATEWAY_PORT:-8470}"
fail=0
ok() { printf '  [PASS] %s\n' "$*"; }
bad() {
  printf '  [FAIL] %s\n' "$*"
  fail=1
}
skip() { printf '  [SKIP] %s\n' "$*"; }
running() { [[ "$("$PODMAN" inspect --format '{{.State.Running}}' "$1" 2>/dev/null)" == true ]]; }

echo 'F-Ray-grance health'
vm="$("$PODMAN" machine ssh date -u +%s 2>/dev/null || echo 0)"
d=$(($(date -u +%s) - vm))
((d <= 2 && d >= -2)) && ok "Podman VM clock in sync (drift ${d}s)" || bad "Podman VM clock drift ${d}s (leases/sessions misbehave): run make heal"
for c in fray-postgres fray-vault fray-ollama fray-web; do
  running "$c" && ok "$c running" || bad "$c not running"
done

if v="$("$PODMAN" exec fray-postgres psql -X -At -U postgres -d fray -c \
  "SELECT current_setting('server_version')||' vector='||extversion FROM pg_extension WHERE extname='vector'" 2>/dev/null)" && [[ -n "$v" ]]; then
  ok "postgres $v"
else bad 'postgres database fray / vector extension unavailable (run make configure)'; fi
pgdata="$("$PODMAN" inspect fray-postgres --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Name}}{{end}}{{end}}' 2>/dev/null)"
[[ "$pgdata" == fraygrance_pgdata ]] && ok 'PGDATA on named volume fraygrance_pgdata' || bad "PGDATA volume is '$pgdata'"

if s="$(curl -s --max-time 5 http://127.0.0.1:8270/v1/sys/seal-status)"; then
  read -r init sealed < <(python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["initialized"],d["sealed"])' <<<"$s")
  [[ "$init" == True && "$sealed" == False ]] && ok 'vault initialised and unsealed' || bad "vault initialized=$init sealed=$sealed"
else bad 'vault API unreachable on 127.0.0.1:8270'; fi

if "$PODMAN" exec fray-ollama ollama list 2>/dev/null | grep -q "${EMBED_MODEL:-nomic-embed-text:v1.5}"; then
  ok "ollama model ${EMBED_MODEL:-nomic-embed-text:v1.5} present"
else bad 'ollama embedding model missing (run make configure)'; fi

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$GW/")"
[[ "$code" == 200 ]] && ok "gateway $GW/ -> 200" || bad "gateway $GW/ -> $code"
# The gateway must not listen on non-loopback interfaces.
ports="$("$PODMAN" inspect fray-web --format '{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}')"
[[ "$ports" =~ ^(127\.0\.0\.1:[0-9]+[[:space:]]*)+$ ]] && ok "gateway bound to loopback only ($ports)" || bad "gateway bindings: $ports"

if "$PODMAN" container exists fray-api; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$GW/api/health/ready")"
  [[ "$code" == 200 ]] && ok 'api ready via gateway' || bad "api ready -> $code"
  imgvol="$("$PODMAN" inspect fray-api --format '{{range .Mounts}}{{if eq .Destination "/var/lib/fray/images"}}{{.Name}}{{end}}{{end}}' 2>/dev/null)"
  if [[ "$imgvol" == fraygrance_image_assets ]] && "$PODMAN" exec fray-api test -w /var/lib/fray/images; then
    ok 'image assets on named volume fraygrance_image_assets (writable by api)'
  else bad "image asset volume is '${imgvol:-none}' or not writable (run make provision)"; fi
elif [[ -f "${FRAY_CONFIG_DIR:-$HOME/.config/f-ray-grance}/vault-configured" ]]; then
  bad 'fray-api expected (Vault configured) but not provisioned: run make provision'
else skip 'fray-api not provisioned yet'; fi
if "$PODMAN" container exists fray-vault-agent; then
  running fray-vault-agent && ok 'fray-vault-agent running' || bad 'fray-vault-agent not running'
elif [[ -f "${FRAY_CONFIG_DIR:-$HOME/.config/f-ray-grance}/vault-configured" ]]; then
  bad 'fray-vault-agent expected (Vault configured) but not provisioned'
else skip 'fray-vault-agent not provisioned yet'; fi

((fail)) && {
  echo 'HEALTH: FAIL'
  exit 1
}
echo 'HEALTH: PASS'
