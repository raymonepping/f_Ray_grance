#!/usr/bin/env bash
# MANUAL PostgreSQL backup (ADR-007). Operator-invoked only; no scheduler.
# pg_dump -Fc as least-privileged fray_backup (pg_read_all_data, local socket),
# streamed to the macOS host OUTSIDE the Podman VM. Temp file -> verify ->
# checksum -> manifest (written last, atomically). Incomplete dumps are never
# advertised. Also archives the perfume image volume (Phase 12) as one recovery set (ADR-016):
#   1. under .backup.lock, BEFORE the snapshot, image files no record references are collected once
#      older than a grace period (the app itself never deletes files, so nothing else removes them);
#   2. the snapshot records which image files it references;
#   3. the volume is archived; between 2 and 3 files can only be added, so the archive is a superset;
#   4. every referenced original (checksum) and derivative (complete WebP) is verified in the archive,
#      and dump + archive + sidecar checksums are bound into the manifest, which is written last.
# A backup whose archive misses anything its snapshot references is never published.
# Does NOT back up Vault, Ollama models or Terraform state.
set -euo pipefail
PODMAN="${PODMAN:-podman}"
DIR="${FRAY_BACKUP_DIR:?}"
PGC="${FRAY_PG_CONTAINER:-fray-postgres}"
VOL="${FRAY_IMAGE_VOLUME:-fraygrance_image_assets}"
GRACE_MIN="${FRAY_IMAGE_GC_GRACE_MIN:-60}"
[[ "$GRACE_MIN" =~ ^[0-9]+$ ]] || exit 2
repo="$(cd "$(dirname "$0")/.." && pwd)"
umask 077
mkdir -p "$DIR"
chmod 700 "$DIR"
[[ "$("$PODMAN" inspect --format '{{.State.Running}}' "$PGC" 2>/dev/null)" == true ]] || {
  echo "BLOCKED: $PGC not running" >&2
  exit 2
}
ts="$(date -u +%Y%m%dT%H%M%SZ)"
base="fray-$ts"
part="$DIR/.$base.dump.partial"
mpart="$DIR/.$base.manifest.partial"
ipart="$DIR/.$base.images.tar.partial"
impart="$DIR/.$base.images.json.partial"
mkdir "$DIR/.backup.lock" 2>/dev/null || {
  echo 'BLOCKED: another backup holds .backup.lock; inspect its owner before retrying.' >&2
  exit 2
}
trap 'rm -f "$part" "$mpart" "$ipart" "$impart"; rmdir "$DIR/.backup.lock"' EXIT
[[ ! -e "$DIR/$base.dump" && ! -e "$DIR/$base.manifest.json" ]] || {
  echo 'REFUSED: backup filename already exists; retry with a fresh timestamp.' >&2
  exit 2
}

# 1. Collect unreferenced image files (under the lock, before the snapshot, after the grace period).
if "$PODMAN" volume exists "$VOL" 2>/dev/null; then
  bq() { "$PODMAN" exec -i "$PGC" psql -XqAt -v ON_ERROR_STOP=1 -U fray_backup -d fray -c "$1"; }
  # A CASE cannot guard a static reference to a missing table (schema < 5), so check first.
  refs=NO_TABLE
  if [[ "$(bq "SELECT to_regclass('app.image_assets') IS NOT NULL")" == t ]]; then
    refs="$(bq "SELECT coalesce(string_agg(DISTINCT storage_path, E'\n'), '') FROM app.image_assets WHERE storage_path IS NOT NULL")" || {
      echo 'BLOCKED: cannot read image references; nothing collected, no backup taken' >&2
      exit 2
    }
  fi
  if [[ "$refs" != NO_TABLE ]]; then
    removed="$(printf '%s\n' "$refs" | "$PODMAN" run --rm -i --network none --image-volume=ignore -e G="$GRACE_MIN" \
      -v "$VOL":/assets --entrypoint sh "${PG_IMAGE:?}" -c '
        set -eu
        cat >/tmp/refs
        cd /assets
        find . -type f -mmin +"$G" | sed "s#^\./##" | while IFS= read -r f; do
          printf "%s\n" "$f" | grep -Eq "^[0-9a-f]{2}/[0-9a-f]{64}(\.display\.webp)?(\.[0-9a-f-]{36}\.tmp)?$" || continue
          grep -qxF "${f%%.*}" /tmp/refs && continue
          rm -f -- "$f" && printf "%s\n" "$f"
        done')"
    echo "IMAGE_GC removed=$(grep -c . <<<"$removed" || true) (unreferenced, older than ${GRACE_MIN} min)"
  fi
fi

# 2. Database snapshot, with the image files it references.
python3 "$repo/scripts/backup_snapshot.py" "$part" "$mpart" "$base.dump" "$ts"

# Test-only hook between snapshot and archive (scripts/probes/p15_recovery_matrix.sh); never honoured
# for the real database container.
if [[ -n "${FRAY_BACKUP_TEST_AFTER_SNAPSHOT:-}" && "$PGC" != fray-postgres ]]; then
  bash -c "$FRAY_BACKUP_TEST_AFTER_SNAPSHOT"
fi

# 3. Image binaries: read-only, network-less tar of the protected asset volume.
images=no
if "$PODMAN" volume exists "$VOL" 2>/dev/null; then
  "$PODMAN" run --rm --network none --image-volume=ignore -v "$VOL":/assets:ro \
    --entrypoint tar "${PG_IMAGE:?}" -C /assets -cf - . >"$ipart"
  images=yes
fi

# 4. Verify the archive against the snapshot's references and seal the recovery set into the manifest.
if [[ "$images" == yes ]]; then
  python3 "$repo/scripts/backup_images.py" seal "$ipart" "$mpart" "$impart" "$base.images.tar" "$ts"
else
  python3 "$repo/scripts/backup_images.py" seal - "$mpart" "$impart" "$base.images.tar" "$ts"
fi

mv "$part" "$DIR/$base.dump"
if [[ "$images" == yes ]]; then
  mv "$ipart" "$DIR/$base.images.tar"
  mv "$impart" "$DIR/$base.images.json"
fi
mv "$mpart" "$DIR/$base.manifest.json" # manifest last: its presence marks completion
rmdir "$DIR/.backup.lock"
trap - EXIT
python3 - "$DIR/$base.manifest.json" <<'PYINFO'
import json,sys
m=json.load(open(sys.argv[1]))
print(f"BACKUP_OK {m['file']} sha256={m['sha256']} bytes={m['bytes']} tables={len(m['tables'])} shared_snapshot=yes")
PYINFO
if [[ "$images" == yes ]]; then
  python3 - "$DIR/$base.images.json" <<'PYIMGINFO'
import json,sys
m=json.load(open(sys.argv[1]))
print(f"IMAGES_OK {m['file']} sha256={m['sha256']} files={m['files']}")
PYIMGINFO
fi
echo 'NEXT: copy dump + manifest (and images.tar + images.json) to protected off-device media, then: make backup-record-copy BACKUP=<dump> LOCATION="<label>"'
