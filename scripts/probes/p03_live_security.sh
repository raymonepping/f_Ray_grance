#!/usr/bin/env bash
# Phase 03 live security evidence against the running stack. Synthetic data only.
# Secrets are never printed: values travel via files/stdin inside containers.
# Leaves the stack running and healthy; removes every probe artefact it creates.
set -uo pipefail
PODMAN="${PODMAN:-podman}"
A=http://127.0.0.1:8270/v1
GW=http://localhost:8470
CFG="${FRAY_CONFIG_DIR:-$HOME/.config/f-ray-grance}"
VIMG="$(awk '/^VAULT_IMAGE/ {print $3}' "$(dirname "$0")/../../infra/versions.mk")"
# Keep the operator credential out of curl's process arguments.
V() { curl -H @<(printf 'X-Vault-Token: %s\n' "$(cat "$CFG/operator-token")") "$@"; }
pass=0
fail=0
ok() {
  echo "  [PASS] $*"
  pass=$((pass + 1))
}
bad() {
  echo "  [FAIL] $*"
  fail=$((fail + 1))
}
expect() { # expect <label> <want> <got>
  [[ "$3" == "$2" ]] && ok "$1 ($3)" || bad "$1: want $2 got $3"
}
J() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }

echo '== 1. Vault policy least privilege (real AppRole login from inside the project network)'
role_id="$(V -s $A/auth/approle/role/fray-api/role-id | J 'd["data"]["role_id"]')"
sec="$(V -s -X POST $A/auth/approle/role/fray-api/secret-id -d '{"metadata":"{\"purpose\":\"p03-probe\"}"}')"
secret_id="$(J 'd["data"]["secret_id"]' <<<"$sec")"
accessor="$(J 'd["data"]["secret_id_accessor"]' <<<"$sec")"
probe_dir="$CFG/run/p03"
mkdir -p "$probe_dir" && chmod 700 "$CFG/run" "$probe_dir"
printf '{"role_id":"%s","secret_id":"%s"}' "$role_id" "$secret_id" >"$probe_dir/login.json"
chmod 644 "$probe_dir/login.json"
unset secret_id sec
codes="$("$PODMAN" run --rm --network fraygrance -v "$probe_dir/login.json:/p/login.json:ro" --entrypoint sh "$VIMG" -c '
  T=$(wget -qO- --post-file=/p/login.json http://fray-vault:8200/v1/auth/approle/login | sed -n "s/.*\"client_token\":\"\([^\"]*\)\".*/\1/p")
  [ -n "$T" ] || { echo LOGIN_FAILED; exit 0; }
  export VAULT_TOKEN="$T" VAULT_ADDR=http://fray-vault:8200
  for p in database/creds/fray-runtime kv/data/fray/session database/creds/fray-migrator database/config/fray sys/mounts auth/approle/role/fray-api/secret-id kv/data/fray/other; do
    if response=$(vault read -format=json "$p" 2>&1); then c=200; else
      c=$(printf "%s\n" "$response" | sed -n "s/^Code: \([0-9]*\).*/\1/p" | head -1)
    fi
    echo "$p=${c:-err}"
  done
  vault token revoke -self >/dev/null
')"
rm -f "$probe_dir/login.json"
want() { grep -q "^$1=$2$" <<<"$codes" && ok "fray-api token: $1 -> $2" || bad "fray-api token: $1 expected $2 ($(grep "^$1=" <<<"$codes"))"; }
if grep -q LOGIN_FAILED <<<"$codes"; then bad 'AppRole login from project network failed'; else
  ok 'AppRole login from inside fraygrance network'
  want database/creds/fray-runtime 200
  want kv/data/fray/session 200
  want database/creds/fray-migrator 403
  want database/config/fray 403
  want sys/mounts 403
  want auth/approle/role/fray-api/secret-id 403
  want kv/data/fray/other 403
fi
# The same secret-id from the Mac host (outside the bound CIDR) must be refused.
host_login="$(printf '{"role_id":"%s","secret_id":"x"}' "$role_id" | curl -s -o /dev/null -w '%{http_code}' -X POST $A/auth/approle/login -d @-)"
[[ "$host_login" =~ ^4 ]] && ok "AppRole login from outside the project CIDR refused ($host_login)" || bad "host login answered $host_login"
V -s -X POST $A/auth/approle/role/fray-api/secret-id-accessor/destroy -d "{\"secret_id_accessor\":\"$accessor\"}" -o /dev/null
ok 'probe secret-id destroyed'

echo '== 2. Rendered credentials: runtime login is DML-only'
user="$("$PODMAN" exec fray-vault-agent sh -c 'cat /vault/rendered/db-runtime.json' | J 'd["username"]')"
[[ "$user" == v-*fray-run* ]] && ok "agent-rendered login is a Vault dynamic role (${user:0:20}…)" || bad "unexpected rendered user"
member="$("$PODMAN" exec fray-postgres psql -X -At -U postgres -c "SELECT pg_has_role('$user','fray_runtime','member') AND NOT pg_has_role('$user','fray_owner','member') AND NOT (SELECT rolcreaterole OR rolsuper FROM pg_roles WHERE rolname='$user')")"
expect 'runtime login: member of fray_runtime only, no CREATEROLE/SUPERUSER' t "$member"
perms="$("$PODMAN" exec fray-vault-agent stat -c '%a %u:%g' /vault/rendered/db-runtime.json)"
expect 'rendered file mode/owner' '640 100:1000' "$perms"
"$PODMAN" exec fray-api sh -c 'test -w /vault/rendered' && bad 'API can write rendered volume' || ok 'API mounts rendered volume read-only'
"$PODMAN" exec fray-api sh -c 'ls /vault/auth' >/dev/null 2>&1 && bad 'API can see AppRole credentials' || ok 'API has no access to /vault/auth'

echo '== 3. Revocation and rotation (pool rebuild without data change)'
before="$("$PODMAN" exec fray-postgres psql -X -At -U postgres -d fray -c 'SELECT count(*) FROM app.schema_migrations')"
rebuilds_before="$("$PODMAN" logs fray-api 2>&1 | grep -c 'pool (re)built')"
V -s -X PUT $A/sys/leases/revoke-prefix/database/creds/fray-runtime -o /dev/null -w '' && ok 'revoked all fray-runtime leases'
sleep 2
gone="$("$PODMAN" exec fray-postgres psql -X -At -U postgres -c "SELECT count(*) FROM pg_roles WHERE rolname='$user'")"
expect 'revoked login dropped in PostgreSQL' 0 "$gone"
code="$(curl -s -o /dev/null -w '%{http_code}' $GW/api/health/ready)"
expect 'API not ready while its credentials are revoked (fails closed)' 503 "$code"
"$PODMAN" restart -t 5 fray-vault-agent >/dev/null
for _ in $(seq 40); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' $GW/api/health/ready)" == 200 ]] && break
  sleep 1
done
expect 'API ready again after agent re-render + pool swap' 200 "$(curl -s -o /dev/null -w '%{http_code}' $GW/api/health/ready)"
newuser="$("$PODMAN" exec fray-vault-agent sh -c 'cat /vault/rendered/db-runtime.json' | J 'd["username"]')"
[[ "$newuser" != "$user" ]] && ok 'new dynamic login issued' || bad 'login did not rotate'
rebuilds_after="$("$PODMAN" logs fray-api 2>&1 | grep -c 'pool (re)built')"
((rebuilds_after > rebuilds_before)) && ok "API rebuilt its pool from rotated credentials ($rebuilds_before -> $rebuilds_after)" || bad 'no pool rebuild logged'
after="$("$PODMAN" exec fray-postgres psql -X -At -U postgres -d fray -c 'SELECT count(*) FROM app.schema_migrations')"
expect 'no persistent data changed by rotation' "$before" "$after"

echo '== 4. Vault outage'
"$PODMAN" stop -t 5 fray-vault >/dev/null
expect 'API stays ready on existing lease while Vault is down' 200 "$(curl -s -o /dev/null -w '%{http_code}' $GW/api/health/ready)"
"$PODMAN" start fray-vault >/dev/null
sleep 3
sealed="$(curl -s $A/sys/seal-status | J 'str(d["sealed"]).lower()')"
expect 'Vault restarts sealed' true "$sealed"
make -s vault-unseal >/dev/null && ok 'unsealed from operator file'
expect 'API ready after Vault recovery' 200 "$(curl -s -o /dev/null -w '%{http_code}' $GW/api/health/ready)"

echo '== 5. Owner login through the gateway (synthetic owner)'
u="probe-$(openssl rand -hex 3)"
pw="$(openssl rand -base64 24)"
printf '%s\n' "$pw" | FRAY_OWNER_PASSWORD_STDIN=1 bash "$(dirname "$0")/../owner.sh" create "$u" "Probe Owner" >/dev/null && ok "synthetic owner $u created via stdin"
jar="$probe_dir/jar.txt"
H=(-H 'Content-Type: application/json' -H "Origin: $GW")
expect 'anonymous collection' 401 "$(curl -s -o /dev/null -w '%{http_code}' $GW/api/v1/collection)"
expect 'wrong password' 401 "$(printf '{"username":"%s","password":"wrong-password-0"}' "$u" | curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -d @- $GW/api/v1/auth/login)"
expect 'login from foreign Origin' 403 "$(printf '{"username":"%s","password":"%s"}' "$u" "$pw" | curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d @- $GW/api/v1/auth/login)"
code="$(printf '{"username":"%s","password":"%s"}' "$u" "$pw" | curl -s -c "$jar" -o /dev/null -w '%{http_code}' "${H[@]}" -d @- $GW/api/v1/auth/login)"
unset pw
expect 'login' 200 "$code"
grep -q '#HttpOnly_localhost.*__Host-fray_session' "$jar" && ok 'session cookie HttpOnly' || bad 'session cookie not HttpOnly'
grep -qE 'localhost\s+FALSE\s+/\s+TRUE\s+[0-9]+\s+__Host-fray_csrf' "$jar" && ok 'csrf cookie Secure, Path=/' || bad 'csrf cookie flags'
expect 'authenticated collection' 200 "$(curl -s -b "$jar" -o /dev/null -w '%{http_code}' $GW/api/v1/collection)"
csrf="$(awk '$6=="__Host-fray_csrf"{print $7}' "$jar")"
expect 'logout without CSRF header' 403 "$(curl -s -b "$jar" -o /dev/null -w '%{http_code}' -X POST -H "Origin: $GW" $GW/api/v1/auth/logout)"
expect 'logout with CSRF header' 200 "$(curl -s -b "$jar" -o /dev/null -w '%{http_code}' -X POST -H "Origin: $GW" -H @<(printf 'x-csrf-token: %s\n' "$csrf") $GW/api/v1/auth/logout)"
expect 'old cookie after logout' 401 "$(curl -s -b "$jar" -o /dev/null -w '%{http_code}' $GW/api/v1/session)"
rm -f "$jar"
"$PODMAN" exec -i fray-api node apps/api/dist/cli/owner.js delete-synthetic "$u" >/dev/null && ok 'synthetic owner removed'
rmdir "$probe_dir" 2>/dev/null || true

echo '== 6. No secret material in logs (Vault audit entries are HMAC-hashed and therefore allowed)'
leaks=0
for c in fray-api fray-vault-agent fray-vault fray-web; do
  n="$("$PODMAN" logs "$c" 2>&1 | grep -E '"password":"[^"]|hvs\.[A-Za-z0-9]{20}|secret_id":"[0-9a-f-]{36}|token_hmac_key":"[A-Za-z0-9]' | grep -vcE '"(password|secret_id|token_hmac_key)":"hmac-sha256:' || true)"
  [[ "$n" == 0 ]] || {
    bad "$c log contains $n secret-looking lines"
    leaks=1
  }
done
((leaks)) || ok 'api, agent, vault and gateway logs contain no credential values'

echo "== RESULT pass=$pass fail=$fail"
((fail == 0))
