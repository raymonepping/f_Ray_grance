#!/usr/bin/env bash
# MANUAL PostgreSQL backup (ADR-007). Operator-invoked only; no scheduler.
# pg_dump -Fc as least-privileged fray_backup (pg_read_all_data, local socket),
# streamed to the macOS host OUTSIDE the Podman VM. Temp file -> verify ->
# checksum -> manifest (written last, atomically). Incomplete dumps are never
# advertised. Also archives the perfume image volume (Phase 12) AFTER the dump, so the archive is a
# superset of the images the dump references. Does NOT back up Vault, Ollama models or Terraform state.
set -euo pipefail
PODMAN="${PODMAN:-podman}"
DIR="${FRAY_BACKUP_DIR:?}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
umask 077
mkdir -p "$DIR"
chmod 700 "$DIR"
[[ "$("$PODMAN" inspect --format '{{.State.Running}}' fray-postgres 2>/dev/null)" == true ]] || {
  echo 'BLOCKED: fray-postgres not running' >&2
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

python3 "$repo/scripts/backup_snapshot.py" "$part" "$mpart" "$base.dump" "$ts"

# Perfume image binaries: read-only, network-less tar of the protected asset volume.
images=no
if "$PODMAN" volume exists fraygrance_image_assets 2>/dev/null; then
  "$PODMAN" run --rm --network none --image-volume=ignore -v fraygrance_image_assets:/assets:ro \
    --entrypoint tar "${PG_IMAGE:?}" -C /assets -cf - . >"$ipart"
  python3 - "$ipart" "$impart" "$base.images.tar" "$ts" <<'PYIMG'
import hashlib,json,sys,tarfile
src,out,name,ts=sys.argv[1:]
h=hashlib.sha256(open(src,'rb').read()).hexdigest()
with tarfile.open(src) as t:
    members=sorted(m.name.removeprefix('./') for m in t.getmembers() if m.isfile())
json.dump({'file':name,'sha256':h,'bytes':__import__('os').path.getsize(src),'files':len(members),'created_utc':ts,'volume':'fraygrance_image_assets'},open(out,'w'),indent=2)
PYIMG
  images=yes
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
