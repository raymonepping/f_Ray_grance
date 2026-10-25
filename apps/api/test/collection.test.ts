// Collection CRUD + history + variants over HTTP (disposable PG18, synthetic data).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { checkDigitValid } from '../src/domain/gtin.js';
import { ScentoClient } from '../src/providers/scento.js';
import type { RotatingPool } from '../src/db/pool.js';
import { runtimePool, seedOwner, sessionKey, testConfig, uniq } from './helpers.js';

const ORIGIN = 'http://localhost:8470';
const { key } = sessionKey();
let app: FastifyInstance;
let rp: RotatingPool;
let A: Record<string, string>;
let B: Record<string, string>;
let fragrance: string;
let other: string;

async function headersFor(owner: string) {
  const s = await createSession(rp.get(), key, owner, 1);
  return { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: ORIGIN, 'x-csrf-token': s.csrfToken };
}
const gtin = () => {
  const body = '0' + Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
  for (let d = 0; d <= 9; d++) if (checkDigitValid(body + d)) return body + d;
  throw new Error('unreachable');
};
const call = (h: Record<string, string>, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
  app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });

beforeAll(async () => {
  rp = await runtimePool();
  // Scento is never needed for the collection: a client that always fails proves it.
  const scento = new ScentoClient({ fetch: async () => { throw new TypeError('offline'); }, sleep: async () => {} });
  app = await buildApp({ config: testConfig(), pool: rp, key, scento, expectedSchemaVersion: 2, logger: false });
  A = await headersFor(await seedOwner(rp.get()));
  B = await headersFor(await seedOwner(rp.get()));
  const brand = await upsertBrand(rp.get(), uniq('Chanel'));
  fragrance = await createFragrance(rp.get(), { brandId: brand, name: 'Bleu de Chanel', concentration: 'eau_de_parfum', identityStatus: 'verified' });
  other = await createFragrance(rp.get(), { brandId: brand, name: 'Allure Homme Sport', concentration: 'eau_de_toilette', identityStatus: 'verified' });
});
afterAll(async () => {
  await app.close();
  await rp.close();
});

describe('create, read, idempotency', () => {
  it('creates an owned entry with a first history event; reads it back with its fragrance identity', async () => {
    const r = await call(A, 'POST', '/api/v1/collection', { fragranceId: fragrance, state: 'owned', rating: 4, personalNote: 'Office signature', reason: 'birthday gift' });
    expect(r.statusCode).toBe(201);
    const id = r.json().entry.id;
    const g = (await call(A, 'GET', `/api/v1/collection/${id}`)).json();
    expect(g.entry).toMatchObject({ state: 'owned', rating: 4, personal_note: 'Office signature', canonical_name: 'Bleu de Chanel', concentration: 'eau_de_parfum' });
    expect(g.history.map((h: { from_state: string | null; to_state: string; user_reason: string }) => [h.from_state, h.to_state, h.user_reason])).toEqual([[null, 'owned', 'birthday gift']]);
  });

  it('retrying with the same clientRequestId returns the same entry and adds no event', async () => {
    const clientRequestId = randomUUID();
    const body = { clientRequestId, fragranceId: other, state: 'wishlist' };
    const [r1, r2] = await Promise.all([call(A, 'POST', '/api/v1/collection', body), call(A, 'POST', '/api/v1/collection', body)]);
    const r3 = await call(A, 'POST', '/api/v1/collection', body);
    const ids = new Set([r1, r2, r3].map((r) => r.json().entry.id));
    expect(ids.size).toBe(1);
    expect([r1, r2, r3].map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    const id = [...ids][0];
    expect((await call(A, 'GET', `/api/v1/collection/${id}`)).json().history).toHaveLength(1);
  });

  it('the same request id from another owner is independent', async () => {
    const clientRequestId = randomUUID();
    const a = await call(A, 'POST', '/api/v1/collection', { clientRequestId, fragranceId: other, state: 'rejected' });
    const b = await call(B, 'POST', '/api/v1/collection', { clientRequestId, fragranceId: other, state: 'rejected' });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().entry.id).not.toBe(b.json().entry.id);
  });

  it('validates input strictly', async () => {
    for (const bad of [
      { fragranceId: fragrance, state: 'borrowed' },
      { fragranceId: fragrance, state: 'owned', rating: 7 },
      { fragranceId: fragrance, state: 'owned', personalNote: 'x'.repeat(4001) },
      { fragranceId: 'nope', state: 'owned' },
      { fragranceId: fragrance, state: 'owned', ownerId: 'someone-else' },
    ]) {
      expect((await call(A, 'POST', '/api/v1/collection', bad)).statusCode, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
    expect((await call(A, 'POST', '/api/v1/collection', { fragranceId: randomUUID(), state: 'owned' })).statusCode).toBe(404);
  });

  it('mutations require CSRF; anonymous requests are 401', async () => {
    expect((await call({ ...A, 'x-csrf-token': '' }, 'POST', '/api/v1/collection', { fragranceId: fragrance, state: 'owned' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/collection', payload: { fragranceId: fragrance, state: 'owned' }, headers: { origin: ORIGIN } })).statusCode).toBe(401);
  });
});

describe('history-preserving transitions', () => {
  it('history order uses numeric event ids, including ids across digit-length boundaries', async () => {
    const id = (await call(A, 'POST', '/api/v1/collection', { fragranceId: other, state: 'wishlist' })).json().entry.id;
    await rp.get().query(`INSERT INTO app.collection_events (id,entry_id,from_state,to_state) OVERRIDING SYSTEM VALUE VALUES
      (900000000000001,$1,'wishlist','sampled'),(1000000000000001,$1,'sampled','owned')`,[id]);
    const history = (await call(A, 'GET', `/api/v1/collection/${id}/history`)).json().items;
    expect(history.map((e: {to_state:string}) => e.to_state)).toEqual(['wishlist','sampled','owned']);
  });
  it('sample → owned → previously owned keeps every step; rating/note edits add no events', async () => {
    const id = (await call(A, 'POST', '/api/v1/collection', { fragranceId: other, state: 'sampled', personalNote: 'Tester from the store' })).json().entry.id;
    const promoted = await call(A, 'PATCH', `/api/v1/collection/${id}`, { state: 'owned', reason: 'bought a full bottle' });
    expect(promoted.statusCode).toBe(200);
    await call(A, 'PATCH', `/api/v1/collection/${id}`, { rating: 3, personalNote: 'Better in summer' });
    const done = (await call(A, 'PATCH', `/api/v1/collection/${id}`, { state: 'previously_owned', reason: 'finished it' })).json();
    expect(done.entry).toMatchObject({ state: 'previously_owned', rating: 3, personal_note: 'Better in summer' });
    expect(done.history.map((h: { from_state: string | null; to_state: string }) => [h.from_state, h.to_state])).toEqual([
      [null, 'sampled'],
      ['sampled', 'owned'],
      ['owned', 'previously_owned'],
    ]);
  });

  it('a repeat purchase is a new entry; the finished bottle stays in history', async () => {
    const rel0 = (await call(A, 'GET', `/api/v1/fragrances/${other}/relationship`)).json();
    const before = rel0.entries.length;
    await call(A, 'POST', '/api/v1/collection', { fragranceId: other, state: 'owned', reason: 'repurchase' });
    const rel = (await call(A, 'GET', `/api/v1/fragrances/${other}/relationship`)).json();
    expect(rel.entries).toHaveLength(before + 1);
    expect(rel.entries.map((e: { state: string }) => e.state)).toContain('previously_owned');
    expect(rel.entries.every((e: { history: unknown[] }) => e.history.length >= 1)).toBe(true);
  });

  it('clearing a rating or note is explicit (null) and other fields are untouched', async () => {
    const id = (await call(A, 'POST', '/api/v1/collection', { fragranceId: fragrance, state: 'owned', rating: 5, personalNote: 'keep' })).json().entry.id;
    const r = (await call(A, 'PATCH', `/api/v1/collection/${id}`, { rating: null })).json();
    expect(r.entry).toMatchObject({ rating: null, personal_note: 'keep', state: 'owned' });
    expect((await call(A, 'PATCH', `/api/v1/collection/${id}`, {})).statusCode).toBe(400);
  });
});

describe('owner isolation', () => {
  it("another owner cannot read, update or see history of an entry (404, no leak)", async () => {
    const id = (await call(A, 'POST', '/api/v1/collection', { fragranceId: fragrance, state: 'owned', personalNote: 'secret A' })).json().entry.id;
    expect((await call(B, 'GET', `/api/v1/collection/${id}`)).statusCode).toBe(404);
    expect((await call(B, 'GET', `/api/v1/collection/${id}/history`)).statusCode).toBe(404);
    expect((await call(B, 'PATCH', `/api/v1/collection/${id}`, { state: 'rejected' })).statusCode).toBe(404);
    expect((await call(A, 'GET', `/api/v1/collection/${id}`)).json().entry.state).toBe('owned');
    const listB = await call(B, 'GET', '/api/v1/collection');
    expect(listB.body).not.toContain('secret A');
    const relB = (await call(B, 'GET', `/api/v1/fragrances/${fragrance}/relationship`)).json();
    expect(relB.entries).toEqual([]);
  });
});

describe('variants and barcodes', () => {
  it('records sizes/barcodes; recognises a previously-owned fragrance from a different bottle size', async () => {
    const g100 = gtin();
    const g50 = gtin();
    const v100 = await call(A, 'POST', `/api/v1/fragrances/${fragrance}/variants`, { gtin: g100, bottleMl: 100, confirmed: true });
    expect(v100.statusCode).toBe(201);
    expect(v100.json()).toMatchObject({ gtin14: g100, verification_state: 'verified' });
    const v50 = await call(A, 'POST', `/api/v1/fragrances/${fragrance}/variants`, { gtin: g50, bottleMl: 50, confirmed: true });
    const entry = (await call(A, 'POST', '/api/v1/collection', { fragranceId: fragrance, state: 'owned', variantId: v100.json().id })).json().entry;
    await call(A, 'PATCH', `/api/v1/collection/${entry.id}`, { state: 'previously_owned' });
    // Scanning the 50 ml box resolves to the same fragrance, whose relationship shows the previous 100 ml bottle.
    const resolved = (await call(A, 'POST', '/api/v1/fragrances/resolve', { gtin: g50.slice(1) })).json();
    expect(resolved).toMatchObject({ state: 'exact', catalogConfirmed: true, local: { fragrance_id: fragrance, variant_id: v50.json().id } });
    const rel = (await call(A, 'GET', `/api/v1/fragrances/${fragrance}/relationship`)).json();
    expect(rel.entries.find((e: { id: string }) => e.id === entry.id).state).toBe('previously_owned');
    expect(rel.variants.map((v: { bottle_ml: string }) => Number(v.bottle_ml))).toEqual(expect.arrayContaining([50, 100]));
    // The collection search finds it by either barcode.
    const byBarcode = (await call(A, 'GET', `/api/v1/collection?q=${g50}`)).json().items;
    expect(byBarcode.some((i: { id: string }) => i.id === entry.id)).toBe(true);
  });

  it('a barcode confirmed for one fragrance cannot be confirmed for another (409); bad check digit 400', async () => {
    const g = gtin();
    expect((await call(A, 'POST', `/api/v1/fragrances/${fragrance}/variants`, { gtin: g, confirmed: true })).statusCode).toBe(201);
    expect((await call(A, 'POST', `/api/v1/fragrances/${other}/variants`, { gtin: g, confirmed: true })).statusCode).toBe(409);
    expect((await call(A, 'POST', `/api/v1/fragrances/${other}/variants`, { gtin: g })).statusCode).toBe(201); // unverified candidate allowed
    expect((await call(A, 'POST', `/api/v1/fragrances/${other}/variants`, { gtin: '4006381333932' })).json().error.details).toEqual({ reason: 'BAD_CHECK_DIGIT' });
  });

  it('an entry cannot point at another fragrance’s size', async () => {
    const v = (await call(A, 'POST', `/api/v1/fragrances/${other}/variants`, { bottleMl: 30 })).json();
    expect((await call(A, 'POST', '/api/v1/collection', { fragranceId: fragrance, state: 'owned', variantId: v.id })).statusCode).toBe(400);
  });
});

describe('search, sort, filters and provider independence', () => {
  it('filters by state, searches by name/brand, sorts by rating — with Scento offline', async () => {
    const owned = (await call(A, 'GET', '/api/v1/collection?state=owned')).json().items;
    expect(owned.every((i: { state: string }) => i.state === 'owned')).toBe(true);
    expect((await call(A, 'GET', '/api/v1/collection?q=bleu')).json().items.every((i: { canonical_name: string }) => i.canonical_name === 'Bleu de Chanel')).toBe(true);
    const rated = (await call(A, 'GET', '/api/v1/collection?sort=rating')).json().items.map((i: { rating: number | null }) => i.rating);
    const nonNull = rated.filter((r: number | null) => r !== null);
    expect(nonNull).toEqual([...nonNull].sort((a: number, b: number) => b - a));
    expect(rated.indexOf(null)).toBeGreaterThanOrEqual(nonNull.length); // NULLS LAST
    expect((await call(A, 'GET', '/api/v1/collection?sort=price')).statusCode).toBe(400);
  });
});
