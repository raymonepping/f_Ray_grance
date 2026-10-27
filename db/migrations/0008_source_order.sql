-- F-Ray-grance 0008: explicit source order (ADR-021). Expand-only.
-- Adds the second and third fragrance sources and ONE ranking used by every effective-value query:
-- your own entry, official data, Scento, NoteboxD, ScentRev, other providers, derived values, web
-- research. Claim time only breaks ties within the same rank.

ALTER TABLE app.source_records DROP CONSTRAINT IF EXISTS source_records_provider_check;
ALTER TABLE app.source_records ADD CONSTRAINT source_records_provider_check
  CHECK (provider IN ('scento', 'manufacturer', 'manual', 'derived', 'tinyfish', 'noteboxd', 'scentrev'));

CREATE FUNCTION app.claim_rank(p_origin text, p_provider text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE p_origin
           WHEN 'user' THEN 10
           WHEN 'official' THEN 20
           WHEN 'provider' THEN CASE p_provider WHEN 'scento' THEN 30 WHEN 'noteboxd' THEN 31 WHEN 'scentrev' THEN 32 ELSE 33 END
           WHEN 'derived' THEN 40
           ELSE 50 -- research, and anything unknown, ranks last
         END
$$;

GRANT EXECUTE ON FUNCTION app.claim_rank(text, text) TO fray_runtime;
