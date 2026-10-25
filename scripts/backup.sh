#!/usr/bin/env bash
# MANUAL PostgreSQL backup (ADR-007). Operator-invoked only; no scheduler.
# pg_dump -Fc as least-privileged fray_backup (pg_read_all_data, local socket),
# streamed to the macOS host OUTSIDE the Podman VM. Temp file -> verify ->
# checksum -> manifest (written last, atomically). Incomplete dumps are never
# advertised. Does NOT back up Vault, Ollama models or Terraform state.
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
mkdir "$DIR/.backup.lock" 2>/dev/null || { echo 'BLOCKED: another backup holds .backup.lock; inspect its owner before retrying.' >&2; exit 2; }
trap 'rm -f "$part" "$mpart"; rmdir "$DIR/.backup.lock"' EXIT
[[ ! -e "$DIR/$base.dump" && ! -e "$DIR/$base.manifest.json" ]] || { echo 'REFUSED: backup filename already exists; retry with a fresh timestamp.' >&2; exit 2; }

python3 "$repo/scripts/backup_snapshot.py" "$part" "$mpart" "$base.dump" "$ts"

mv "$part" "$DIR/$base.dump"
mv "$mpart" "$DIR/$base.manifest.json" # manifest last: its presence marks completion
rmdir "$DIR/.backup.lock"
trap - EXIT
python3 - "$DIR/$base.manifest.json" <<'PYINFO'
import json,sys
m=json.load(open(sys.argv[1]))
print(f"BACKUP_OK {m['file']} sha256={m['sha256']} bytes={m['bytes']} tables={len(m['tables'])} shared_snapshot=yes")
PYINFO
echo 'NEXT: copy dump + manifest to protected off-device media, then: make backup-record-copy BACKUP=<dump> LOCATION="<label>"'
