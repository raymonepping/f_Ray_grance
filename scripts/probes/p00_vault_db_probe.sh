#!/usr/bin/env bash
# Phase 00 G00.5 disposable probe: Vault database engine against disposable PG18.
set -euo pipefail
VIMG=docker.io/hashicorp/vault:2.1.2
VT=$(openssl rand -hex 16)
VAPW=$(openssl rand -hex 16)
podman run -d --name fray-p00-vault --label io.fraygrance.project=fraygrance --network fray-p00-net --cap-add IPC_LOCK \
  -e VAULT_DEV_ROOT_TOKEN_ID="$VT" -e VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200 "$VIMG" server -dev >/dev/null
sleep 3
PSQL() { podman exec -i fray-p00-pg psql -v ON_ERROR_STOP=1 -U postgres -q "$@"; }
PSQL -c "CREATE DATABASE fray"
PSQL -c "CREATE ROLE fray_vault_admin LOGIN CREATEROLE PASSWORD '$VAPW'"
# PG16+: a CREATEROLE user gets only ADMIN on roles it creates; it needs
# SET+INHERIT to terminate their sessions during revocation.
PSQL -c "ALTER ROLE fray_vault_admin SET createrole_self_grant = 'set, inherit'"
PSQL -d fray <<SQL
CREATE ROLE fray_runtime_group NOLOGIN;
CREATE SCHEMA app;
CREATE TABLE app.t(id int);
GRANT USAGE ON SCHEMA app TO fray_runtime_group;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA app TO fray_runtime_group;
GRANT fray_runtime_group TO fray_vault_admin WITH ADMIN OPTION;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
V() { podman exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="$VT" fray-p00-vault vault "$@"; }
J() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }
V secrets enable database >/dev/null
V write database/config/fray plugin_name=postgresql-database-plugin allowed_roles=fray-runtime \
  connection_url='postgresql://{{username}}:{{password}}@fray-p00-pg:5432/fray?sslmode=disable' \
  username=fray_vault_admin password="$VAPW" >/dev/null
V write database/roles/fray-runtime db_name=fray default_ttl=2m max_ttl=10m \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}' IN ROLE fray_runtime_group;" \
  revocation_statements="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '{{name}}'; DROP ROLE IF EXISTS \"{{name}}\";" >/dev/null
V write -f database/rotate-root/fray >/dev/null
echo "PASS rotate-root: bootstrap admin password replaced, known only to Vault"
OUT=$(V read -format=json database/creds/fray-runtime)
U=$(echo "$OUT" | J 'd["data"]["username"]')
P=$(echo "$OUT" | J 'd["data"]["password"]')
LID=$(echo "$OUT" | J 'd["lease_id"]')
TTL=$(echo "$OUT" | J 'd["lease_duration"]')
echo "PASS issue: user=${U:0:16}… ttl=${TTL}s"
UP() { podman exec -e PGPASSWORD="$P" fray-p00-pg psql -h fray-p00-pg -U "$U" -d fray -Atc "$1" 2>&1; }
echo "dml: $(UP "INSERT INTO app.t VALUES (1); SELECT 'ok rows='||count(*) FROM app.t;")"
echo "ddl (expect denied): $(UP "CREATE TABLE app.evil(x int);")"
echo "ddl public (expect denied): $(UP "CREATE TABLE public.evil(x int);")"
echo "extension (expect denied): $(UP "CREATE EXTENSION IF NOT EXISTS pg_trgm;")"
echo "createrole (expect denied): $(UP "CREATE ROLE x;")"
echo "renew: ttl=$(V lease renew -format=json "$LID" | J 'd["lease_duration"]')s"
V lease revoke "$LID" >/dev/null
echo "revoke: pg role remaining=$(PSQL -Atc "SELECT count(*) FROM pg_roles WHERE rolname='$U'")"
echo "post-revoke login (expect fail): $(UP "SELECT 1")"
OUT=$(V read -format=json database/creds/fray-runtime)
U=$(echo "$OUT" | J 'd["data"]["username"]')
P=$(echo "$OUT" | J 'd["data"]["password"]')
podman stop -t 2 fray-p00-vault >/dev/null
echo "vault outage: already-issued credential still logs in until VALID UNTIL: $(UP "SELECT 'yes'")"
