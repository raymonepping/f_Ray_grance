#!/usr/bin/env bash
# EMPTY (never delete) the personal data of one owner, or of every owner, so the app can start from
# scratch. The owner account and its password stay; the schema, migrations, shared catalogue
# (fragrances, source observations, embeddings) and Vault are untouched.
#
# Emptied per owner: collection entries and their append-only history, ratings and private notes,
# seasonal profiles and fragrance seasons, Academy progress, Train My Nose exercises and
# observations, perfume images (metadata and files used only by that owner), the removal log, the owner's own
# catalogue corrections, sessions (sign in again afterwards) and login-attempt counters.
#
# Safety: prints what will be emptied, requires typing the confirmation phrase, then takes a fresh
# `make backup` (abort on failure) before anything is emptied. One transaction; append-only triggers are suspended for
# that transaction only, as in scripts/purge-synthetic-owner.sh.
#   purge-owner-data.sh <username>        confirm with: EMPTY <username>
#   purge-owner-data.sh --all             confirm with: EMPTY ALL OWNERS
# CONFIRM="<phrase>" answers the prompt non-interactively (scripted drills); it must still match.
set -euo pipefail
PODMAN="${PODMAN:-podman}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:-}"
[[ -n "$target" ]] || {
  echo 'Usage: make purge USERNAME=<name>   |   make purge ALL=YES' >&2
  exit 2
}
psqlq() { "$PODMAN" exec -i fray-postgres psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d fray "$@"; }
[[ "$("$PODMAN" inspect --format '{{.State.Running}}' fray-postgres 2>/dev/null)" == true ]] || {
  echo 'BLOCKED: fray-postgres not running' >&2
  exit 2
}

if [[ "$target" == --all ]]; then
  phrase='EMPTY ALL OWNERS'
  mapfile -t users < <(psqlq -c 'SELECT username FROM app.owners ORDER BY username')
else
  [[ "$target" =~ ^[a-z0-9][a-z0-9._-]{1,63}$ ]] || {
    echo "REFUSED: '$target' is not a valid username" >&2
    exit 2
  }
  phrase="EMPTY $target"
  mapfile -t users < <(psqlq -v u="$target" <<<"SELECT username FROM app.owners WHERE username = :'u'")
fi
((${#users[@]})) || {
  echo "REFUSED: no such owner: $target" >&2
  exit 2
}

summary() {
  psqlq -v u="$1" <<'SQL'
WITH o AS (SELECT id FROM app.owners WHERE username = :'u')
SELECT format('  %-20s entries=%s history=%s seasons=%s academy=%s practice=%s images=%s corrections=%s sessions=%s', :'u',
  (SELECT count(*) FROM app.collection_entries WHERE owner_id IN (SELECT id FROM o)),
  (SELECT count(*) FROM app.collection_events WHERE entry_id IN (SELECT id FROM app.collection_entries WHERE owner_id IN (SELECT id FROM o))),
  (SELECT count(*) FROM app.seasonal_preferences WHERE owner_id IN (SELECT id FROM o)) + (SELECT count(*) FROM app.season_fragrances WHERE owner_id IN (SELECT id FROM o)),
  (SELECT count(*) FROM app.academy_progress WHERE owner_id IN (SELECT id FROM o)),
  (SELECT count(*) FROM app.training_exercises WHERE owner_id IN (SELECT id FROM o)),
  (SELECT count(*) FROM app.image_assets WHERE owner_id IN (SELECT id FROM o)),
  (SELECT count(*) FROM app.source_claims WHERE origin = 'user' AND corrected_by_owner IN (SELECT id FROM o)),
  (SELECT count(*) FROM app.sessions WHERE owner_id IN (SELECT id FROM o)));
SQL
}

echo 'F-Ray-grance purge: personal data that will be EMPTIED (accounts and passwords are kept):'
for u in "${users[@]}"; do summary "$u"; done
echo 'Kept: owner accounts, schema, shared catalogue, source observations, embeddings, Vault.'

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

for u in "${users[@]}"; do
  # Image files used only by this owner (content-addressed files can be shared).
  images="$(
    psqlq -v u="$u" <<'SQL'
SELECT DISTINCT i.storage_path FROM app.image_assets i JOIN app.owners o ON o.id = i.owner_id
 WHERE o.username = :'u' AND i.storage_path IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM app.image_assets j JOIN app.owners p ON p.id = j.owner_id WHERE j.storage_path = i.storage_path AND p.username <> :'u');
SQL
  )"
  psqlq -v u="$u" <<'SQL'
BEGIN;
SET LOCAL session_replication_role = replica; -- suspends the append-only triggers for THIS transaction only
CREATE TEMP TABLE purge_owner ON COMMIT DROP AS SELECT id FROM app.owners WHERE username = :'u';
CREATE TEMP TABLE purge_entries ON COMMIT DROP AS SELECT id FROM app.collection_entries WHERE owner_id IN (SELECT id FROM purge_owner);
CREATE TEMP TABLE purge_claims ON COMMIT DROP AS
  SELECT id FROM app.source_claims WHERE origin = 'user' AND corrected_by_owner IN (SELECT id FROM purge_owner);
DELETE FROM app.training_observations WHERE exercise_id IN (SELECT id FROM app.training_exercises WHERE owner_id IN (SELECT id FROM purge_owner));
DELETE FROM app.training_exercises WHERE owner_id IN (SELECT id FROM purge_owner);
DELETE FROM app.academy_progress WHERE owner_id IN (SELECT id FROM purge_owner);
DELETE FROM app.collection_events WHERE entry_id IN (SELECT id FROM purge_entries);
DELETE FROM app.collection_entries WHERE id IN (SELECT id FROM purge_entries);
DELETE FROM app.seasonal_preferences WHERE owner_id IN (SELECT id FROM purge_owner);
DELETE FROM app.season_fragrances WHERE owner_id IN (SELECT id FROM purge_owner);
DELETE FROM app.image_assets WHERE owner_id IN (SELECT id FROM purge_owner);
DELETE FROM app.deletion_log WHERE owner_id IN (SELECT id FROM purge_owner);
-- The owner's own catalogue corrections (and the pyramid notes they produced); provider data stays.
DELETE FROM app.fragrance_notes WHERE source_claim_id IN (SELECT id FROM purge_claims);
DELETE FROM app.source_claims WHERE id IN (SELECT id FROM purge_claims);
DELETE FROM app.sessions WHERE owner_id IN (SELECT id FROM purge_owner);
DELETE FROM app.login_attempts WHERE username = :'u';
COMMIT;
SQL
  # Image files are not removed here: they are content-addressed and may be shared with another
  # owner. `make backup` collects unreferenced files under its lock (ADR-016).
  n=$(wc -w <<<"$images" | tr -d ' ')
  left="$(summary "$u")"
  echo "$left"
  [[ "$left" =~ entries=0\ history=0\ seasons=0\ academy=0\ practice=0\ images=0\ corrections=0\ sessions=0 ]] || {
    echo "PURGE_INCOMPLETE: $u still has rows (see above)" >&2
    exit 1
  }
  echo "PURGE_OK $u (account kept; image records removed: $n, files collected by the next make backup; sign in again)"
done
