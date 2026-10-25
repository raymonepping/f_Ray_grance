#!/usr/bin/env bash
# Remove a SYNTHETIC test owner and all of its rows from the live database.
# Collection history is append-only by design (triggers forbid deletes), so this is an
# operator-only tool: superuser via the local socket, one transaction, triggers
# suspended for this session only, and it refuses anything but test usernames.
#   purge-synthetic-owner.sh <e2e-xxxxxx|probe-xxxxxx>
set -euo pipefail
user="${1:?username required}"
[[ "$user" =~ ^(e2e|probe)-[0-9a-f]{6}$ ]] || {
  echo "REFUSED: '$user' is not a synthetic test owner (e2e-/probe- + 6 hex)" >&2
  exit 2
}
# Image files used only by this owner (content-addressed files can be shared with other records).
images="$(podman exec -i fray-postgres psql -X -q -At -v ON_ERROR_STOP=1 -v u="$user" -U postgres -d fray <<'SQL'
SELECT DISTINCT i.storage_path FROM app.image_assets i JOIN app.owners o ON o.id = i.owner_id
 WHERE o.username = :'u' AND i.storage_path IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM app.image_assets j JOIN app.owners p ON p.id = j.owner_id WHERE j.storage_path = i.storage_path AND p.username <> :'u');
SQL
)"
podman exec -i fray-postgres psql -X -q -v ON_ERROR_STOP=1 -v u="$user" -U postgres -d fray <<'SQL'
BEGIN;
SET LOCAL session_replication_role = replica; -- suspends the append-only triggers for THIS transaction only
WITH o AS (SELECT id FROM app.owners WHERE username = :'u'),
     e AS (SELECT id FROM app.collection_entries WHERE owner_id IN (SELECT id FROM o)),
     d1 AS (DELETE FROM app.collection_events WHERE entry_id IN (SELECT id FROM e) RETURNING 1),
     d2 AS (DELETE FROM app.collection_entries WHERE id IN (SELECT id FROM e) RETURNING 1),
     d3 AS (DELETE FROM app.seasonal_preferences WHERE owner_id IN (SELECT id FROM o) RETURNING 1),
     d4 AS (DELETE FROM app.season_fragrances WHERE owner_id IN (SELECT id FROM o) RETURNING 1),
     d5 AS (DELETE FROM app.sessions WHERE owner_id IN (SELECT id FROM o) RETURNING 1),
     d6 AS (DELETE FROM app.owner_credentials WHERE owner_id IN (SELECT id FROM o) RETURNING 1),
     d7 AS (UPDATE app.source_claims SET corrected_by_owner=NULL WHERE corrected_by_owner IN (SELECT id FROM o) RETURNING 1),
     x AS (SELECT id FROM app.training_exercises WHERE owner_id IN (SELECT id FROM o)),
     d8 AS (DELETE FROM app.training_observations WHERE exercise_id IN (SELECT id FROM x) RETURNING 1),
     d9 AS (DELETE FROM app.academy_progress WHERE owner_id IN (SELECT id FROM o) RETURNING 1)
SELECT (SELECT count(*) FROM d1) AS events, (SELECT count(*) FROM d2) AS entries,
       (SELECT count(*) FROM d3) + (SELECT count(*) FROM d4) AS season_rows, (SELECT count(*) FROM d5) AS sessions,
       (SELECT count(*) FROM d8) + (SELECT count(*) FROM d9) AS academy_rows;
-- Exercises after their observations (data-modifying CTEs share one snapshot).
DELETE FROM app.training_exercises WHERE owner_id IN (SELECT id FROM app.owners WHERE username = :'u');
DELETE FROM app.image_assets WHERE owner_id IN (SELECT id FROM app.owners WHERE username = :'u');
DELETE FROM app.login_attempts WHERE username = :'u';
DELETE FROM app.owners WHERE username = :'u';
COMMIT;
SQL
n=0
for rel in $images; do
  [[ "$rel" =~ ^[0-9a-f]{2}/[0-9a-f]{64}$ ]] || continue
  podman exec fray-api rm -f "/var/lib/fray/images/$rel" "/var/lib/fray/images/$rel.display.webp" && n=$((n + 1))
done
echo "PURGED synthetic owner $user (image files removed: $n)"
