-- Row count + content fingerprint for every table in schema app (JSON object).
-- Used identically by backup (manifest) and restore-test (comparison).
SELECT coalesce(json_object_agg(t, j), '{}') FROM (
  SELECT c.relname AS t,
         (xpath('/row/c/text()', query_to_xml(format(
            'SELECT count(*) AS c FROM app.%I', c.relname), false, true, '')))[1]::text::bigint AS n,
         (xpath('/row/h/text()', query_to_xml(format(
            'SELECT md5(coalesce(string_agg(x::text, ''|'' ORDER BY x::text), '''')) AS h FROM app.%I x',
            c.relname), false, true, '')))[1]::text AS h
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'app' AND c.relkind = 'r'
) s, LATERAL json_build_object('rows', n, 'fingerprint', h) j;
