#!/usr/bin/env bash
# Phase 15 recovery matrix (review R1-R3, ADR-016). Synthetic fixtures only, in private temporary
# targets: a disposable fixture PostgreSQL container (no network), a disposable image volume and a
# private backup directory under $TMPDIR. The live database, the live image volume and the real
# backup directory are fingerprinted before and after and must be unchanged.
#
# Cases: schema 3, 4, 5 (images) and latest (images) restore PASS through forward migration;
# future schema and dump corruption refused early; corrupt image tar, missing image sidecar, a
# correctly sealed archive missing an original or a derivative, and a ledger checksum mismatch all
# FAIL with a FAIL receipt (never PASS); a delete that removes a referenced file between snapshot and
# archive is caught and nothing is published; the app's delete/upload/refresh during a backup still
# yields a set that restores every captured reference; the collector removes only unreferenced files
# older than the grace period.
set -euo pipefail
PODMAN="${PODMAN:-podman}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
PG_IMAGE="${PG_IMAGE:-$(awk '/^PG_IMAGE/ {print $3}' "$repo/infra/versions.mk")}"
API_IMAGE="${API_IMAGE:-localhost/fray-api:current}"
export PODMAN PG_IMAGE API_IMAGE
FX=fray-p15-fixture
FV=fray-p15-assets
W="$(mktemp -d "${TMPDIR:-/tmp}/fray-p15.XXXXXX")"
B="$W/backups"
mkdir -p "$B"
chmod 700 "$W" "$B"
before_rt="$("$PODMAN" ps -a --filter label=io.fraygrance.tier=restore-test --format '{{.Names}}' | sort)"
before_rv="$("$PODMAN" volume ls --filter label=io.fraygrance.tier=restore-test --format '{{.Name}}' | sort)"
pass=0
failn=0
ok() {
  echo "  PASS $*"
  pass=$((pass + 1))
}
bad() {
  echo "  FAIL $*"
  failn=$((failn + 1))
}

live_fp() {
  {
    "$PODMAN" exec -i fray-postgres psql -XqAt -U fray_backup -d fray <"$repo/scripts/sql/table_fingerprints.sql"
    "$PODMAN" run --rm --network none --image-volume=ignore -v fraygrance_image_assets:/a:ro --entrypoint sh "$PG_IMAGE" \
      -c 'cd /a && find . -type f -exec sha256sum {} + | sort'
    ls -l "${FRAY_BACKUP_DIR:-$HOME/F-Ray-grance-backups}" | sort
  } | shasum -a 256 | cut -d' ' -f1
}
live_before="$(live_fp)"

cleanup() {
  "$PODMAN" rm -f "$FX" >/dev/null 2>&1 || true
  "$PODMAN" volume rm -f "$FV" >/dev/null 2>&1 || true
  for n in $(comm -13 <(echo "$before_rt") <("$PODMAN" ps -a --filter label=io.fraygrance.tier=restore-test --format '{{.Names}}' | sort)); do
    "$PODMAN" rm -f "$n" >/dev/null 2>&1 || true
  done
  for n in $(comm -13 <(echo "$before_rv") <("$PODMAN" volume ls --filter label=io.fraygrance.tier=restore-test --format '{{.Name}}' | sort)); do
    "$PODMAN" volume rm -f "$n" >/dev/null 2>&1 || true
  done
  rm -rf "$W"
}
trap cleanup EXIT

FP() { "$PODMAN" exec -i "$FX" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d fray "$@"; }

# Fixture database at schema $1 (+ images when $2 = images).
fixture() {
  local schema=$1 images=${2:-no}
  "$PODMAN" rm -f "$FX" >/dev/null 2>&1 || true
  "$PODMAN" volume rm -f "$FV" >/dev/null 2>&1 || true
  "$PODMAN" run -d --image-volume=ignore --name "$FX" --network none --label io.fraygrance.project=fraygrance \
    --label io.fraygrance.tier=p15-fixture -e POSTGRES_HOST_AUTH_METHOD=trust "$PG_IMAGE" >/dev/null
  for _ in 1 2; do
    for _ in $(seq 60); do
      "$PODMAN" exec "$FX" pg_isready -U postgres -q 2>/dev/null && break
      sleep 1
    done
    sleep 2
  done
  "$PODMAN" exec -i "$FX" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <"$repo/ansible/roles/postgres_base/files/cluster.sql"
  "$PODMAN" exec -i "$FX" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d fray <"$repo/ansible/roles/postgres_base/files/database.sql"
  python3 "$repo/scripts/restore_upgrade.py" "$FX" --upto "$schema" >/dev/null
  FP >/dev/null <<'SQL'
INSERT INTO app.owners(username,display_name) VALUES ('p15-alice','Synthetic Alice'),('p15-bob','Synthetic Bob');
INSERT INTO app.brands(canonical_name) VALUES ('P15 House');
INSERT INTO app.fragrances(brand_id,canonical_name) SELECT id,'P15 Accord' FROM app.brands WHERE canonical_name='P15 House';
INSERT INTO app.collection_entries(owner_id,fragrance_id,state)
  SELECT o.id,f.id,'owned' FROM app.owners o, app.fragrances f WHERE o.username='p15-alice';
SQL
  if [[ "$images" == images ]]; then
    "$PODMAN" volume create --label io.fraygrance.tier=p15-fixture "$FV" >/dev/null
    add_images 2 >"$W/refs.json"
  fi
}

# Writes $1 synthetic images (original PNG + display WebP, as the app stores them) for alternating
# owners; prints their references.
add_images() {
  local json
  json="$(
    "$PODMAN" run --rm -i --network none --image-volume=ignore -v "$FV":/assets -w /app/apps/api -e N="$1" -e SEED="$RANDOM" \
      --entrypoint node "$API_IMAGE" --input-type=module - <<'JS'
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const out = [];
for (let i = 0; i < Number(process.env.N); i++) {
  const c = { r: (Number(process.env.SEED) * 7 + i * 53) % 256, g: (i * 97) % 256, b: 120 };
  const png = await sharp({ create: { width: 40 + i, height: 30, channels: 3, background: c } }).png().toBuffer();
  const sum = createHash('sha256').update(png).digest('hex');
  await mkdir(`/assets/${sum.slice(0, 2)}`, { recursive: true });
  await writeFile(`/assets/${sum.slice(0, 2)}/${sum}`, png);
  await writeFile(`/assets/${sum.slice(0, 2)}/${sum}.display.webp`, await sharp(png).webp().toBuffer());
  out.push({ path: `${sum.slice(0, 2)}/${sum}`, checksum: sum, w: 40 + i });
}
console.log(JSON.stringify(out));
JS
  )"
  python3 - "$json" <<'PY' | FP >/dev/null
import json,sys
for i,r in enumerate(json.loads(sys.argv[1])):
    owner='p15-alice' if i%2==0 else 'p15-bob'
    print(f"INSERT INTO app.image_assets(owner_id,fragrance_id,source_kind,attribution_label,storage_kind,storage_path,mime_type,width,height,byte_size,checksum,status) "
          f"SELECT o.id,f.id,'user_upload','Synthetic','local_persistent','{r['path']}','image/png',{r['w']},30,1,'{r['checksum']}','available' "
          f"FROM app.owners o, app.fragrances f WHERE o.username='{owner}' AND f.canonical_name='P15 Accord';")
PY
  echo "$json"
}

# The last backup THIS case took (never a fallback to an older or altered set).
backup() {
  : >"$W/backup.log"
  FRAY_BACKUP_DIR="$B" FRAY_PG_CONTAINER="$FX" FRAY_IMAGE_VOLUME="$FV" bash "$repo/scripts/backup.sh" "$@" 2>&1 | tee "$W/backup.log"
}
latest_dump() { echo "$B/$(grep -Eo 'BACKUP_OK [^ ]+' "$W/backup.log" | tail -1 | cut -d' ' -f2)"; }
restore() { FRAY_BACKUP_DIR="$B" bash "$repo/scripts/restore-test.sh" "$1" 2>&1; }
last_receipt() { ls -t "$B"/restore-tests/*.json | head -1; }
receipt_is() { python3 -c 'import json,sys;r=json.load(open(sys.argv[1]));sys.exit(0 if r["result"]==sys.argv[2] and (sys.argv[3]=="-" or r.get("failed_stage")==sys.argv[3]) else 1)' "$(last_receipt)" "$1" "$2"; }
# Copies a backup set to a new timestamp so a case can alter it without touching the original.
copyset() {
  local src=$1 dst
  dst="$B/fray-$2.dump"
  for ext in dump manifest.json images.tar images.json; do
    [[ -f "${src%.dump}.$ext" ]] && cp "${src%.dump}.$ext" "${dst%.dump}.$ext"
  done
  # The copy's manifest names the copy's own files (a set copied under its own name).
  python3 - "${dst%.dump}.manifest.json" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]); m=json.loads(p.read_text()); base=p.name.removesuffix('.manifest.json')
m['file']=base+'.dump'; rs=m.get('recovery_set') or {}
for k,suffix in (('dump','.dump'),('images_tar','.images.tar'),('images_manifest','.images.json')):
    if rs.get(k): rs[k]['file']=base+suffix
p.write_text(json.dumps(m))
PY
  echo "$dst"
}
reseal() { # rebinds a modified images.tar into its sidecar and manifest (a consistently sealed set)
  python3 - "$1" <<'PY'
import hashlib,json,pathlib,sys
d=sys.argv[1]; man=pathlib.Path(d.replace('.dump','.manifest.json'))
tar=pathlib.Path(d.replace('.dump','.images.tar')); side=pathlib.Path(d.replace('.dump','.images.json'))
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
s=json.loads(side.read_text()); s['sha256']=sha(tar); s['file']=tar.name; side.write_text(json.dumps(s))
m=json.loads(man.read_text()); m['recovery_set']['images_tar']={'file':tar.name,'sha256':sha(tar)}
m['recovery_set']['images_manifest']={'file':side.name,'sha256':sha(side)}; man.write_text(json.dumps(m))
PY
}

echo "== R3: retained schema checkpoints restore through forward migration"
for spec in "3 no" "4 no" "5 images" "7 images"; do
  set -- $spec
  fixture "$1" "$2"
  backup >/dev/null
  out="$(restore "$(latest_dump)")" || true
  if grep -q RESTORE_TEST_PASS <<<"$out" && receipt_is PASS -; then
    ok "schema $1 ($2): $(grep -Eo 'UPGRADED from=[0-9]+ to=[0-9]+|CURRENT [0-9]+' <<<"$out" | head -1); $(grep -Eo 'IMAGES_RESTORED_PASS files=[0-9]+|IMAGES_CHECK_SKIP' <<<"$out" | head -1)"
  else
    bad "schema $1 ($2): $(grep -E 'FAIL|REFUSED' <<<"$out" | head -2 | tr '\n' ' ')"
  fi
done
good="$(latest_dump)" # latest schema with two images (one per owner)

echo "== R1/R3: refusals and failures never leave a PASS receipt"
expect_fail() { # <label> <dump> <stage>
  local out
  out="$(restore "$2")" && {
    bad "$1: restore exited 0"
    return
  }
  if receipt_is FAIL "$3"; then ok "$1: FAIL at $3 — $(grep -Eo 'RESTORE_TEST_FAIL: .*|REFUSED: .*' <<<"$out" | head -1 | cut -c1-110)"; else bad "$1: receipt is not FAIL at $3 ($(python3 -c 'import json,sys;r=json.load(open(sys.argv[1]));print(r["result"],r.get("failed_stage"))' "$(last_receipt)"))"; fi
}
d="$(copyset "$good" 20000101T000001Z)"
python3 - "${d%.dump}.manifest.json" <<'PY'
import json,sys; m=json.load(open(sys.argv[1])); m['schema_version']='99'; json.dump(m,open(sys.argv[1],'w'))
PY
expect_fail 'future schema 99' "$d" compatibility
d="$(copyset "$good" 20000101T000002Z)"
printf 'X' | dd of="$d" bs=1 seek=200 conv=notrunc 2>/dev/null
expect_fail 'corrupted dump' "$d" checksums
d="$(copyset "$good" 20000101T000003Z)"
printf 'X' | dd of="${d%.dump}.images.tar" bs=1 seek=700 conv=notrunc 2>/dev/null
expect_fail 'corrupted image tar' "$d" checksums
d="$(copyset "$good" 20000101T000004Z)"
rm "${d%.dump}.images.json"
expect_fail 'missing image sidecar' "$d" checksums
for what in original derivative; do
  d="$(copyset "$good" "20000101T0000${#what}0Z")"
  first="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["image_refs"][0]["path"])' "${d%.dump}.manifest.json")"
  member="$first"
  [[ "$what" == derivative ]] && member="$first.display.webp"
  python3 - "${d%.dump}.images.tar" "$member" <<'PY'
import io,sys,tarfile
src,drop=sys.argv[1],sys.argv[2]
with tarfile.open(src) as t: items=[(m,t.extractfile(m).read() if m.isfile() else None) for m in t.getmembers()]
with tarfile.open(src,'w') as t:
    for m,b in items:
        if m.name.removeprefix('./')!=drop: t.addfile(m,io.BytesIO(b) if b is not None else None)
PY
  reseal "$d"
  expect_fail "sealed tar missing an $what" "$d" images
done

echo "== R3: a changed migration (ledger checksum mismatch) is refused before the current smoke test"
fixture 4 no
FP -c "UPDATE app.schema_migrations SET checksum = repeat('0',64) WHERE version = 2" >/dev/null
backup >/dev/null
expect_fail 'ledger checksum mismatch' "$(latest_dump)" upgrade

echo "== R2: snapshot/archive consistency"
fixture 7 images
n_before="$(find "$B" -name '*.manifest.json' | wc -l | tr -d ' ')"
victim="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))[0]["path"])' "$W/refs.json")"
# The OLD delete path: row and file removed between snapshot and archive.
out="$(FRAY_BACKUP_TEST_AFTER_SNAPSHOT="$PODMAN exec -i $FX psql -XqAt -U postgres -d fray -c \"DELETE FROM app.image_assets WHERE storage_path='$victim'\" >/dev/null && $PODMAN run --rm --network none -v $FV:/a --entrypoint rm $PG_IMAGE -f /a/$victim /a/$victim.display.webp" backup 2>&1)" && bad 'old delete path: backup succeeded' || true
n_after="$(find "$B" -name '*.manifest.json' | wc -l | tr -d ' ')"
if grep -q 'BACKUP_FAIL' <<<"$out" && [[ "$n_before" == "$n_after" ]] && [[ -z "$(find "$B" -name '.*partial')" ]]; then
  ok "file removed between snapshot and archive: $(grep -Eo 'BACKUP_FAIL: [^(]*' <<<"$out" | head -1)— nothing published"
else
  bad "file removed between snapshot and archive was not caught"
fi
# The CURRENT app paths during a backup: delete (row only), upload (new files + row), refresh (touch).
fixture 7 images
victim="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))[0]["path"])' "$W/refs.json")"
hook="$PODMAN exec -i $FX psql -XqAt -U postgres -d fray -c \"DELETE FROM app.image_assets WHERE storage_path='$victim'\" >/dev/null"
hook="$hook && $PODMAN run --rm --network none -v $FV:/a --entrypoint touch $PG_IMAGE /a/$victim"
out="$(FRAY_BACKUP_TEST_AFTER_SNAPSHOT="$hook" backup 2>&1)" || true
add_images 1 >/dev/null # an upload after the archive started is simply not part of this set
if grep -q BACKUP_OK <<<"$out"; then
  rout="$(restore "$(latest_dump)")" || true
  if grep -q 'IMAGES_RESTORED_PASS files=2' <<<"$rout" && receipt_is PASS -; then
    ok "delete + refresh during backup: set restores both captured references (fresh volume, checksums, decode, owner scope)"
  else
    bad "delete during backup: restore $(grep -E 'FAIL' <<<"$rout" | head -1)"
  fi
else
  bad "delete during backup: backup failed: $(grep -E 'FAIL|BLOCKED' <<<"$out" | head -1)"
fi

echo "== R2: the collector removes only unreferenced files past the grace period"
files() { "$PODMAN" run --rm --network none -v "$FV":/a:ro --entrypoint sh "$PG_IMAGE" -c 'cd /a && find . -type f | wc -l' | tr -d ' '; }
total="$(files)"                                                                                                                         # 3 referenced images (6 files) + the deleted one (2 files)
"$PODMAN" run --rm --network none -v "$FV":/a --entrypoint sh "$PG_IMAGE" -c "touch -d '3 hours ago' /a/$victim /a/$victim.display.webp" # aged out
out="$(backup 2>&1)"
gc="$(grep -Eo 'IMAGE_GC removed=[0-9]+' <<<"$out")"
left="$(files)"
if [[ "$gc" == "IMAGE_GC removed=2" && "$left" == $((total - 2)) ]] && grep -q BACKUP_OK <<<"$out"; then
  ok "unreferenced aged files collected ($gc); $left referenced files kept; backup verified"
else
  bad "collector: $gc, files $total -> $left"
fi
# A just-deleted (young) unreferenced file survives the next backup.
young="$(FP -c "SELECT storage_path FROM app.image_assets ORDER BY created_at DESC LIMIT 1")"
FP -c "DELETE FROM app.image_assets WHERE storage_path='$young'" >/dev/null
out="$(backup 2>&1)"
if grep -q 'IMAGE_GC removed=0' <<<"$out" && [[ "$(files)" == "$left" ]]; then ok "unreferenced file younger than the grace period kept"; else bad "young unreferenced file collected"; fi

echo "== Status: only complete v2 receipts count; failures are reported"
st="$(FRAY_BACKUP_DIR="$B" bash "$repo/scripts/backup-status.sh" 2>&1 || true)"
grep -q 'complete set (database + images)' <<<"$st" && grep -q 'INDEPENDENT RESTORE OF LAST BACKUP SET: NOT RECORDED' <<<"$st" && ok "backup-status: complete set, independent restore NOT RECORDED" || bad "backup-status output: $st"
pass_on_fail="$(
  python3 - "$B/restore-tests" <<'PY'
import json,pathlib,sys
print(sum(1 for p in pathlib.Path(sys.argv[1]).glob('*.json') if (r:=json.loads(p.read_text()))['result']=='PASS' and any(s['result']=='FAIL' for s in r['stages'])))
PY
)"
[[ "$pass_on_fail" == 0 ]] && ok "no receipt says PASS with a failed stage" || bad "$pass_on_fail PASS receipt(s) contain a failed stage"

live_after="$(live_fp)"
[[ "$live_before" == "$live_after" ]] && ok "live database, live image volume and real backup directory unchanged" || bad "live state changed during the probe"
echo "P15_RECOVERY_MATRIX pass=$pass fail=$failn"
[[ "$failn" == 0 ]]
