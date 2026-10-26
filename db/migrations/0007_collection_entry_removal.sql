-- F-Ray-grance 0007: owner-requested permanent removal of a collection entry (DATA_PERSISTENCE:
-- "a user-authorized permanent deletion is explicit, previewed and logged"). Expand-only.
-- History stays append-only for every other path: the trigger exemption below applies only inside
-- app.remove_collection_entry(), which runs as the table owner, for that one entry, in that one
-- transaction. The runtime login cannot assume the owner role, so it cannot use the exemption.
-- fray:allow-destructive DELETE/UPDATE appear only inside app.remove_collection_entry(), which runs solely on an explicit, previewed owner request; this migration itself deletes and updates nothing.

CREATE TABLE app.deletion_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES app.owners (id) ON DELETE RESTRICT,
  kind         text NOT NULL CHECK (kind IN ('collection_entry')),
  fragrance_id uuid REFERENCES app.fragrances (id) ON DELETE RESTRICT,
  subject_id   uuid NOT NULL,
  -- Counts and flags only: never the removed note, rating value or history text.
  summary      jsonb NOT NULL CHECK (jsonb_typeof(summary) = 'object'),
  deleted_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deletion_log_owner_idx ON app.deletion_log (owner_id, deleted_at);

CREATE OR REPLACE FUNCTION app.forbid_history_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- The single exemption: owner-requested removal of one entry via app.remove_collection_entry().
  IF TG_OP = 'DELETE' AND current_user = 'fray_owner'
     AND current_setting('fray.removing_entry', true) = OLD.entry_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'collection_events is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

-- What a removal would delete (counts only). NULL when the entry is not this owner's.
CREATE FUNCTION app.collection_entry_removal_preview(p_owner uuid, p_entry uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
           'state', e.state,
           'events', (SELECT count(*) FROM app.collection_events v WHERE v.entry_id = e.id),
           'hasRating', e.rating IS NOT NULL,
           'hasNote', e.personal_note IS NOT NULL AND e.personal_note <> '',
           'practice', (SELECT count(*) FROM app.training_exercises x WHERE x.entry_id = e.id AND x.owner_id = p_owner))
    FROM app.collection_entries e
   WHERE e.id = p_entry AND e.owner_id = p_owner
$$;

-- Removes one entry and its history in one transaction; linked practice is kept as generic
-- blotter practice; a deletion_log row records what was removed. NULL when not this owner's.
CREATE FUNCTION app.remove_collection_entry(p_owner uuid, p_entry uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
DECLARE
  e app.collection_entries;
  summary jsonb;
BEGIN
  SELECT * INTO e FROM app.collection_entries WHERE id = p_entry AND owner_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  summary := app.collection_entry_removal_preview(p_owner, p_entry);
  UPDATE app.training_exercises SET entry_id = NULL WHERE entry_id = p_entry AND owner_id = p_owner;
  PERFORM set_config('fray.removing_entry', p_entry::text, true);
  DELETE FROM app.collection_events WHERE entry_id = p_entry;
  PERFORM set_config('fray.removing_entry', '', true);
  DELETE FROM app.collection_entries WHERE id = p_entry;
  INSERT INTO app.deletion_log (owner_id, kind, fragrance_id, subject_id, summary)
  VALUES (p_owner, 'collection_entry', e.fragrance_id, p_entry, summary);
  RETURN summary;
END $$;

REVOKE ALL ON FUNCTION app.remove_collection_entry(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.remove_collection_entry(uuid, uuid) TO fray_runtime;
GRANT EXECUTE ON FUNCTION app.collection_entry_removal_preview(uuid, uuid) TO fray_runtime;
GRANT SELECT ON app.deletion_log TO fray_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.deletion_log FROM fray_runtime;
