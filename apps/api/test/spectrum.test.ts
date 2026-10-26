// My Spectrum (Phase 13): pure computation with hand-checkable values, then the owner-scoped API.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { addUserClaim } from '../src/repo/enrichment.js';
import { createEntry } from '../src/repo/collection.js';
import { computeSpectrum, positionOn, AXES } from '../src/domain/spectrum.js';
import type { RotatingPool } from '../src/db/pool.js';
import { EXPECTED_SCHEMA_VERSION, runtimePool, seedOwner, sessionKey, testConfig, uniq } from './helpers.js';

const A = { id: 'a', brand: 'X', name: 'A', family: 'Woody', traits: { fresh: 4, green: 2, warm: 1, woody: 4, sweet: 1 } };
const B = { id: 'b', brand: 'X', name: 'B', family: 'Amber', traits: { fresh: null, warm: 5, spicy: 3, sweet: 5, gourmand: 5, woody: 2 } };
const C = { id: 'c', brand: 'X', name: 'C', family: 'Woody', traits: { fresh: 2, smoky: 4, aromatic: 3, fruity: 3 } };
const D = { id: 'd', brand: 'X', name: 'D', family: null, traits: {} };

describe('spectrum computation', () => {
  it('places a fragrance only when both poles have a known trait, from known values only', () => {
    const [fw, ds] = AXES;
    expect(positionOn(fw, A)).toBe(-0.4); // fresh mean(4,2)=3, warm 1 -> (1-3)/5
    expect(positionOn(ds, A)).toBe(-0.6); // dry woody 4, sweet 1
    expect(positionOn(fw, B)).toBeNull(); // no known fresh-side trait: unknown is not 0
    expect(positionOn(ds, B)).toBe(0.6);
    expect(positionOn(fw, D)).toBeNull();
  });
  it('computes collection position, spread, coverage, trait means and families', () => {
    const s = computeSpectrum([A, B, C, D]);
    const fw = s.axes.find((a) => a.code === 'fresh_warm')!;
    const ds = s.axes.find((a) => a.code === 'dry_sweet')!;
    expect(fw).toMatchObject({ position: 0, spread: { min: -0.4, max: 0.4 }, placed: 2, total: 4 });
    expect(fw.notPlaced.map((f) => f.id)).toEqual(['b', 'd']);
    expect(ds).toMatchObject({ position: 0, spread: { min: -0.6, max: 0.6 }, placed: 3 });
    const t = Object.fromEntries(s.traits.map((x) => [x.code, x]));
    expect(t.fresh).toMatchObject({ mean: 3, known: 2, total: 4 });
    expect(t.warm).toMatchObject({ mean: 3, known: 2 });
    expect(t.marine_mineral).toMatchObject({ mean: null, known: 0 }); // never shown as 0
    expect(s.families).toEqual([{ family: 'Woody', count: 2 }, { family: 'Amber', count: 1 }]);
    expect(s.unknownFamily).toBe(1);
    expect(s.limitation).toMatch(/not a statement of what you like/);
  });
  it('an empty collection has no position, no spread and no invented values', () => {
    const s = computeSpectrum([]);
    expect(s.axes.every((a) => a.position === null && a.spread === null && a.placed === 0)).toBe(true);
    expect(s.traits.every((t) => t.mean === null)).toBe(true);
  });
});

describe('spectrum API', () => {
  let app: FastifyInstance;
  let rp: RotatingPool;
  const { key } = sessionKey();
  let fresh: string;
  let warm: string;
  let wish: string;
  const headersFor = async (owner: string) => {
    const s = await createSession(rp.get(), key, owner, 1);
    return { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: 'http://localhost:8470', 'x-csrf-token': s.csrfToken };
  };
  const get = (h: Record<string, string>, qs = '') => app.inject({ method: 'GET', url: `/api/v1/profile/spectrum${qs}`, headers: h });

  beforeAll(async () => {
    rp = await runtimePool();
    app = await buildApp({ config: testConfig(), pool: rp, key, expectedSchemaVersion: EXPECTED_SCHEMA_VERSION, logger: false });
    const brand = await upsertBrand(rp.get(), uniq('Spectrum House'));
    fresh = await createFragrance(rp.get(), { brandId: brand, name: uniq('Fresh Probe'), concentration: 'eau_de_toilette', identityStatus: 'verified' });
    warm = await createFragrance(rp.get(), { brandId: brand, name: uniq('Warm Probe'), concentration: 'parfum', identityStatus: 'verified' });
    wish = await createFragrance(rp.get(), { brandId: brand, name: uniq('Wish Probe'), concentration: 'parfum', identityStatus: 'verified' });
    // Sourced pyramids (as personal corrections) so the existing trait method yields traits.
    await addUserClaim(rp.get(), fresh, 'pyramid', { top: ['Bergamot', 'Mint'], heart: ['Pepper'], base: ['Cedar'] });
    await addUserClaim(rp.get(), warm, 'pyramid', { top: ['Ginger'], heart: ['Cinnamon', 'Vanilla'], base: ['Caramel', 'Incense'] });
    await addUserClaim(rp.get(), wish, 'pyramid', { top: ['Lemon'], heart: null, base: ['Smoke'] });
    await addUserClaim(rp.get(), fresh, 'family', 'Citrus Aromatic');
  });
  afterAll(async () => {
    await app.close();
    await rp.close();
  });

  it('counts only the owner’s own owned fragrances, once each, ignoring ratings; samples only on request', async () => {
    const owner = await seedOwner(rp.get());
    const other = await seedOwner(rp.get());
    await createEntry(rp.get(), owner, { fragranceId: fresh, state: 'owned', rating: 1 });
    await createEntry(rp.get(), owner, { fragranceId: fresh, state: 'owned', rating: 5 }); // second bottle
    await createEntry(rp.get(), owner, { fragranceId: warm, state: 'sampled' });
    await createEntry(rp.get(), owner, { fragranceId: wish, state: 'wishlist' });
    await createEntry(rp.get(), other, { fragranceId: warm, state: 'owned' });
    const h = await headersFor(owner);

    const owned = (await get(h)).json();
    expect(owned).toMatchObject({ scope: 'owned', total: 1, method: 'spectrum-v1', traitMethod: 'sourced-notes-v1' });
    const fw = owned.axes.find((a: { code: string }) => a.code === 'fresh_warm');
    // fresh: max(bergamot 4, mint 4)=4, green: mint 3 -> left 3.5; spicy: pepper 4 -> right 4 -> +0.1
    expect(fw.fragrances).toEqual([{ id: fresh, brand: expect.any(String), name: expect.stringMatching(/^Fresh Probe/), position: 0.1 }]);
    expect(owned.families).toEqual([{ family: 'Citrus Aromatic', count: 1 }]);

    const withSamples = (await get(h, '?scope=owned_and_samples')).json();
    expect(withSamples.total).toBe(2);
    expect(withSamples.axes[0].fragrances.map((f: { id: string }) => f.id).sort()).toEqual([fresh, warm].sort());
    expect(withSamples.unknownFamily).toBe(1);

    // The other owner sees only their own collection.
    expect((await get(await headersFor(other))).json().total).toBe(1);
  });

  it('an empty collection returns an honest empty spectrum; bad scope and no session are refused', async () => {
    const h = await headersFor(await seedOwner(rp.get()));
    const r = (await get(h)).json();
    expect(r.total).toBe(0);
    expect(r.axes.every((a: { position: number | null }) => a.position === null)).toBe(true);
    expect((await get(h, '?scope=wishlist')).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/profile/spectrum' })).statusCode).toBe(401);
  });
});
