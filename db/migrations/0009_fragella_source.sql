-- F-Ray-grance 0009: Fragella as the last-resort source (ADR-022). Expand-only.
-- Order: your own entry, official data, Scento, NoteboxD, ScentRev, Fragella, other providers,
-- derived values, web research. Only the Fragella rank (33) is new; other providers move to 34.

ALTER TABLE app.source_records DROP CONSTRAINT IF EXISTS source_records_provider_check;
ALTER TABLE app.source_records ADD CONSTRAINT source_records_provider_check
  CHECK (provider IN ('scento', 'manufacturer', 'manual', 'derived', 'tinyfish', 'noteboxd', 'scentrev', 'fragella'));

CREATE OR REPLACE FUNCTION app.claim_rank(p_origin text, p_provider text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE p_origin
           WHEN 'user' THEN 10
           WHEN 'official' THEN 20
           WHEN 'provider' THEN CASE p_provider WHEN 'scento' THEN 30 WHEN 'noteboxd' THEN 31 WHEN 'scentrev' THEN 32 WHEN 'fragella' THEN 33 ELSE 34 END
           WHEN 'derived' THEN 40
           ELSE 50 -- research, and anything unknown, ranks last
         END
$$;
