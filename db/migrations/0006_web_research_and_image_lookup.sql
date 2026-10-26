-- F-Ray-grance 0006 (ADR-013): web research as a lower-trust source, and two owner-started image
-- lookups. Expand-only: CHECK constraints are widened, nothing is removed or rewritten.
--   source_records.provider  + 'tinyfish'   (web research observation: page URL, site, checked time)
--   source_claims.origin     + 'research'   (lowest precedence; never overrides provider/official/user)
--   image_assets.source_kind + 'web_search' (image found by an owner-started web search, owner-picked)
ALTER TABLE app.source_records DROP CONSTRAINT source_records_provider_check;
ALTER TABLE app.source_records ADD CONSTRAINT source_records_provider_check
  CHECK (provider IN ('scento', 'manufacturer', 'manual', 'derived', 'tinyfish'));

ALTER TABLE app.source_claims DROP CONSTRAINT source_claims_origin_check;
ALTER TABLE app.source_claims ADD CONSTRAINT source_claims_origin_check
  CHECK (origin IN ('official', 'provider', 'user', 'derived', 'research'));

ALTER TABLE app.image_assets DROP CONSTRAINT image_assets_source_kind_check;
ALTER TABLE app.image_assets ADD CONSTRAINT image_assets_source_kind_check
  CHECK (source_kind IN ('user_upload', 'approved_remote', 'scento', 'manual_external', 'web_search'));

-- Precedence now ends with web search: user upload > approved provider (incl. Open Beauty Facts by
-- barcode) > Scento > manual external URL > web search. The owner's explicit choice still wins.
CREATE OR REPLACE FUNCTION app.primary_image(p_owner uuid, p_fragrance uuid, p_variant uuid DEFAULT NULL) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT i.id FROM app.image_assets i
   WHERE i.owner_id = p_owner AND i.fragrance_id = p_fragrance AND i.status = 'available'
     AND (i.variant_id IS NULL OR i.variant_id = p_variant)
   ORDER BY (i.variant_id IS NOT DISTINCT FROM p_variant) DESC,
            i.is_primary DESC,
            CASE i.source_kind WHEN 'user_upload' THEN 1 WHEN 'approved_remote' THEN 2 WHEN 'scento' THEN 3
                               WHEN 'manual_external' THEN 4 ELSE 5 END,
            i.created_at DESC, i.id
   LIMIT 1
$$;
