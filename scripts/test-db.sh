#!/usr/bin/env bash
# Disposable PostgreSQL 18 + pgvector for integration tests (synthetic data only).
# Loopback-only port, no volume, removed on stop. Applies the SAME role/database SQL
# as ansible/roles/postgres_base so tests exercise the production privilege model.
#   test-db.sh start   -> prints FRAY_TEST_PG=127.0.0.1:<port>
#   test-db.sh stop
set -euo pipefail
PODMAN="${PODMAN:-podman}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
name="${FRAY_TEST_DB_NAME:-fray-testdb}"
port="${FRAY_TEST_DB_PORT:-55433}"
img="${PG_IMAGE:-$(awk '/^PG_IMAGE/ {print $3}' "$repo/infra/versions.mk")}"
case "${1:-}" in
start)
  "$PODMAN" rm -f "$name" >/dev/null 2>&1 || true
  # trust auth is acceptable only for this synthetic, loopback-only, volume-less container.
  "$PODMAN" run -d --image-volume=ignore --name "$name" --label io.fraygrance.project=fraygrance --label io.fraygrance.tier=test \
    -p "127.0.0.1:$port:5432" -e POSTGRES_HOST_AUTH_METHOD=trust "$img" >/dev/null
  for _ in 1 2; do
    for _ in $(seq 60); do
      "$PODMAN" exec "$name" pg_isready -U postgres -q 2>/dev/null && break
      sleep 1
    done
    sleep 2 # entrypoint restarts once after initdb
  done
  P() { "$PODMAN" exec -i "$name" psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
  P -d postgres <"$repo/ansible/roles/postgres_base/files/cluster.sql"
  P -d fray <"$repo/ansible/roles/postgres_base/files/database.sql"
  P -d postgres <<'SQL'
CREATE ROLE t_migrator LOGIN IN ROLE fray_migrator;
CREATE ROLE t_runtime LOGIN IN ROLE fray_runtime;
CREATE ROLE t_runtime2 LOGIN IN ROLE fray_runtime;
GRANT CONNECT ON DATABASE fray TO t_migrator, t_runtime, t_runtime2;
SQL
  echo "FRAY_TEST_PG=127.0.0.1:$port"
  ;;
stop) "$PODMAN" rm -f "$name" >/dev/null 2>&1 || true ;;
*)
  echo 'usage: test-db.sh start|stop' >&2
  exit 2
  ;;
esac
