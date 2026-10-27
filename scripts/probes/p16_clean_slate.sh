#!/usr/bin/env bash
# Phase 16 clean-slate probe (ADR-017). Runs `scripts/clean-slate.sh` against an ISOLATED,
# network-less restore of a private copy of the latest real backup (via restore-test's quarantine
# mode), never against fray-postgres. Checks: wrong phrase refuses, an unclassified table refuses,
# a run empties every emptied table and keeps accounts/ledger/lessons, a backup is taken first, and
# the E2E catalogue mark/undo removes only unreferenced rows added after the mark. The live
# database, live image volume and real backup directory are fingerprinted before and after.
set -euo pipefail
PODMAN="${PODMAN:-podman}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
PG_IMAGE="${PG_IMAGE:-$(awk '/^PG_IMAGE/ {print $3}' "$repo/infra/versions.mk")}"
REAL="${FRAY_BACKUP_DIR:-$HOME/F-Ray-grance-backups}"
export PODMAN PG_IMAGE
W="$(mktemp -d "${TMPDIR:-/tmp}/fray-p16.XXXXXX")"
B="$W/backups"
mkdir -p "$B"
chmod 700 "$W" "$B"
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
    ls -l "$REAL" | sort
  } | shasum -a 256 | cut -d' ' -f1
}
live_before="$(live_fp)"
Q=""
QV=""
cleanup() {
  [[ -n "$Q" ]] && "$PODMAN" rm -f "$Q" >/dev/null 2>&1 || true
  [[ -n "$QV" ]] && "$PODMAN" volume rm -f "$QV" >/dev/null 2>&1 || true
  rm -rf "$W"
}
trap cleanup EXIT

# A private copy of the latest real backup set, restored into a retained, network-less target.
src="$(find "$REAL" -maxdepth 1 -name 'fray-*.dump' | sort | tail -1)"
for ext in dump manifest.json images.tar images.json; do
  [[ -f "${src%.dump}.$ext" ]] && cp "${src%.dump}.$ext" "$B/"
done
out="$(FRAY_BACKUP_DIR="$B" bash "$repo/scripts/restore-test.sh" "$B/$(basename "$src")" retain-validated 2>&1)"
Q="$(grep -Eo 'target=fray-restoretest-[0-9TZ]+' <<<"$out" | cut -d= -f2)"
QV="$(grep -Eo 'assets=fray-restoretest-assets-[0-9TZ]+' <<<"$out" | cut -d= -f2)"
[[ -n "$Q" ]] || {
  echo "$out" | tail -5
  echo 'P16_CLEAN_SLATE could not stage an isolated copy'
  exit 1
}
echo "== isolated copy of $(basename "$src") in $Q (network none)"
QP() { "$PODMAN" exec -i "$Q" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d fray "$@"; }
CS() { FRAY_PG_CONTAINER="$Q" FRAY_BACKUP_DIR="$B" FRAY_IMAGE_VOLUME="${QV:-fray-p16-none}" bash "$repo/scripts/clean-slate.sh" "$@" 2>&1; }
# Rows for personal tables that were empty in the copy, so every emptied table holds data.
QP >/dev/null <<'SQL'
INSERT INTO app.deletion_log(owner_id,kind,fragrance_id,subject_id,summary)
  SELECT o.id,'collection_entry',f.id,gen_random_uuid(),'{"events":0}' FROM app.owners o, app.fragrances f LIMIT 1;
INSERT INTO app.image_assets(owner_id,fragrance_id,source_kind,source_ref,attribution_label,storage_kind,status,failure_code)
  SELECT o.id,f.id,'manual_external','https://images.example.invalid/p16.jpg','Synthetic','remote_reference','failed','HTTP_ERROR'
    FROM app.owners o, app.fragrances f LIMIT 1;
SQL
nonempty="$(QP -c "SELECT string_agg(relname, ' ') FROM pg_class c WHERE relnamespace='app'::regnamespace AND relkind='r' AND (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM app.%I', relname), false, true, '')))[1]::text::int > 0")"
echo "   tables with rows before: $(wc -w <<<"$nonempty" | tr -d ' ')"
snap() { QP <"$repo/scripts/sql/table_fingerprints.sql"; }
creds_before="$(QP -c "SELECT md5(string_agg(o.username || c::text, ',' ORDER BY o.username)) FROM app.owners o JOIN app.owner_credentials c ON c.owner_id = o.id")"

echo "== guard rails"
s0="$(snap)"
o="$(CONFIRM='clean slate' CS)" && bad 'wrong phrase: exited 0' || true
grep -q 'REFUSED: confirmation phrase did not match' <<<"$o" && [[ "$(snap)" == "$s0" ]] && ok 'wrong phrase refused; nothing emptied' || bad "wrong phrase: $o"
QP -c 'CREATE TABLE app.p16_unclassified (x int)' >/dev/null
o="$(CONFIRM='CLEAN SLATE' CS)" && bad 'unclassified table: exited 0' || true
QP -c 'DROP TABLE app.p16_unclassified' >/dev/null
grep -q 'unclassified: p16_unclassified' <<<"$o" && [[ "$(snap)" == "$s0" ]] && ok 'unclassified table refused before any change' || bad "unclassified: $o"
n_backups="$(find "$B" -maxdepth 1 -name '*.manifest.json' | wc -l | tr -d ' ')"
[[ "$(find "$B" -maxdepth 1 -name '*.manifest.json' | wc -l | tr -d ' ')" == "$n_backups" ]] && ok 'refusals took no backup and changed nothing' || bad 'refusal wrote a backup'

echo "== clean slate"
o="$(CONFIRM='CLEAN SLATE' CS)" || true
if grep -q CLEAN_SLATE_OK <<<"$o"; then ok "$(grep -o 'CLEAN_SLATE_OK.*' <<<"$o")"; else bad "run: $(tail -3 <<<"$o")"; fi
[[ "$(find "$B" -maxdepth 1 -name '*.manifest.json' | wc -l | tr -d ' ')" == $((n_backups + 1)) ]] && grep -q BACKUP_OK <<<"$o" && ok 'a complete backup was taken first' || bad 'no backup before emptying'
left="$(QP -c "SELECT string_agg(relname || '=' || n, ' ' ORDER BY relname) FROM (SELECT relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM app.%I', relname), false, true, '')))[1]::text::int n FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r') s WHERE n > 0")"
[[ "$(tr ' ' '\n' <<<"$left" | cut -d= -f1 | sort | tr '\n' ' ')" == 'academy_lessons owner_credentials owners schema_migrations ' ]] && ok "only kept tables have rows: $left" || bad "rows left: $left"
[[ "$(QP -c "SELECT md5(string_agg(o.username || c::text, ',' ORDER BY o.username)) FROM app.owners o JOIN app.owner_credentials c ON c.owner_id = o.id")" == "$creds_before" ]] && ok 'owner accounts and password hashes unchanged (sign-in still works)' || bad 'credentials changed'
[[ "$(QP -c "SELECT tgenabled FROM pg_trigger WHERE tgname='collection_events_append_only'")" == O ]] && ok 'append-only history trigger re-enabled' || bad 'history trigger left disabled'

echo "== E2E catalogue mark/undo"
QP >/dev/null <<'SQL'
INSERT INTO app.brands(canonical_name) VALUES ('P16 Before');
INSERT INTO app.fragrances(brand_id,canonical_name) SELECT id,'P16 Before Mark' FROM app.brands WHERE canonical_name='P16 Before';
SQL
CS --mark "$W/mark.json" >/dev/null
QP >/dev/null <<'SQL'
INSERT INTO app.brands(canonical_name) VALUES ('P16 Added'),('P16 Kept');
INSERT INTO app.fragrances(brand_id,canonical_name) SELECT id,'P16 Unreferenced' FROM app.brands WHERE canonical_name='P16 Added';
INSERT INTO app.fragrances(brand_id,canonical_name) SELECT id,'P16 In A Collection' FROM app.brands WHERE canonical_name='P16 Kept';
INSERT INTO app.source_records(provider,external_id) VALUES ('scento','p16-unreferenced');
INSERT INTO app.source_claims(fragrance_id,source_record_id,origin,field_name,value)
  SELECT f.id,r.id,'provider','pyramid','{"top":["P16 Note"]}' FROM app.fragrances f, app.source_records r
   WHERE f.canonical_name='P16 Unreferenced' AND r.external_id='p16-unreferenced';
INSERT INTO app.note_dictionary(display_name) VALUES ('P16 Note');
INSERT INTO app.fragrance_notes(fragrance_id,note_id,tier,source_claim_id,original_label)
  SELECT f.id,n.id,'top',c.id,'P16 Note' FROM app.fragrances f, app.note_dictionary n, app.source_claims c
   WHERE f.canonical_name='P16 Unreferenced' AND n.display_name='P16 Note' AND c.fragrance_id=f.id;
INSERT INTO app.collection_entries(owner_id,fragrance_id,state)
  SELECT o.id,f.id,'owned' FROM app.owners o, app.fragrances f WHERE f.canonical_name='P16 In A Collection' LIMIT 1;
SQL
o="$(CS --undo "$W/mark.json")"
names="$(QP -c "SELECT string_agg(canonical_name, ', ' ORDER BY canonical_name) FROM app.fragrances")"
rest="$(QP -c "SELECT (SELECT count(*) FROM app.source_records)||'/'||(SELECT count(*) FROM app.source_claims)||'/'||(SELECT count(*) FROM app.note_dictionary)||'/'||(SELECT string_agg(canonical_name, ',' ORDER BY canonical_name) FROM app.brands)")"
if [[ "$names" == 'P16 Before Mark, P16 In A Collection' && "$rest" == '0/0/0/P16 Before,P16 Kept' ]] && grep -q 'fragrances_removed=1' <<<"$o"; then
  ok 'undo removed only the unreferenced rows added after the mark (fragrance, claim, record, note, brand)'
else
  bad "undo left: fragrances=[$names] records/claims/notes/brands=$rest ($o)"
fi
o="$(CS --undo "$W/missing.json" 2>&1)" && bad 'undo without a mark exited 0' || ok 'undo without a mark refuses'

live_after="$(live_fp)"
[[ "$live_before" == "$live_after" ]] && ok 'live database, live image volume and real backup directory unchanged' || bad 'live state changed during the probe'
echo "P16_CLEAN_SLATE pass=$pass fail=$failn"
[[ "$failn" == 0 ]]
