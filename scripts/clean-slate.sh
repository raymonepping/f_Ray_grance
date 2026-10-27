#!/usr/bin/env bash
# CLEAN SLATE (ADR-017): empty everything recorded in the database so the app starts from scratch.
#
# Kept: owner accounts and passwords, the migration ledger, the migration-seeded lesson list.
# Emptied: personal data of EVERY owner (collection and history, ratings, notes, seasons, Academy
# progress, practice, image records, removal log, sessions, login counters) AND the shared catalogue
# (fragrances, brands, variants, source observations and claims, notes, note dictionary, trait
# scores, embeddings). Schema, Vault, containers and the image volume are untouched; image files
# become unreferenced and are collected by the next `make backup` (ADR-016).
#
# Safety: every table in schema app must be classified below (an unclassified table refuses before
# any change); prints row counts; requires typing CLEAN SLATE; takes a fresh `make backup` first and
# aborts if it fails; one transaction, with only the append-only history trigger disabled inside it
# (foreign-key checks stay on); verifies the result.
#   clean-slate.sh                  operator run (CONFIRM="CLEAN SLATE" for scripted drills)
#   clean-slate.sh --mark <file>    E2E: record the catalogue before a test run
#   clean-slate.sh --undo <file>    E2E: remove the catalogue rows added since the mark that nothing references
set -euo pipefail
PODMAN="${PODMAN:-podman}"
PGC="${FRAY_PG_CONTAINER:-fray-postgres}"
export FRAY_PG_CONTAINER="$PGC"
repo="$(cd "$(dirname "$0")/.." && pwd)"
psqlq() { "$PODMAN" exec -i "$PGC" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d fray "$@"; }
[[ "$("$PODMAN" inspect --format '{{.State.Running}}' "$PGC" 2>/dev/null)" == true ]] || {
  echo "BLOCKED: $PGC not running" >&2
  exit 2
}

KEEP=(academy_lessons owner_credentials owners schema_migrations)
# Children before parents (foreign-key order).
EMPTY=(training_observations training_exercises academy_progress collection_events image_assets
  season_fragrances seasonal_preferences deletion_log collection_entries sessions login_attempts
  fragrance_embeddings fragrance_trait_scores fragrance_notes source_claims product_variants
  fragrances brands source_records note_dictionary)

# Catalogue rows a test run added, and nothing references (E2E teardown).
UNDO_SQL=$(
  cat <<'SQL'
BEGIN;
CREATE TEMP TABLE mk ON COMMIT DROP AS SELECT :'mark'::jsonb AS j;
CREATE TEMP TABLE added ON COMMIT DROP AS
  SELECT f.id FROM app.fragrances f
   WHERE f.id::text NOT IN (SELECT jsonb_array_elements_text(j->'fragrances') FROM mk)
     AND NOT EXISTS (SELECT 1 FROM app.collection_entries x WHERE x.fragrance_id = f.id)
     AND NOT EXISTS (SELECT 1 FROM app.season_fragrances x WHERE x.fragrance_id = f.id)
     AND NOT EXISTS (SELECT 1 FROM app.image_assets x WHERE x.fragrance_id = f.id)
     AND NOT EXISTS (SELECT 1 FROM app.deletion_log x WHERE x.fragrance_id = f.id)
     AND NOT EXISTS (SELECT 1 FROM app.source_claims x WHERE x.fragrance_id = f.id AND x.origin = 'user');
DELETE FROM app.fragrance_embeddings WHERE fragrance_id IN (SELECT id FROM added);
DELETE FROM app.fragrance_trait_scores WHERE fragrance_id IN (SELECT id FROM added);
DELETE FROM app.fragrance_notes WHERE fragrance_id IN (SELECT id FROM added);
DELETE FROM app.source_claims WHERE fragrance_id IN (SELECT id FROM added);
DELETE FROM app.product_variants WHERE fragrance_id IN (SELECT id FROM added);
DELETE FROM app.fragrances WHERE id IN (SELECT id FROM added);
DELETE FROM app.brands b WHERE b.id::text NOT IN (SELECT jsonb_array_elements_text(j->'brands') FROM mk)
   AND NOT EXISTS (SELECT 1 FROM app.fragrances f WHERE f.brand_id = b.id);
DELETE FROM app.source_records r WHERE r.id::text NOT IN (SELECT jsonb_array_elements_text(j->'source_records') FROM mk)
   AND NOT EXISTS (SELECT 1 FROM app.source_claims c WHERE c.source_record_id = r.id);
DELETE FROM app.note_dictionary n WHERE n.id::text NOT IN (SELECT jsonb_array_elements_text(j->'note_dictionary') FROM mk)
   AND NOT EXISTS (SELECT 1 FROM app.fragrance_notes x WHERE x.note_id = n.id);
SELECT 'CATALOGUE_UNDO fragrances_removed=' || count(*) FROM added;
COMMIT;
SQL
)

case "${1:-}" in
--mark)
  out="${2:?--mark <file>}"
  umask 077
  psqlq -c "SELECT json_build_object(
      'fragrances', (SELECT coalesce(json_agg(id), '[]') FROM app.fragrances),
      'brands', (SELECT coalesce(json_agg(id), '[]') FROM app.brands),
      'source_records', (SELECT coalesce(json_agg(id), '[]') FROM app.source_records),
      'note_dictionary', (SELECT coalesce(json_agg(id), '[]') FROM app.note_dictionary))" >"$out"
  echo "CATALOGUE_MARK $(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["fragrances"]))' "$out") fragrances"
  exit 0
  ;;
--undo)
  in="${2:?--undo <file>}"
  [[ -s "$in" ]] || {
    echo 'REFUSED: no catalogue mark; nothing removed' >&2
    exit 2
  }
  psqlq -v mark="$(cat "$in")" <<<"$UNDO_SQL"
  exit 0
  ;;
"") ;;
*)
  echo 'Usage: make clean-slate' >&2
  exit 2
  ;;
esac

# 1. Every table is classified, before anything else.
actual="$(psqlq -c "SELECT relname FROM pg_class WHERE relnamespace = 'app'::regnamespace AND relkind IN ('r','p') ORDER BY 1")"
known="$(printf '%s\n' "${KEEP[@]}" "${EMPTY[@]}" | sort)"
if [[ "$actual" != "$known" ]]; then
  echo 'REFUSED: the tables in schema app do not match the clean-slate classification; nothing was emptied.' >&2
  diff <(echo "$known") <(echo "$actual") | sed -n 's/^> /  unclassified: /p; s/^< /  missing: /p' >&2
  exit 2
fi

count() { psqlq -c "SELECT count(*) FROM app.$1"; }
echo 'F-Ray-grance CLEAN SLATE: everything below is EMPTIED, for every owner:'
for t in "${EMPTY[@]}"; do printf '  %-24s %s\n' "$t" "$(count "$t")"; done
echo 'Kept:'
declare -A kept
for t in "${KEEP[@]}"; do
  kept[$t]="$(count "$t")"
  printf '  %-24s %s\n' "$t" "${kept[$t]}"
done
echo 'Also kept: the schema, Vault, containers and the image volume (unreferenced files are collected by the next make backup).'

phrase='CLEAN SLATE'
answer="${CONFIRM:-}"
if [[ -z "$answer" ]]; then
  [[ -t 0 ]] || {
    echo "BLOCKED: no terminal for confirmation; set CONFIRM=\"$phrase\"" >&2
    exit 2
  }
  read -r -p "Type \"$phrase\" to continue: " answer
fi
[[ "$answer" == "$phrase" ]] || {
  echo 'REFUSED: confirmation phrase did not match; nothing was emptied' >&2
  exit 2
}

echo 'Taking a fresh manual backup first...'
bash "$repo/scripts/backup.sh" | grep -E 'BACKUP_OK|IMAGES_OK' || {
  echo 'BLOCKED: backup failed; nothing was emptied' >&2
  exit 1
}

{
  echo 'BEGIN;'
  # The only path besides app.remove_collection_entry() that may delete history: this transaction.
  echo 'ALTER TABLE app.collection_events DISABLE TRIGGER collection_events_append_only;'
  for t in "${EMPTY[@]}"; do echo "DELETE FROM app.$t;"; done
  echo 'ALTER TABLE app.collection_events ENABLE TRIGGER collection_events_append_only;'
  echo 'COMMIT;'
} | psqlq >/dev/null

bad=0
for t in "${EMPTY[@]}"; do [[ "$(count "$t")" == 0 ]] || {
  echo "  still has rows: $t" >&2
  bad=1
}; done
for t in "${KEEP[@]}"; do [[ "$(count "$t")" == "${kept[$t]}" ]] || {
  echo "  kept table changed: $t" >&2
  bad=1
}; done
[[ "$(psqlq -c "SELECT tgenabled FROM pg_trigger WHERE tgname = 'collection_events_append_only'")" == O ]] || {
  echo '  history trigger not re-enabled' >&2
  bad=1
}
((bad == 0)) || {
  echo 'CLEAN_SLATE_INCOMPLETE (see above)' >&2
  exit 1
}
echo "CLEAN_SLATE_OK ${#EMPTY[@]} tables emptied; accounts kept (${kept[owners]} owner(s)); sign in again with the same password."
