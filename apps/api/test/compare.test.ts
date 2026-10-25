import { EXPECTED_SCHEMA_VERSION } from './helpers.js';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { addUserClaim } from '../src/repo/enrichment.js';
import { createEntry } from '../src/repo/collection.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { deriveDna, contrast } from '../src/domain/dna.js';
import { runtimePool, seedOwner, sessionKey, testConfig, uniq } from './helpers.js';
import type { RotatingPool } from '../src/db/pool.js';
let app: FastifyInstance; let pool: RotatingPool; let a: string; let b: string; let draft: string;
let h: Record<string, string>; let other: Record<string, string>; let owner: string;
const { key } = sessionKey();
async function headers(id: string) { const s = await createSession(pool.get(), key, id, 1); return { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: 'http://localhost:8470', 'x-csrf-token': s.csrfToken }; }
beforeAll(async () => {
  pool = await runtimePool(); owner = await seedOwner(pool.get()); h = await headers(owner); other = await headers(await seedOwner(pool.get()));
  app = await buildApp({ config: testConfig(), pool, key, expectedSchemaVersion: EXPECTED_SCHEMA_VERSION, logger: false });
  const brandId = await upsertBrand(pool.get(), uniq('DNA'));
  a = await createFragrance(pool.get(), { brandId, name: 'Alpha', identityStatus: 'verified' });
  b = await createFragrance(pool.get(), { brandId, name: 'Beta', identityStatus: 'verified' });
  draft = await createFragrance(pool.get(), { brandId, name: 'Unverified' });
  await addUserClaim(pool.get(), a, 'pyramid', { top: ['Bergamot'], heart: ['Lavender'], base: ['Cedarwood', 'Vanilla'] });
  await addUserClaim(pool.get(), b, 'pyramid', { top: ['Plum'], heart: null, base: ['Cedar', 'Benzoin'] });
  await createEntry(pool.get(), owner, { fragranceId: a, state: 'previously_owned', personalNote: 'private comparison annotation' });
  await pool.get().query("INSERT INTO app.season_fragrances (owner_id,fragrance_id,season,affinity,affinity_origin) VALUES ($1,$2,'winter','love','user')", [owner, a]);
});
afterAll(async () => { await app.close(); await pool.close(); });
const compare = (ids: string[], headers = h, extra = {}) => app.inject({ method: 'POST', url: '/api/v1/compare', headers, payload: { fragranceIds: ids, ...extra } });
describe('source-aware two-fragrance comparison', () => {
  it('rejects missing, duplicate, three, invalid, deleted and unverified identities', async () => {
    for (const ids of [[], [a], [a, a], [a, b, draft], ['nope', b]]) expect((await compare(ids)).statusCode).toBe(400);
    expect((await compare([a, randomUUID()])).statusCode).toBe(404);
    expect((await compare([a, draft])).statusCode).toBe(409);
    expect((await compare([a, b], h, { traitMethod: 'invented' })).statusCode).toBe(400);
  });
  it('keeps note aliases, tier order, provenance, unknown and deterministic differences', async () => {
    const r = await compare([a, b]); expect(r.statusCode).toBe(200); const d = r.json();
    expect(d.explanation.shared.map((n: { key: string }) => n.key)).toEqual(['cedar']);
    expect(d.fragrances[1].pyramid.heart).toBeNull();
    expect(d.fragrances[0].traits.find((t: { code: string }) => t.code === 'smoky').score).toBeNull();
    expect(d.fragrances[0].fields.pyramid.origin).toBe('user');
    expect(d.fragrances[0].traits.find((t: { code: string }) => t.code === 'sweet').evidence[0].label).toBe('Vanilla');
    expect(r.body).not.toContain('private comparison annotation'); expect(r.body).not.toContain('similarityPercent');
  });
  it('swap reverses identities and unique notes, retains evidence and does not mutate history', async () => {
    const before = (await pool.get().query('SELECT count(*)::int AS n FROM app.collection_events')).rows[0].n;
    const ab = (await compare([a, b])).json(); const ba = (await compare([b, a])).json();
    expect(ab.fragrances[0]).toEqual(ba.fragrances[1]); expect(ab.explanation.uniqueA).toEqual(ba.explanation.uniqueB);
    expect((await pool.get().query('SELECT count(*)::int AS n FROM app.collection_events')).rows[0].n).toBe(before);
  });
  it('scopes personal history/seasons to the owner and supports excluding personal context', async () => {
    const mine = (await compare([a, b])).json(); expect(mine.fragrances[0].personalSeasons[0].affinity).toBe('love');
    const theirs = (await compare([a, b], other)).json(); expect(theirs.fragrances[0].personalSeasons).toEqual([]); expect(theirs.fragrances[0].collection).toEqual([]);
    const excluded = (await compare([a, b], h, { includePersonalSeasonContext: false })).json(); expect(excluded.fragrances[0].personalSeasons).toEqual([]);
    expect((await compare([a, b], {})).statusCode).toBe(403);
    expect((await compare([a, b], { origin: 'http://localhost:8470' })).statusCode).toBe(401);
  });
  it('empty profiles remain unknown and exact accords are not collapsed into ingredients', () => {
    const empty = deriveDna({}); expect(empty.traits.every(t => t.score === null)).toBe(true);
    expect(contrast(empty, empty).differences).toEqual([]);
  });
});
