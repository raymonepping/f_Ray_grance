-- F-Ray-grance 0005 (Phase 12): perfume images. Expand-only. PostgreSQL holds metadata, integrity
-- fields and primary selection; binaries live in the persistent asset volume, never in the database
-- or Git. Every image is attached by (and visible to) one owner.
CREATE TABLE app.image_assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL REFERENCES app.owners (id) ON DELETE RESTRICT,
  fragrance_id     uuid NOT NULL REFERENCES app.fragrances (id) ON DELETE RESTRICT,
  variant_id       uuid REFERENCES app.product_variants (id) ON DELETE RESTRICT,
  source_kind      text NOT NULL CHECK (source_kind IN ('user_upload', 'approved_remote', 'scento', 'manual_external')),
  source_ref       text CHECK (source_ref IS NULL OR length(source_ref) <= 2048),
  attribution_label text NOT NULL CHECK (length(attribution_label) BETWEEN 1 AND 200),
  license_notes    text CHECK (license_notes IS NULL OR length(license_notes) <= 1000),
  storage_kind     text NOT NULL DEFAULT 'local_persistent' CHECK (storage_kind IN ('local_persistent', 'remote_reference')),
  storage_path     text CHECK (storage_path IS NULL OR storage_path ~ '^[0-9a-f]{2}/[0-9a-f]{64}$'),
  mime_type        text CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width            integer CHECK (width IS NULL OR width BETWEEN 1 AND 12000),
  height           integer CHECK (height IS NULL OR height BETWEEN 1 AND 12000),
  byte_size        integer CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 20971520),
  checksum         char(64) CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'failed', 'rejected')),
  failure_code     text CHECK (failure_code IS NULL OR length(failure_code) <= 60),
  failure_detail   text CHECK (failure_detail IS NULL OR length(failure_detail) <= 500),
  -- TRUE only when the owner explicitly chose this image; never set implicitly by an import.
  is_primary       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  -- A stored image always has its integrity fields; a failed import never pretends to.
  CHECK (status <> 'available' OR (checksum IS NOT NULL AND mime_type IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL
                                   AND (storage_kind = 'remote_reference' OR storage_path IS NOT NULL))),
  CHECK (NOT is_primary OR status = 'available'),
  CHECK (source_kind = 'user_upload' OR source_ref IS NOT NULL)
);
CREATE INDEX image_assets_context_idx ON app.image_assets (owner_id, fragrance_id, variant_id);
-- One explicit primary per owner and fragrance/variant context.
CREATE UNIQUE INDEX image_assets_one_primary ON app.image_assets
  (owner_id, fragrance_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_primary;
-- Checksum dedupe within a context: the same bytes are stored once.
CREATE UNIQUE INDEX image_assets_dedupe ON app.image_assets
  (owner_id, fragrance_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), checksum)
  WHERE checksum IS NOT NULL AND status = 'available';

CREATE FUNCTION app.touch_image_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER image_assets_touch BEFORE UPDATE ON app.image_assets FOR EACH ROW EXECUTE FUNCTION app.touch_image_asset();

-- Effective primary image for a context: the owner's explicit primary, otherwise the best available
-- image by source precedence (user upload > approved remote > Scento > manual external), newest first.
-- A variant context falls back to fragrance-level images.
CREATE FUNCTION app.primary_image(p_owner uuid, p_fragrance uuid, p_variant uuid DEFAULT NULL) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT i.id FROM app.image_assets i
   WHERE i.owner_id = p_owner AND i.fragrance_id = p_fragrance AND i.status = 'available'
     AND (i.variant_id IS NULL OR i.variant_id = p_variant)
   ORDER BY (i.variant_id IS NOT DISTINCT FROM p_variant) DESC,
            i.is_primary DESC,
            CASE i.source_kind WHEN 'user_upload' THEN 1 WHEN 'approved_remote' THEN 2 WHEN 'scento' THEN 3 ELSE 4 END,
            i.created_at DESC, i.id
   LIMIT 1
$$;
