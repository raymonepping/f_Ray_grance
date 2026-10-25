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
retain="${2:-no}"
[[ "$retain" == no || "$retain" == retain-validated ]] || exit 2
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

python3 - "$man" "$repo" <<'PYCOMPAT'
import json,pathlib,sys
m=json.load(open(sys.argv[1]))
latest=len(list((pathlib.Path(sys.argv[2])/'db/migrations').glob('[0-9][0-9][0-9][0-9]_*.sql')))
if m.get('format')!='pg_dump -Fc' or m.get('database')!='fray' or m.get('postgres_version','').split('.')[0]!='18':
    sys.exit('REFUSED: unsupported archive format, database or PostgreSQL major version')
try:
    compatible=1<=int(m['schema_version'])<=latest
except (ValueError,KeyError):
    compatible=False
if not compatible:
    sys.exit('REFUSED: unsupported schema version; use the matching application revision')
PYCOMPAT
"$PODMAN" run --rm -i --image-volume=ignore --network none --entrypoint pg_restore "$PG_IMAGE" --list <"$dump" >/dev/null

ts="$(date -u +%Y%m%dT%H%M%SZ)"
c="fray-restoretest-$ts"
tmp="$(mktemp -d)"
validated=no
cleanup() {
  if [[ "$retain" == retain-validated && "$validated" == yes ]]; then
    echo "RESTORED_QUARANTINE target=$c network=none volume=none; authoritative DB unchanged; promotion requires operator review."
  else
    "$PODMAN" rm -f "$c" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT
# Disposable: trust auth is acceptable only because the container has no network and no volume.
"$PODMAN" run -d --image-volume=ignore --name "$c" --network none --label io.fraygrance.project=fraygrance \
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
P -d fray <"$repo/scripts/sql/restore_smoke.sql"
echo 'RESTORE_SMOKE_PASS: runtime collection/history/season writes rolled back'
P -d fray -At <"$repo/scripts/sql/table_fingerprints.sql" >"$tmp/restored.json"
vec="$(P -d fray -At -c "SELECT extversion FROM pg_extension WHERE extname='vector'")"
mkdir -p "$DIR/restore-tests"
python3 "$repo/scripts/backup_manifest.py" compare "$man" "$tmp/restored.json" \
  "$DIR/restore-tests/$ts.json" "$secs" "$vec" "$ts"

# Perfume images (Phase 12): every image file the restored database references must be in the
# archived asset volume, and the archive must match its checksum.
irefs="$(P -d fray -At -c "SELECT CASE WHEN to_regclass('app.image_assets') IS NULL THEN '' ELSE (SELECT string_agg(DISTINCT storage_path, ' ') FROM app.image_assets WHERE storage_path IS NOT NULL) END")"
itar="${dump%.dump}.images.tar"
if [[ -f "$itar" ]]; then
  iwant="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["sha256"])' "${dump%.dump}.images.json")"
  [[ "$(shasum -a 256 "$itar" | cut -d' ' -f1)" == "$iwant" ]] || {
    echo 'RESTORE_TEST_FAIL: image archive checksum mismatch' >&2
    exit 1
  }
  python3 - "$itar" $irefs <<'PYREFS'
import sys,tarfile
with tarfile.open(sys.argv[1]) as t:
    have={m.name.removeprefix('./') for m in t.getmembers() if m.isfile()}
refs=sys.argv[2:]
missing=[r for r in refs if r not in have or f"{r}.display.webp" not in have]
if missing:
    sys.exit(f"RESTORE_TEST_FAIL: {len(missing)} referenced image file(s) missing from the archive")
print(f"IMAGES_CHECK_PASS referenced={len(refs)} archived_files={len(have)}")
PYREFS
elif [[ -n "$irefs" ]]; then
  echo 'RESTORE_TEST_FAIL: database references image files but no image archive accompanies this backup' >&2
  exit 1
else
  echo 'IMAGES_CHECK_SKIP: no image archive and no referenced images'
fi

validated=yes
