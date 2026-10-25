// Schema invariants, exercised as the RUNTIME role (what the API will use).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { runtimePool, seedOwner, uniq } from './helpers.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { createEntry, entryHistory, listEntries, transitionEntry } from '../src/repo/collection.js';
import type { RotatingPool } from '../src/db/pool.js';
import { checkDigitValid } from '../src/domain/gtin.js';

/** Random, check-digit-valid GTIN-14 so reruns against a persistent test DB stay isolated. */
function randomGtin(): string {
  const body = '0' + Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
  for (let d = 0; d <= 9; d++) if (checkDigitValid(body + d)) return body + d;
  throw new Error('unreachable');
}

let rp: RotatingPool;
let db: pg.Pool;
beforeAll(async () => {
  rp = await runtimePool();
  db = rp.get();
});
afterAll(async () => rp.close());

const pgCode = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? 'ERR';
  }
};

describe('exact fragrance identity', () => {
  it('keeps Invictus Elixir and Invictus Victory Elixir distinct; rejects exact duplicates', async () => {
    const brand = await upsertBrand(db, uniq('Rabanne'));
    const a = await createFragrance(db, { brandId: brand, name: 'Invictus Elixir', concentration: 'elixir' });
    const b = await createFragrance(db, { brandId: brand, name: 'Invictus Victory Elixir', concentration: 'elixir' });
    expect(a).not.toBe(b);
    // Case/accent/punctuation variants of the same identity collide.
    expect(await pgCode(createFragrance(db, { brandId: brand, name: 'INVICTUS  elixir', concentration: 'elixir' }))).toBe('23505');
    // Same name, different concentration = different identity.
    expect(await pgCode(createFragrance(db, { brandId: brand, name: 'Invictus Elixir', concentration: 'parfum' }))).toBe('OK');
    // NULLS NOT DISTINCT: two "no flanker / no concentration" rows are one identity.
    await createFragrance(db, { brandId: brand, name: 'Phantom in Red' });
    expect(await pgCode(createFragrance(db, { brandId: brand, name: 'Phantom in Red' }))).toBe('23505');
  });

  it('brand aliases normalise case and accents', async () => {
    const n = uniq('Hugo Boss');
    const id1 = await upsertBrand(db, n);
    const id2 = await upsertBrand(db, n.toUpperCase());
    expect(id2).toBe(id1);
  });
});

describe('GTIN variants', () => {
  it('validates check digits, preserves leading zeros, separates package from scent', async () => {
    const brand = await upsertBrand(db, uniq('Dior'));
    const f = await createFragrance(db, { brandId: brand, name: uniq('Sauvage') });
    const ins = (gtin: string, state = 'unverified', src: string | null = null) =>
      db.query(
        `INSERT INTO app.product_variants (fragrance_id, gtin14, bottle_ml, verification_state, verified_source) VALUES ($1, $2, 100, $3, $4) RETURNING gtin14`,
        [f, gtin, state, src],
      );
    expect(await pgCode(ins('04006381333932'))).toBe('23514'); // bad check digit
    const ok = await ins('04006381333931');
    expect(ok.rows[0].gtin14).toBe('04006381333931'); // leading zero kept
    // Verified requires a source.
    expect(await pgCode(ins('00012345678905', 'verified', null))).toBe('23514');
  });

  it('allows only one verified mapping per GTIN, even under a concurrent race', async () => {
    const brand = await upsertBrand(db, uniq('Versace'));
    const f1 = await createFragrance(db, { brandId: brand, name: uniq('Eros') });
    const f2 = await createFragrance(db, { brandId: brand, name: uniq('Eros Flame') });
    const gtin = randomGtin();
    const both = await Promise.allSettled(
      [f1, f2].map((f) =>
        db.query(
          `INSERT INTO app.product_variants (fragrance_id, gtin14, verification_state, verified_source) VALUES ($1, $2, 'verified', 'synthetic-test')`,
          [f, gtin],
        ),
      ),
    );
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((both.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('23505');
    // Unverified candidates for review may coexist.
    for (const f of [f1, f2]) {
      await db.query(`INSERT INTO app.product_variants (fragrance_id, gtin14) VALUES ($1, '00012345678905')`, [f]);
    }
  });
});

describe('trait scores: unknown is NULL, not zero', () => {
  it('enforces NULL/unknown pairing and the 0..5 scale', async () => {
    const brand = await upsertBrand(db, uniq('Chanel'));
    const f = await createFragrance(db, { brandId: brand, name: uniq('Bleu') });
    const put = (trait: string, score: number | null, conf: string) =>
      db.query(`INSERT INTO app.fragrance_trait_scores (fragrance_id, trait_code, score, method_version, confidence_state) VALUES ($1,$2,$3,'normalized-v1',$4)`, [f, trait, score, conf]);
    expect(await pgCode(put('sweet', null, 'unknown'))).toBe('OK');
    expect(await pgCode(put('fresh', 0, 'sourced'))).toBe('OK'); // assessed absent
    expect(await pgCode(put('spicy', null, 'sourced'))).toBe('23514'); // NULL must be 'unknown'
    expect(await pgCode(put('woody', 6, 'estimated'))).toBe('23514');
    expect(await pgCode(put('glitter', 1, 'estimated'))).toBe('23514');
    const { rows } = await db.query(`SELECT trait_code, score FROM app.fragrance_trait_scores WHERE fragrance_id=$1 ORDER BY trait_code`, [f]);
    expect(rows).toEqual([
      { trait_code: 'fresh', score: '0.0' },
      { trait_code: 'sweet', score: null },
    ]);
  });
});

describe('collection history is append-only and owner-scoped', () => {
  it('records every state transition and refuses rewrites', async () => {
    const owner = await seedOwner(db);
    const brand = await upsertBrand(db, uniq('Davidoff'));
    const f = await createFragrance(db, { brandId: brand, name: uniq('Cool Water') });
    const e = await createEntry(db, owner, { fragranceId: f, state: 'sampled', reason: 'tester from store' });
    await transitionEntry(db, owner, e.id, 'owned', 'bought full bottle');
    await transitionEntry(db, owner, e.id, 'previously_owned');
    const hist = await entryHistory(db, owner, e.id);
    expect(hist!.map((h) => [h.from_state, h.to_state, h.user_reason])).toEqual([
      [null, 'sampled', 'tester from store'],
      ['sampled', 'owned', 'bought full bottle'],
      ['owned', 'previously_owned', null],
    ]);
    // Updating a non-state field does not invent an event.
    await db.query(`UPDATE app.collection_entries SET rating = 4 WHERE id = $1`, [e.id]);
    expect((await entryHistory(db, owner, e.id))!).toHaveLength(3);
    // History cannot be edited, deleted or truncated; entries with history cannot vanish.
    expect(await pgCode(db.query(`UPDATE app.collection_events SET to_state='owned' WHERE entry_id=$1`, [e.id]))).toBe('42501');
    expect(await pgCode(db.query(`DELETE FROM app.collection_events WHERE entry_id=$1`, [e.id]))).toBe('42501');
    expect(await pgCode(db.query(`TRUNCATE app.collection_events`))).toBe('42501');
    expect(await pgCode(db.query(`DELETE FROM app.collection_entries WHERE id=$1`, [e.id]))).toBe('23001'); // restrict_violation
  });

  it('repeat purchases are separate entries; owned does not imply liked', async () => {
    const owner = await seedOwner(db);
    const brand = await upsertBrand(db, uniq('JOOP!'));
    const f = await createFragrance(db, { brandId: brand, name: uniq('Homme') });
    const first = await createEntry(db, owner, { fragranceId: f, state: 'owned' });
    const second = await createEntry(db, owner, { fragranceId: f, state: 'owned', rating: 2 });
    expect(first.rating).toBeNull();
    expect(second.id).not.toBe(first.id);
    expect(await listEntries(db, owner, 'owned')).toHaveLength(2);
  });

  it('never exposes or mutates another owner’s entry', async () => {
    const a = await seedOwner(db);
    const b = await seedOwner(db);
    const brand = await upsertBrand(db, uniq('Calvin Klein'));
    const f = await createFragrance(db, { brandId: brand, name: uniq('Eternity') });
    const e = await createEntry(db, a, { fragranceId: f, state: 'wishlist' });
    expect(await entryHistory(db, b, e.id)).toBeNull();
    expect(await transitionEntry(db, b, e.id, 'rejected')).toBeNull();
    expect(await listEntries(db, b)).toHaveLength(0);
    expect((await entryHistory(db, a, e.id))!).toHaveLength(1);
  });

  it('rejects a variant that belongs to a different fragrance', async () => {
    const owner = await seedOwner(db);
    const brand = await upsertBrand(db, uniq('Jean Paul Gaultier'));
    const f1 = await createFragrance(db, { brandId: brand, name: uniq('Le Male') });
    const f2 = await createFragrance(db, { brandId: brand, name: uniq('Le Male Elixir') });
    const { rows } = await db.query(`INSERT INTO app.product_variants (fragrance_id, bottle_ml) VALUES ($1, 75) RETURNING id`, [f2]);
    expect(await pgCode(createEntry(db, owner, { fragranceId: f1, variantId: rows[0].id, state: 'owned' }))).toBe('23503');
  });

  it('constrains states, ratings and seasons', async () => {
    const owner = await seedOwner(db);
    const brand = await upsertBrand(db, uniq('Hugo'));
    const f = await createFragrance(db, { brandId: brand, name: uniq('Man') });
    expect(await pgCode(createEntry(db, owner, { fragranceId: f, state: 'borrowed' as never }))).toBe('23514');
    expect(await pgCode(createEntry(db, owner, { fragranceId: f, state: 'owned', rating: 9 }))).toBe('23514');
    expect(await pgCode(db.query(`INSERT INTO app.seasonal_preferences (owner_id, season) VALUES ($1, 'monsoon')`, [owner]))).toBe('23514');
    await db.query(`INSERT INTO app.seasonal_preferences (owner_id, season) VALUES ($1, 'winter')`, [owner]);
    expect(await pgCode(db.query(`INSERT INTO app.seasonal_preferences (owner_id, season) VALUES ($1, 'winter')`, [owner]))).toBe('23505');
  });
});

describe('least privilege: runtime role cannot change structure', () => {
  it.each([
    ['CREATE TABLE app.evil (x int)', '42501'],
    ['CREATE TABLE public.evil (x int)', '42501'],
    ['DROP TABLE app.fragrances', '42501'],
    ['ALTER TABLE app.collection_events DISABLE TRIGGER ALL', '42501'],
    ['CREATE EXTENSION IF NOT EXISTS pg_trgm', '42501'],
    ['CREATE ROLE evil', '42501'],
    ['DELETE FROM app.schema_migrations', '42501'],
  ])('%s is denied', async (sql, code) => {
    expect(await pgCode(db.query(sql))).toBe(code);
  });
});
