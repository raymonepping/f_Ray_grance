// Enrichment persistence + HTTP contract (disposable PG18, offline Scento fixtures).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { ScentoClient, type Fetcher } from '../src/providers/scento.js';
import type { RotatingPool } from '../src/db/pool.js';
import { runtimePool, seedOwner, sessionKey, testConfig } from './helpers.js';
import { checkDigitValid } from '../src/domain/gtin.js';

const ORIGIN = 'http://localhost:8470';
const fx = (n: string) => readFileSync(new URL(`./fixtures/scento/${n}.json`, import.meta.url), 'utf8');
const json = (b: string, s = 200) => new Response(b, { status: s, headers: { 'content-type': 'application/json' } });

// Mutable profile body so a test can simulate a changed provider observation.
let phantomProfile = fx('profile-phantom-in-red-rabanne');
let scentoDown = false;
const fetcher: Fetcher = async (url) => {
  if (scentoDown) throw new TypeError('fetch failed');
  const path = decodeURIComponent(url.replace('https://www.scento.com/api/perfume/v1', '')).toLowerCase();
  if (path.startsWith('/search')) {
    if (path.includes('phantom in red')) return json(fx('search-phantom-in-red'));
    if (path.includes('invictus')) return json(fx('search-invictus-elixir'));
    return json(fx('search-1-million-black'));
  }
  if (path === '/perfumes/phantom-in-red-rabanne') return json(phantomProfile);
  if (path === '/perfumes/invictus-victory-elixir-rabanne') return json(fx('profile-invictus-victory-elixir-rabanne'));
  return json('{}', 404);
};

let app: FastifyInstance;
let rp: RotatingPool;
let headers: Record<string, string>;
const { key } = sessionKey();

const post = (url: string, payload: object, h = headers) => app.inject({ method: 'POST', url, payload, headers: h });
const get = (url: string) => app.inject({ url, headers });

beforeAll(async () => {
  rp = await runtimePool();
  // Fresh client per app = fresh cache; cacheTtlMs 0 so refresh sees changed fixtures.
  const scento = new ScentoClient({ fetch: fetcher, sleep: async () => {}, ratePerSecond: 1000, burst: 1000, cacheTtlMs: 0 });
  app = await buildApp({ config: testConfig(), pool: rp, key, scento, expectedSchemaVersion: 2, logger: false });
  const owner = await seedOwner(rp.get());
  const s = await createSession(rp.get(), key, owner, 1);
  headers = { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: ORIGIN, 'x-csrf-token': s.csrfToken };
});
afterAll(async () => {
  await app.close();
  await rp.close();
});

describe('Discover → resolve → enrich (Phantom in Red)', () => {
  let fragranceId: string;

  it('requires an owner and CSRF for every enrichment route', async () => {
    for (const url of ['/api/v1/fragrances/resolve', '/api/v1/fragrances/enrich', '/api/v1/fragrances/drafts']) {
      expect((await app.inject({ method: 'POST', url, payload: {}, headers: { origin: ORIGIN } })).statusCode).toBe(401);
      expect((await post(url, { brand: 'Rabanne', name: 'X' }, { ...headers, 'x-csrf-token': '' })).statusCode).toBe(403);
    }
  });

  it('resolves exact with a preview and provenance, without saving anything', async () => {
    const before = await rp.get().query('SELECT count(*)::int AS n FROM app.source_records');
    const r = await post('/api/v1/fragrances/resolve', { brand: 'Rabanne', name: 'Phantom In Red' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ state: 'exact', profile: { providerId: 'phantom-in-red-rabanne', concentration: 'parfum' } });
    const after = await rp.get().query('SELECT count(*)::int AS n FROM app.source_records');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('enriches after confirmation: verified identity, sourced notes per tier, attribution', async () => {
    const r = await post('/api/v1/fragrances/enrich', { providerId: 'phantom-in-red-rabanne', brand: 'Rabanne', name: 'Phantom In Red' });
    expect(r.statusCode).toBe(201);
    fragranceId = r.json().fragranceId;
    const db = rp.get();
    const f = await db.query(`SELECT canonical_name, concentration, identity_status FROM app.fragrances WHERE id = $1`, [fragranceId]);
    expect(f.rows[0]).toEqual({ canonical_name: 'Phantom in Red', concentration: 'parfum', identity_status: 'verified' });
    const notes = await db.query(
      `SELECT tier, string_agg(original_label, ',' ORDER BY position) AS labels FROM app.fragrance_notes WHERE fragrance_id = $1 GROUP BY tier ORDER BY tier`,
      [fragranceId],
    );
    expect(notes.rows).toEqual([
      { tier: 'base', labels: 'Amberwood,Benzoin,Tobacco,Oud' },
      { tier: 'heart', labels: 'Lavender,Sage,Orange Blossom' },
      { tier: 'top', labels: 'Plum,Saffron,Bergamot' },
    ]);
    const sr = await db.query(`SELECT provider, external_id, source_url, attribution, permitted_cache_class, length(response_hash) AS h FROM app.source_records WHERE external_id = 'phantom-in-red-rabanne'`);
    expect(sr.rows[0]).toMatchObject({ provider: 'scento', source_url: 'https://www.scento.com/perfumes/phantom-in-red-rabanne', permitted_cache_class: 'user_lookup', h: 64 });
    expect(sr.rows[0].attribution).toMatch(/Scento/);
  });

  it('re-enriching the same observation is idempotent (no duplicate records or notes)', async () => {
    const db = rp.get();
    const count = async () => (await db.query(`SELECT (SELECT count(*) FROM app.source_records)::int + (SELECT count(*) FROM app.fragrance_notes)::int AS n`)).rows[0].n;
    const before = await count();
    const r = await post('/api/v1/fragrances/enrich', { providerId: 'phantom-in-red-rabanne', brand: 'Paco Rabanne', name: 'phantom in red' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ fragranceId, created: false, observationCreated: false });
    expect(await count()).toBe(before);
  });

  it('a manual correction survives a provider refresh with changed data', async () => {
    const corrected = { top: ['Plum', 'Saffron', 'Bergamot'], heart: ['Lavender', 'Sage', 'Orange Blossom'], base: ['Amberwood', 'Benzoin', 'Tobacco', 'Oud', 'Cashmeran'] };
    expect((await post(`/api/v1/fragrances/${fragranceId}/claims`, { field: 'pyramid', value: corrected })).statusCode).toBe(201);
    expect((await post(`/api/v1/fragrances/${fragranceId}/claims`, { field: 'family', value: 'Amber Fougère (my reading)' })).statusCode).toBe(201);

    const changed = JSON.parse(phantomProfile);
    changed.detail.family = 'Wood & Root';
    changed.detail.pyramid.base = ['Amberwood', 'Vanilla'];
    phantomProfile = JSON.stringify(changed);
    const r = await post(`/api/v1/fragrances/${fragranceId}/refresh`, {});
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ observationCreated: true });

    const p = (await get(`/api/v1/fragrances/${fragranceId}/profile`)).json();
    expect(p.fields.pyramid).toMatchObject({ origin: 'user', value: corrected });
    expect(p.fields.family).toMatchObject({ origin: 'user', value: 'Amber Fougère (my reading)' });
    // Non-corrected fields follow the new provider observation, with source + checked time.
    expect(p.fields.subfamily).toMatchObject({ origin: 'provider', value: 'Amber & Resin', source: { provider: 'scento' } });
    expect(p.fields.subfamily.source.checkedAt).toMatch(/^\d{4}-/);
    // Old provider claims are superseded, not deleted (history kept).
    const claims = await rp.get().query(`SELECT origin, count(*) FILTER (WHERE superseded_at IS NULL)::int AS live, count(*)::int AS total FROM app.source_claims WHERE fragrance_id = $1 GROUP BY origin ORDER BY origin`, [fragranceId]);
    const provider = claims.rows.find((c) => c.origin === 'provider');
    expect(provider.total).toBeGreaterThan(provider.live);
  });

  it('refresh is refused when Scento now describes a different identity', async () => {
    const renamed = JSON.parse(phantomProfile);
    renamed.detail.name = 'Phantom in Red Intense';
    phantomProfile = JSON.stringify(renamed);
    const r = await post(`/api/v1/fragrances/${fragranceId}/refresh`, {});
    expect(r.statusCode).toBe(409);
    phantomProfile = fx('profile-phantom-in-red-rabanne');
  });

  it('stored data stays readable when Scento is down; refresh reports the source error', async () => {
    scentoDown = true;
    const p = await get(`/api/v1/fragrances/${fragranceId}/profile`);
    expect(p.statusCode).toBe(200);
    expect(p.json().fields.pyramid.origin).toBe('user');
    const r = await post(`/api/v1/fragrances/${fragranceId}/refresh`, {});
    expect(r.statusCode).toBe(503);
    expect(r.json().error.details).toEqual({ source: 'SOURCE_UNAVAILABLE' });
    scentoDown = false;
  });
});

describe('never substitute a near match', () => {
  it('Invictus Elixir resolves to review state with the Victory near-match flagged', async () => {
    const r = (await post('/api/v1/fragrances/resolve', { brand: 'Rabanne', name: 'Invictus Elixir' })).json();
    expect(r.state).toBe('candidate_needs_review');
    expect(r.candidates.map((c: { name: string; match: string }) => [c.name, c.match])).toContainEqual(['Invictus Victory Elixir', 'near_match']);
  });

  it('enriching a provider record under a different identity is refused and saves nothing', async () => {
    const before = (await rp.get().query(`SELECT count(*)::int AS n FROM app.fragrances`)).rows[0].n;
    const r = await post('/api/v1/fragrances/enrich', { providerId: 'invictus-victory-elixir-rabanne', brand: 'Rabanne', name: 'Invictus Elixir' });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.details.mismatch).toEqual({ name: true, brand: false, concentration: false });
    expect((await rp.get().query(`SELECT count(*)::int AS n FROM app.fragrances`)).rows[0].n).toBe(before);
  });

  it('unresolved fragrances become drafts with identity only — no invented notes', async () => {
    const r = await post('/api/v1/fragrances/drafts', { brand: 'Rabanne', name: '1 Million Black', concentration: 'eau_de_parfum' });
    expect(r.statusCode).toBe(201);
    const id = r.json().fragranceId;
    const db = rp.get();
    expect((await db.query(`SELECT identity_status FROM app.fragrances WHERE id = $1`, [id])).rows[0].identity_status).toBe('draft');
    expect((await db.query(`SELECT count(*)::int AS n FROM app.fragrance_notes WHERE fragrance_id = $1`, [id])).rows[0].n).toBe(0);
    expect((await db.query(`SELECT count(*)::int AS n FROM app.fragrance_trait_scores WHERE fragrance_id = $1`, [id])).rows[0].n).toBe(0);
    const p = (await get(`/api/v1/fragrances/${id}/profile`)).json();
    expect(Object.keys(p.fields)).toEqual(['identity']);
    expect(p.fields.identity.origin).toBe('user');
    // Creating the same draft again is idempotent.
    expect((await post('/api/v1/fragrances/drafts', { brand: 'Paco Rabanne', name: '1 MILLION BLACK', concentration: 'eau_de_parfum' })).json()).toMatchObject({ fragranceId: id, created: false });
  });
});

describe('GTIN lookups', () => {
  const makeGtin = () => {
    const body = '0' + Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
    for (let d = 0; d <= 9; d++) if (checkDigitValid(body + d)) return body + d;
    throw new Error('unreachable');
  };
  it('rejects a bad check digit', async () => {
    const r = await post('/api/v1/fragrances/resolve', { gtin: '4006381333932' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.details).toEqual({ reason: 'BAD_CHECK_DIGIT' });
  });
  it('valid but unmapped is checksum-valid, NOT catalog-confirmed (no external lookup)', async () => {
    const r = (await post('/api/v1/fragrances/resolve', { gtin: makeGtin() })).json();
    expect(r).toMatchObject({ state: 'unresolved', errorCode: 'NO_APPROVED_BARCODE_RESOLVER', checksumValid: true, catalogConfirmed: false });
  });
  it('a verified local mapping resolves exact', async () => {
    const g = makeGtin();
    const f = (await rp.get().query(`SELECT id FROM app.fragrances WHERE identity_status = 'verified' LIMIT 1`)).rows[0].id;
    await rp.get().query(`INSERT INTO app.product_variants (fragrance_id, gtin14, bottle_ml, verification_state, verified_source) VALUES ($1, $2, 50, 'verified', 'synthetic-test')`, [f, g]);
    const r = (await post('/api/v1/fragrances/resolve', { gtin: g.slice(1) })).json();
    expect(r).toMatchObject({ state: 'exact', catalogConfirmed: true, local: { fragrance_id: f } });
  });
});
