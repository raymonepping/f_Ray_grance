#!/usr/bin/env bash
# MANUAL isolated restore rehearsal (ADR-007, ADR-016). Restores a backup's complete recovery set
# into DISPOSABLE targets (a PostgreSQL container and an image volume, both without network) and
# checks it end to end:
#   checksums of every file in the set -> compatibility -> pg_restore -> table fingerprints against
#   the manifest -> forward migration of the isolated target when the backup is older (R3) ->
#   transactional smoke test -> image archive against the restored references, extraction into a
#   fresh volume, checksum + decode of every file, owner-scoped reads (R2).
# Exactly one receipt is written per attempt, at the end (R1): result PASS only when every stage
# passed; any failure leaves a FAIL receipt naming the stage. The authoritative database and image
# volume are never touched, and nothing is promoted.
set -euo pipefail
PODMAN="${PODMAN:-podman}"
DIR="${FRAY_BACKUP_DIR:?}"
API_IMAGE="${API_IMAGE:-localhost/fray-api:current}"
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

ts="$(date -u +%Y%m%dT%H%M%SZ)"
c="fray-restoretest-$ts"
vol="fray-restoretest-assets-$ts"
tmp="$(mktemp -d)"
stages="$tmp/stages.jsonl"
: >"$stages"
current=start
validated=no
stage() { current="$1"; }
pass() { python3 -c 'import json,sys;print(json.dumps({"stage":sys.argv[1],"result":"PASS","detail":sys.argv[2]}))' "$current" "${1:-}" >>"$stages"; }
fail() {
  echo "RESTORE_TEST_FAIL: $1" >&2
  python3 -c 'import json,sys;print(json.dumps({"stage":sys.argv[1],"result":"FAIL","detail":sys.argv[2]}))' "$current" "$1" >>"$stages"
  exit 1
}
finish() {
  local rc=$?
  # A stage that died without calling fail() (e.g. pg_restore error) is recorded as failed here.
  if [[ $rc -ne 0 ]] && ! grep -q '"result": "FAIL"' "$stages"; then
    python3 -c 'import json,sys;print(json.dumps({"stage":sys.argv[1],"result":"FAIL","detail":"exit "+sys.argv[2]}))' "$current" "$rc" >>"$stages"
  fi
  mkdir -p "$DIR/restore-tests"
  python3 "$repo/scripts/backup_manifest.py" receipt "$man" "$stages" "$tmp/compare.json" "$DIR/restore-tests/$ts-$$.json" "$ts" "$rc" || true
  if [[ "$retain" == retain-validated && "$validated" == yes ]]; then
    echo "RESTORED_QUARANTINE target=$c assets=$vol network=none; authoritative DB and image volume unchanged; promotion requires operator review."
  else
    "$PODMAN" rm -f "$c" >/dev/null 2>&1 || true
    "$PODMAN" volume rm -f "$vol" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp"
  exit $rc
}
trap finish EXIT

# 1. Every file of the recovery set matches the checksum the manifest bound to it.
stage checksums
want="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["sha256"])' "$man")"
[[ "$(shasum -a 256 "$dump" | cut -d' ' -f1)" == "$want" ]] || fail 'database dump checksum mismatch'
# The image archive is the one the manifest's recovery set names (legacy: beside the dump).
itar="$(python3 -c 'import json,sys,os;m=json.load(open(sys.argv[1]));e=(m.get("recovery_set") or {}).get("images_tar");print(os.path.join(os.path.dirname(sys.argv[1]),e["file"]) if e else sys.argv[2])' "$man" "${dump%.dump}.images.tar")"
set_kind="$(python3 - "$man" "$DIR" 2>&1 <<'PYSET'
import hashlib,json,pathlib,sys
m=json.load(open(sys.argv[1])); d=pathlib.Path(sys.argv[2])
sha=lambda p: hashlib.file_digest(open(p,'rb'),'sha256').hexdigest()
rs=m.get('recovery_set')
if rs:
    for k in ('images_tar','images_manifest'):
        e=rs.get(k)
        if e is None: continue
        p=d/e['file']
        if not p.is_file(): sys.exit(f'{k} {e["file"]} is missing from the recovery set')
        if sha(p)!=e['sha256']: sys.exit(f'{k} {e["file"]} checksum mismatch')
    print('complete' if rs.get('images_tar') else 'complete-no-images')
else:
    # Legacy backup (before ADR-016): its image archive, if any, is checked against its own sidecar.
    tar=pathlib.Path(sys.argv[1].replace('.manifest.json','.images.tar')); side=tar.with_suffix('.json')
    if tar.exists():
        if not side.exists(): sys.exit('legacy image archive has no sidecar (images.json)')
        if sha(tar)!=json.load(open(side))['sha256']: sys.exit('legacy image archive checksum mismatch')
        print('legacy-with-images')
    else:
        print('legacy-no-images')
PYSET
)" || fail "recovery set: ${set_kind##*$'\n'}"
pass "set=$set_kind"

# 2. Compatibility, before any side effect.
stage compatibility
python3 - "$man" "$repo" <<'PYCOMPAT' || fail 'unsupported backup (see message above)'
import json,pathlib,sys
m=json.load(open(sys.argv[1]))
latest=len(list((pathlib.Path(sys.argv[2])/'db/migrations').glob('[0-9][0-9][0-9][0-9]_*.sql')))
if m.get('format')!='pg_dump -Fc' or m.get('database')!='fray' or m.get('postgres_version','').split('.')[0]!='18':
    sys.exit('REFUSED: unsupported archive format, database or PostgreSQL major version')
try:
    v=int(m['schema_version'])
except (ValueError,KeyError):
    sys.exit('REFUSED: the backup records no schema version; restore it with the application revision named in its manifest (app_git_revision)')
if v>latest:
    sys.exit(f"REFUSED: schema {v} is newer than this build ({latest}); check out app_git_revision {m.get('app_git_revision','?')[:12]} to restore it")
if v<1:
    sys.exit('REFUSED: unsupported schema version')
PYCOMPAT
"$PODMAN" run --rm -i --image-volume=ignore --network none --entrypoint pg_restore "$PG_IMAGE" --list <"$dump" >/dev/null || fail 'dump is not a readable archive'
pass "schema=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["schema_version"])' "$man")"

# 3. Restore into a disposable container.
stage restore
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
"$PODMAN" exec -i "$c" pg_restore -U postgres -d fray --exit-on-error <"$dump" || fail 'pg_restore failed'
secs=$(($(date +%s) - start))
pass "seconds=$secs"

# 4. Restored content matches the manifest (on the backup's own schema, before any upgrade).
stage fingerprints
P -d fray -At <"$repo/scripts/sql/table_fingerprints.sql" >"$tmp/restored.json"
vec="$(P -d fray -At -c "SELECT extversion FROM pg_extension WHERE extname='vector'")"
python3 "$repo/scripts/backup_manifest.py" compare "$man" "$tmp/restored.json" "$tmp/compare.json" "$secs" "$vec" "$ts" ||
  fail 'restored tables or pgvector differ from the manifest'
pass "pgvector=$vec"

# 5. An older backup is brought forward in the isolated target with the checked-in migrations.
stage upgrade
up="$(python3 "$repo/scripts/restore_upgrade.py" "$c" 2>&1)" || fail "${up##*$'\n'}"
echo "$up"
pass "$up"

# 6. Runtime writes on the current schema, rolled back.
stage smoke
P -d fray <"$repo/scripts/sql/restore_smoke.sql" || fail 'smoke test failed'
echo 'RESTORE_SMOKE_PASS: runtime collection/history/season/academy/image writes rolled back'
pass

# 7. Images: archive against the restored references, fresh isolated store, bytes, decode, owner scope.
stage images
P -d fray -At -c "SELECT coalesce(json_agg(json_build_object('path',storage_path,'checksum',checksum) ORDER BY storage_path),'[]') FROM (SELECT DISTINCT storage_path, checksum FROM app.image_assets WHERE storage_path IS NOT NULL) r" >"$tmp/refs.json"
nrefs="$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))))' "$tmp/refs.json")"
if [[ "$set_kind" == complete-no-images || "$set_kind" == legacy-no-images ]]; then
  [[ "$nrefs" == 0 ]] || fail "the database references $nrefs image file(s) but no image archive accompanies this backup"
  echo 'IMAGES_CHECK_SKIP: no image archive and no referenced images'
  pass 'referenced=0 archive=none'
else
  python3 "$repo/scripts/backup_images.py" safe "$itar" || fail 'unsafe image archive'
  python3 "$repo/scripts/backup_images.py" verify "$itar" "$tmp/refs.json" || fail 'image archive incomplete for the restored references'
  "$PODMAN" volume create --label io.fraygrance.project=fraygrance --label io.fraygrance.tier=restore-test "$vol" >/dev/null
  # Members were checked above (regular files and content-address names only, no links or ../).
  "$PODMAN" image exists "$API_IMAGE" || fail "decoding restored images needs the API image ($API_IMAGE); run make images"
  # Ownership and modes as the app writes them: the API image's runtime user, 750 dirs, 640 files.
  owner="$("$PODMAN" run --rm --network none --entrypoint sh "$API_IMAGE" -c 'echo "$(id -u):$(id -g)"')"
  [[ "$owner" =~ ^[0-9]+:[0-9]+$ ]] || fail 'cannot determine the API runtime user'
  "$PODMAN" run --rm -i --network none --image-volume=ignore -v "$vol":/assets -e OWNER="$owner" --entrypoint sh "$PG_IMAGE" -c \
    'tar -C /assets -xf - --no-same-owner --no-same-permissions && chown -R "$OWNER" /assets && find /assets -type d -exec chmod 750 {} + && find /assets -type f -exec chmod 640 {} +' <"$itar" ||
    fail 'image archive did not extract into a fresh volume'
  "$PODMAN" run --rm -i --network none --image-volume=ignore -v "$vol":/assets:ro -w /app/apps/api -e REFS="$(cat "$tmp/refs.json")" \
    --entrypoint node "$API_IMAGE" --input-type=module - <<'JS' || fail 'restored image files do not match or do not decode'
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
const refs = JSON.parse(process.env.REFS);
const bad = [];
for (const r of refs) {
  try {
    const o = await readFile(`/assets/${r.path}`);
    const sum = createHash('sha256').update(o).digest('hex');
    if (sum !== r.checksum || sum !== r.path.split('/')[1]) bad.push(`${r.path}: checksum`);
    await sharp(o).metadata();
    const d = await sharp(await readFile(`/assets/${r.path}.display.webp`)).metadata();
    if (d.format !== 'webp' || !d.width) bad.push(`${r.path}: derivative is not a decodable WebP`);
  } catch (e) {
    bad.push(`${r.path}: ${e.message}`);
  }
}
if (bad.length) { console.error(bad.slice(0, 5).join('; ')); process.exit(1); }
console.log(`IMAGES_RESTORED_PASS files=${refs.length} (fresh volume, checksums and decode)`);
JS
  P -d fray <"$repo/scripts/sql/restore_images_scope.sql" 2>&1 | grep -E 'IMAGES_SCOPE_PASS|ERROR' || true
  P -d fray <"$repo/scripts/sql/restore_images_scope.sql" >/dev/null 2>&1 || fail 'restored images are not owner-scoped'
  pass "referenced=$nrefs archive=verified extracted=fresh-volume"
fi

stage complete
pass
validated=yes
echo "RESTORE_TEST_PASS backup=$(basename "$dump") set=$set_kind images=$nrefs"
