-- F-Ray-grance 0001: canonical schema (spec/DATA_MODEL.md, v0.1.6).
-- Runs inside a transaction as role fray_owner (via SET ROLE from a migrator
-- login). Forward-only; never drops or truncates authoritative data.
--
-- Identity layers:   brands -> fragrances (scent identity) -> product_variants (GTIN/package)
-- Personal layers:   owners -> collection_entries -> collection_events (append-only)
--                    owners -> seasonal_preferences / season_fragrances
-- Provenance:        source_records -> source_claims; fragrance_notes/traits cite claims

-- ---------------------------------------------------------------- helpers

-- Lower-case, accent-folded, punctuation-collapsed identity key. Deterministic and
-- deliberately conservative: it never removes words, so "Invictus Elixir" and
-- "Invictus Victory Elixir" stay distinct.
CREATE FUNCTION app.normalize_identity(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT nullif(btrim(regexp_replace(
    lower(translate(input,
      'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿ’''',
      'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyy  ')),
    '[^a-z0-9!]+', ' ', 'g')), '')
$$;

-- GS1 check digit validation for a 14-digit GTIN (EAN-13 is stored left-padded).
CREATE FUNCTION app.gtin14_is_valid(gtin text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT gtin ~ '^[0-9]{14}$' AND (
    (10 - (
      SELECT sum((substr(gtin, i, 1))::int * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END)
      FROM generate_series(1, 13) AS i
    ) % 10) % 10
  ) = substr(gtin, 14, 1)::int
$$;

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------- owners and security

CREATE TABLE app.owners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username     text NOT NULL,
  display_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owners_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,63}$')
);
CREATE UNIQUE INDEX owners_username_key ON app.owners (username);

-- Password hashes only (Argon2id PHC strings). Never plaintext.
CREATE TABLE app.owner_credentials (
  owner_id      uuid PRIMARY KEY REFERENCES app.owners (id) ON DELETE RESTRICT,
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Opaque server-side sessions. Only SHA-256 digests of the token and CSRF secret are stored.
CREATE TABLE app.sessions (
  token_hash     bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  owner_id       uuid NOT NULL REFERENCES app.owners (id) ON DELETE CASCADE,
  csrf_hash      bytea NOT NULL CHECK (octet_length(csrf_hash) = 32),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  user_agent_tag text,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_owner_idx ON app.sessions (owner_id) WHERE revoked_at IS NULL;

CREATE TABLE app.login_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username     text NOT NULL,
  succeeded    boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  client_tag   text
);
CREATE INDEX login_attempts_recent_idx ON app.login_attempts (username, attempted_at DESC);

-- ---------------------------------------------------------------- catalog identity

CREATE TABLE app.brands (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  text NOT NULL CHECK (btrim(canonical_name) <> ''),
  normalized_name text GENERATED ALWAYS AS (app.normalize_identity(canonical_name)) STORED,
  aliases         jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(aliases) = 'array'),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX brands_normalized_key ON app.brands (normalized_name);

CREATE TABLE app.fragrances (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             uuid NOT NULL REFERENCES app.brands (id) ON DELETE RESTRICT,
  canonical_name       text NOT NULL CHECK (btrim(canonical_name) <> ''),
  normalized_name      text GENERATED ALWAYS AS (app.normalize_identity(canonical_name)) STORED,
  flanker              text,
  concentration        text CHECK (concentration IN (
                         'parfum', 'extrait', 'elixir', 'eau_de_parfum', 'eau_de_toilette',
                         'eau_de_cologne', 'eau_fraiche', 'body_mist', 'other')),
  formulation_revision text,
  launch_year          smallint CHECK (launch_year BETWEEN 1700 AND 2100),
  identity_status      text NOT NULL DEFAULT 'draft'
                         CHECK (identity_status IN ('verified', 'draft', 'needs_review')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Exact identity. NULLS NOT DISTINCT: a missing flanker/concentration is still one identity.
  CONSTRAINT fragrances_identity_key UNIQUE NULLS NOT DISTINCT
    (brand_id, normalized_name, flanker, concentration, formulation_revision)
);
CREATE INDEX fragrances_brand_idx ON app.fragrances (brand_id);
CREATE INDEX fragrances_name_idx ON app.fragrances (normalized_name);
CREATE TRIGGER fragrances_touch BEFORE UPDATE ON app.fragrances
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Commercial variant: a GTIN identifies a package/size, NOT the scent formula or a bottle.
CREATE TABLE app.product_variants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fragrance_id       uuid NOT NULL REFERENCES app.fragrances (id) ON DELETE RESTRICT,
  gtin14             char(14) CHECK (gtin14 IS NULL OR app.gtin14_is_valid(gtin14)),
  raw_barcode        text,
  bottle_ml          numeric(6, 1) CHECK (bottle_ml > 0),
  packaging_type     text,
  verification_state text NOT NULL DEFAULT 'unverified'
                       CHECK (verification_state IN ('verified', 'unverified', 'rejected')),
  verified_source    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (verification_state <> 'verified' OR (gtin14 IS NOT NULL AND verified_source IS NOT NULL))
);
-- One verified active mapping per GTIN; unverified candidates may coexist for review.
CREATE UNIQUE INDEX product_variants_verified_gtin_key ON app.product_variants (gtin14)
  WHERE verification_state = 'verified';
CREATE INDEX product_variants_fragrance_idx ON app.product_variants (fragrance_id);

-- ---------------------------------------------------------------- provenance

CREATE TABLE app.source_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider              text NOT NULL CHECK (provider IN ('scento', 'manufacturer', 'manual', 'derived')),
  external_id           text,
  source_url            text,
  attribution           text,
  checked_at            timestamptz NOT NULL DEFAULT now(),
  response_hash         char(64),
  permitted_cache_class text NOT NULL DEFAULT 'user_lookup'
                          CHECK (permitted_cache_class IN ('user_lookup', 'reference', 'none')),
  mapped                jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(mapped) = 'object'),
  CONSTRAINT source_records_observation_key UNIQUE NULLS NOT DISTINCT (provider, external_id, response_hash)
);

CREATE TABLE app.source_claims (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fragrance_id     uuid NOT NULL REFERENCES app.fragrances (id) ON DELETE RESTRICT,
  source_record_id uuid REFERENCES app.source_records (id) ON DELETE RESTRICT,
  origin           text NOT NULL CHECK (origin IN ('official', 'provider', 'user', 'derived')),
  field_name       text NOT NULL,
  value            jsonb NOT NULL,
  claimed_at       timestamptz NOT NULL DEFAULT now(),
  superseded_at    timestamptz,
  -- Provider/official claims must cite an observation; user corrections need not.
  CHECK (origin IN ('user', 'derived') OR source_record_id IS NOT NULL)
);
CREATE INDEX source_claims_fragrance_idx ON app.source_claims (fragrance_id, field_name) WHERE superseded_at IS NULL;

CREATE TABLE app.note_dictionary (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (app.normalize_identity(display_name)) STORED,
  aliases         jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(aliases) = 'array'),
  family          text,
  is_accord       boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX note_dictionary_normalized_key ON app.note_dictionary (normalized_name);

CREATE TABLE app.fragrance_notes (
  fragrance_id    uuid NOT NULL REFERENCES app.fragrances (id) ON DELETE RESTRICT,
  note_id         uuid NOT NULL REFERENCES app.note_dictionary (id) ON DELETE RESTRICT,
  tier            text NOT NULL CHECK (tier IN ('top', 'heart', 'base')),
  source_claim_id uuid NOT NULL REFERENCES app.source_claims (id) ON DELETE RESTRICT,
  original_label  text NOT NULL,
  position        smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (fragrance_id, note_id, tier, source_claim_id)
);

CREATE TABLE app.fragrance_trait_scores (
  fragrance_id     uuid NOT NULL REFERENCES app.fragrances (id) ON DELETE RESTRICT,
  trait_code       text NOT NULL CHECK (trait_code IN (
                     'sweet', 'fresh', 'spicy', 'woody', 'warm',
                     'aromatic', 'fruity', 'gourmand', 'smoky', 'green', 'marine_mineral')),
  -- NULL = not measured / unknown. 0 = assessed absent with sufficient evidence. Never interchange.
  score            numeric(2, 1) CHECK (score BETWEEN 0 AND 5),
  method_version   text NOT NULL,
  confidence_state text NOT NULL CHECK (confidence_state IN ('sourced', 'estimated', 'unknown', 'user')),
  source_refs      jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(source_refs) = 'array'),
  observed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fragrance_id, trait_code, method_version),
  CHECK (score IS NOT NULL OR confidence_state = 'unknown')
);

-- Derived/regenerable (Tier B). 768 dims = nomic-embed-text:v1.5, measured in Phase 00.
-- A different model gets new rows (model_id/revision); never mix dimensions.
CREATE TABLE app.fragrance_embeddings (
  fragrance_id    uuid NOT NULL REFERENCES app.fragrances (id) ON DELETE CASCADE,
  model_id        text NOT NULL,
  model_revision  text NOT NULL,
  dimension       smallint NOT NULL CHECK (dimension = 768),
  source_revision text NOT NULL,
  input_hash      char(64) NOT NULL,
  embedding       vector(768) NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fragrance_id, model_id, model_revision)
);

-- ---------------------------------------------------------------- personal collection (Tier A)

CREATE TABLE app.collection_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES app.owners (id) ON DELETE RESTRICT,
  fragrance_id  uuid NOT NULL REFERENCES app.fragrances (id) ON DELETE RESTRICT,
  variant_id    uuid REFERENCES app.product_variants (id) ON DELETE RESTRICT,
  state         text NOT NULL CHECK (state IN ('owned', 'previously_owned', 'sampled', 'wishlist', 'rejected')),
  -- Rating is separate from ownership; owned does not imply liked.
  rating        smallint CHECK (rating BETWEEN 1 AND 5),
  personal_note text CHECK (length(personal_note) <= 4000),
  acquired_on   date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX collection_entries_owner_idx ON app.collection_entries (owner_id, state);
CREATE INDEX collection_entries_fragrance_idx ON app.collection_entries (fragrance_id);
CREATE TRIGGER collection_entries_touch BEFORE UPDATE ON app.collection_entries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- A variant on an entry must belong to the same fragrance.
CREATE FUNCTION app.collection_variant_matches() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM app.product_variants v WHERE v.id = NEW.variant_id AND v.fragrance_id = NEW.fragrance_id
  ) THEN
    RAISE EXCEPTION 'variant % does not belong to fragrance %', NEW.variant_id, NEW.fragrance_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER collection_entries_variant_check BEFORE INSERT OR UPDATE OF variant_id, fragrance_id
  ON app.collection_entries FOR EACH ROW EXECUTE FUNCTION app.collection_variant_matches();

-- Append-only state history. Written by trigger so no code path can skip it.
CREATE TABLE app.collection_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id    uuid NOT NULL REFERENCES app.collection_entries (id) ON DELETE RESTRICT,
  from_state  text,
  to_state    text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_reason text CHECK (length(user_reason) <= 1000),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_state IS DISTINCT FROM to_state)
);
CREATE INDEX collection_events_entry_idx ON app.collection_events (entry_id, id);

CREATE FUNCTION app.record_collection_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO app.collection_events (entry_id, from_state, to_state, occurred_at, user_reason)
    VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.state END,
      NEW.state,
      coalesce(nullif(current_setting('fray.transition_at', true), '')::timestamptz, now()),
      nullif(current_setting('fray.transition_reason', true), '')
    );
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER collection_entries_history AFTER INSERT OR UPDATE OF state ON app.collection_entries
  FOR EACH ROW EXECUTE FUNCTION app.record_collection_event();

CREATE FUNCTION app.forbid_history_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'collection_events is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER collection_events_append_only BEFORE UPDATE OR DELETE ON app.collection_events
  FOR EACH ROW EXECUTE FUNCTION app.forbid_history_rewrite();
CREATE TRIGGER collection_events_no_truncate BEFORE TRUNCATE ON app.collection_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_history_rewrite();

-- ---------------------------------------------------------------- seasons (Tier A)

CREATE TABLE app.seasonal_preferences (
  owner_id      uuid NOT NULL REFERENCES app.owners (id) ON DELETE RESTRICT,
  season        text NOT NULL CHECK (season IN ('spring', 'summer', 'autumn', 'winter')),
  liked_notes   jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(liked_notes) = 'array'),
  avoided_notes jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(avoided_notes) = 'array'),
  liked_traits  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(liked_traits) = 'object'),
  free_text     text CHECK (length(free_text) <= 4000),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, season)
);

CREATE TABLE app.season_fragrances (
  owner_id        uuid NOT NULL REFERENCES app.owners (id) ON DELETE RESTRICT,
  fragrance_id    uuid NOT NULL REFERENCES app.fragrances (id) ON DELETE RESTRICT,
  season          text NOT NULL CHECK (season IN ('spring', 'summer', 'autumn', 'winter')),
  affinity        text CHECK (affinity IN ('love', 'like', 'neutral', 'avoid', 'unsure')),
  -- Personal declarations are never confused with provider editorial suggestions.
  affinity_origin text NOT NULL CHECK (affinity_origin IN ('user', 'provider_editorial')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, fragrance_id, season, affinity_origin)
);
