-- Expand-only choices and stable portable history identities. Existing rows/history retained.
ALTER TABLE app.seasonal_preferences ADD COLUMN choices jsonb NOT NULL DEFAULT '{}'
  CHECK (jsonb_typeof(choices) = 'object');
ALTER TABLE app.source_claims ADD COLUMN corrected_by_owner uuid REFERENCES app.owners(id) ON DELETE RESTRICT;
ALTER TABLE app.collection_events ADD COLUMN portable_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX collection_events_portable_key ON app.collection_events (portable_id);

-- Import appends through normal entry transitions. It may supply the original
-- event identity/time; append-only protections remain intact and are never disabled.
CREATE OR REPLACE FUNCTION app.record_collection_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO app.collection_events (entry_id, from_state, to_state, occurred_at, user_reason, portable_id)
    VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.state END, NEW.state,
      coalesce(nullif(current_setting('fray.transition_at', true), '')::timestamptz, now()),
      nullif(current_setting('fray.transition_reason', true), ''),
      coalesce(nullif(current_setting('fray.transition_event_id', true), '')::uuid, gen_random_uuid()));
  END IF;
  RETURN NEW;
END $$;
