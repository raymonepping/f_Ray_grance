-- Transactional synthetic CRUD after restore. No restored personal rows change.
BEGIN;
SET LOCAL ROLE fray_runtime;
DO $$
DECLARE
  owner_key uuid;
  brand_key uuid;
  fragrance_key uuid;
  entry_key uuid;
  marker text := 'restore-' || gen_random_uuid()::text;
BEGIN
  INSERT INTO app.owners(username,display_name) VALUES(marker,'Synthetic restore check') RETURNING id INTO owner_key;
  INSERT INTO app.brands(canonical_name) VALUES(marker) RETURNING id INTO brand_key;
  INSERT INTO app.fragrances(brand_id,canonical_name) VALUES(brand_key,marker) RETURNING id INTO fragrance_key;
  INSERT INTO app.collection_entries(owner_id,fragrance_id,state,personal_note)
    VALUES(owner_key,fragrance_key,'sampled','Synthetic recovery annotation') RETURNING id INTO entry_key;
  UPDATE app.collection_entries SET state='owned',rating=4 WHERE id=entry_key;
  IF (SELECT count(*) FROM app.collection_events WHERE entry_id=entry_key)<>2 THEN
    RAISE EXCEPTION 'Restored history trigger failed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM app.collection_entries WHERE id=entry_key AND owner_id=owner_key AND rating=4 AND personal_note='Synthetic recovery annotation') THEN
    RAISE EXCEPTION 'Restored collection read/write failed';
  END IF;
  INSERT INTO app.seasonal_preferences(owner_id,season,free_text) VALUES(owner_key,'winter','Synthetic seasonal note');
END $$;
ROLLBACK;
