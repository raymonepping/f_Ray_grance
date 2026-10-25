#!/usr/bin/env bash
# MANUAL isolated restore rehearsal (ADR-007). Restores a backup into a
# DISPOSABLE PostgreSQL container (no volume, no network), compares per-table
# row counts and content fingerprints with the backup manifest, then removes the
# container. The authoritative database is never touched.
set -euo pipefail
PODMAN="${PODMAN:-podman}"
DIR="${FRAY_BACKUP_DIR:?}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
dump="${1:-}"
if [[ -z "$dump" ]]; then
  dump="$(find "$DIR" -maxdepth 1 -name 'fray-*.dump' | sort | tail -1)"
fi
[[ -n "$dump" && -f "$dump" ]] || {
  echo 'BLOCKED: no backup found; run make backup first' >&2
  exit 2
}
man="${dump%.dump}.manifest.json"
[[ -f "$man" ]] || {
  echo "BLOCKED: manifest missing for $dump (incomplete backup)" >&2
  exit 2
}
want="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["sha256"])' "$man")"
[[ "$(shasum -a 256 "$dump" | cut -d' ' -f1)" == "$want" ]] || {
  echo 'RESTORE_TEST_FAIL: checksum mismatch' >&2
  exit 1
}

ts="$(date -u +%Y%m%dT%H%M%SZ)"
c="fray-restoretest-$ts"
tmp="$(mktemp -d)"
trap '"$PODMAN" rm -f "$c" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
# Disposable: trust auth is acceptable only because the container has no network and no volume.
"$PODMAN" run -d --name "$c" --network none --label io.fraygrance.project=fraygrance \
  --label io.fraygrance.tier=restore-test -e POSTGRES_HOST_AUTH_METHOD=trust "$PG_IMAGE" >/dev/null
ready() {
  for _ in $(seq 60); do
    "$PODMAN" exec "$c" pg_isready -U postgres -q 2>/dev/null && return 0
    sleep 1
  done
  return 1
}
ready
sleep 2 # the entrypoint restarts the server once after initdb
ready
P() { "$PODMAN" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -q -U postgres "$@"; }
# Global roles are not part of a logical dump; recreate the role model as Ansible does.
P -d postgres <"$repo/scripts/sql/restore_roles.sql"
start=$(date +%s)
"$PODMAN" exec -i "$c" pg_restore -U postgres -d fray --exit-on-error <"$dump"
secs=$(($(date +%s) - start))
P -d fray -At <"$repo/scripts/sql/table_fingerprints.sql" >"$tmp/restored.json"
vec="$(P -d fray -At -c "SELECT extversion FROM pg_extension WHERE extname='vector'")"
mkdir -p "$DIR/restore-tests"
python3 "$repo/scripts/backup_manifest.py" compare "$man" "$tmp/restored.json" \
  "$DIR/restore-tests/$ts.json" "$secs" "$vec" "$ts"
