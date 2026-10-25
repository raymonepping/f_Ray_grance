-- F-Ray-grance 0002: idempotent collection creation (expand-only, no data change).
-- A client-generated request id makes "Add to collection" safe to retry: the same
-- id for the same owner returns the existing entry instead of a duplicate.
ALTER TABLE app.collection_entries ADD COLUMN client_request_id uuid;
CREATE UNIQUE INDEX collection_entries_client_request_key
  ON app.collection_entries (owner_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
