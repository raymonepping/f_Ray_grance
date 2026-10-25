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
trap 'rm -f "$part" "$mpart"' EXIT

"$PODMAN" exec fray-postgres pg_dump -U fray_backup -d fray -Fc --compress=6 >"$part"
"$PODMAN" exec -i fray-postgres pg_restore --list <"$part" >/dev/null # archive is readable

Q() { "$PODMAN" exec -i fray-postgres psql -X -At -v ON_ERROR_STOP=1 -U fray_backup -d fray "$@"; }
export FRAY_M_TS="$ts" FRAY_M_FILE="$base.dump"
FRAY_M_SHA="$(shasum -a 256 "$part" | cut -d' ' -f1)"
FRAY_M_BYTES="$(stat -f %z "$part")"
FRAY_M_PG="$(Q -c "SELECT current_setting('server_version')")"
FRAY_M_VECTOR="$(Q -c "SELECT extversion FROM pg_extension WHERE extname='vector'")"
FRAY_M_SCHEMA="$(Q -c "SELECT coalesce(max(version)::text,'none') FROM app.schema_migrations" 2>/dev/null || echo none)"
FRAY_M_GIT="$(git -C "$repo" rev-parse --short HEAD 2>/dev/null || echo unknown)"
FRAY_M_TOOL="$("$PODMAN" exec fray-postgres pg_dump --version)"
FRAY_M_TABLES="$(Q <"$repo/scripts/sql/table_fingerprints.sql")"
export FRAY_M_SHA FRAY_M_BYTES FRAY_M_PG FRAY_M_VECTOR FRAY_M_SCHEMA FRAY_M_GIT FRAY_M_TOOL FRAY_M_TABLES
python3 "$repo/scripts/backup_manifest.py" write "$mpart"

mv "$part" "$DIR/$base.dump"
mv "$mpart" "$DIR/$base.manifest.json" # manifest last: its presence marks completion
trap - EXIT
echo "BACKUP_OK $DIR/$base.dump sha256=$FRAY_M_SHA bytes=$FRAY_M_BYTES tables=$(python3 -c 'import json,os;print(len(json.loads(os.environ["FRAY_M_TABLES"])))')"
echo 'NEXT: copy dump + manifest to protected off-device media, then: make backup-record-copy BACKUP=<dump> LOCATION="<label>"'
