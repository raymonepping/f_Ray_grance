-- Owner-scoped image reads on a restored target (ADR-016, R2), rolled back. Uses the same predicate
-- as the API's image routes (id AND owner_id): each recovered image is readable by its owner only.
BEGIN;
SET LOCAL ROLE fray_runtime;
DO $$
DECLARE
  other uuid;
  r record;
  n int := 0;
BEGIN
  INSERT INTO app.owners(username,display_name) VALUES('restore-'||gen_random_uuid()::text,'Synthetic restore check') RETURNING id INTO other;
  FOR r IN SELECT id, owner_id, fragrance_id FROM app.image_assets WHERE storage_path IS NOT NULL LOOP
    IF (SELECT count(*) FROM app.image_assets WHERE id = r.id AND owner_id = r.owner_id) <> 1 THEN
      RAISE EXCEPTION 'Recovered image % is not readable by its owner', r.id;
    END IF;
    IF (SELECT count(*) FROM app.image_assets WHERE id = r.id AND owner_id = other) <> 0
       OR app.primary_image(other, r.fragrance_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Recovered image % is readable by another owner', r.id;
    END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'IMAGES_SCOPE_PASS images=%', n;
END $$;
ROLLBACK;
