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
     d6 AS (DELETE FROM app.owner_credentials WHERE owner_id IN (SELECT id FROM o) RETURNING 1)
SELECT (SELECT count(*) FROM d1) AS events, (SELECT count(*) FROM d2) AS entries,
       (SELECT count(*) FROM d3) + (SELECT count(*) FROM d4) AS season_rows, (SELECT count(*) FROM d5) AS sessions;
DELETE FROM app.login_attempts WHERE username = :'u';
DELETE FROM app.owners WHERE username = :'u';
COMMIT;
SQL
echo "PURGED synthetic owner $user"
