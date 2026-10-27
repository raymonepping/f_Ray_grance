// ADR-023: owner-confirmed identities from an allow-listed shop page. The parser is tested on a
// recorded ICI PARIS XL page (fixtures/shops); nothing here contacts the shop or TinyFish.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { createDraft, effectiveProfile } from '../src/repo/enrichment.js';
import { parseShopPage, shopFor } from '../src/domain/shop-page.js';
import { isConfirmedIdentity } from '../src/domain/identity.js';
import { TinyFishClient, type HttpFetch } from '../src/providers/tinyfish.js';
import { buildSources } from '../src/images/sources.js';
import { AssetStore } from '../src/images/store.js';
import type { RotatingPool } from '../src/db/pool.js';
import { EXPECTED_SCHEMA_VERSION, runtimePool, seedOwner, sessionKey, testConfig } from './helpers.js';

const ORIGIN = 'http://localhost:8470';
const PAGE = JSON.parse(readFileSync(new URL('./fixtures/shops/iciparisxl-phantom-parfum.json', import.meta.url), 'utf8')) as { url: string; final_url: string; title: string; text: string };
const URL_ICI = 'https://www.iciparisxl.nl/rabanne/phantom-parfum/parfum/p/BP_1257290';

describe('shop page parsing and allow-list', () => {
  it('reads the identity, all three tiers and the EAN from the recorded ICI PARIS XL page', () => {
    const p = parseShopPage(URL_ICI, { title: PAGE.title, html: PAGE.text });
    expect(p).toMatchObject({ shop: 'ICI PARIS XL', brand: 'Rabanne', name: 'Phantom Parfum', concentration: 'parfum', pageEan: '3349668614585' });
    if ('refused' in p) throw new Error('refused');
    expect(p.notes.top).toEqual(['Bergamote', 'Citron', 'Accord De Rhubarbe', 'Cardamome']);
    expect(p.notes.heart).toEqual(['Trio De Lavande', 'Geranium', 'Patchouli', 'Cedre']);
    expect(p.notes.base).toEqual(['Gousse De Vanille', 'Baume Tolu', 'Vetiver']);
  });
  it('accepts only https ICI PARIS XL product pages without credentials', () => {
    expect(shopFor(URL_ICI)).not.toHaveProperty('refused');
    expect(shopFor('https://www.iciparisxl.be/rabanne/phantom-parfum/parfum/p/BP_1257290')).not.toHaveProperty('refused');
    for (const bad of [
      'http://www.iciparisxl.nl/rabanne/phantom-parfum/parfum/p/BP_1257290',
      'https://evil.example/rabanne/phantom-parfum/parfum/p/BP_1257290',
      'https://www.iciparisxl.nl/search?text=3349668614592',
      'https://user:pw@www.iciparisxl.nl/rabanne/phantom-parfum/parfum/p/BP_1257290',
      'https://www.iciparisxl.nl:8443/rabanne/phantom-parfum/parfum/p/BP_1257290',
      'not a url',
    ])
      expect(shopFor(bad), bad).toHaveProperty('refused');
  });
  it('treats verified and owner-confirmed identities as confirmed, drafts not', () => {
    expect(['verified', 'owner_confirmed', 'draft', 'needs_review'].map(isConfirmedIdentity)).toEqual([true, true, false, false]);
  });
});

describe('add from a shop page through the API', () => {
  const { key } = sessionKey();
  let rp: RotatingPool;
  let app: FastifyInstance;
  let A: Record<string, string>;
  let B: Record<string, string>;
  const fetches: string[] = [];
  const tag = Math.random().toString(36).slice(2, 7);
  const keyFile = () => {
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'fray-tf-')), 'tinyfish.json');
    writeFileSync(f, JSON.stringify({ api_key: 'tf-test-key-123', version: 1 }), { mode: 0o600 });
    return f;
  };
  const tfHttp: HttpFetch = async (url, init) => {
    fetches.push(`${url} ${String(init.body ?? '')}`);
    return new Response(JSON.stringify({ results: [PAGE], errors: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const headersFor = async (owner: string) => {
    const s = await createSession(rp.get(), key, owner, 1);
    return { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: ORIGIN, 'x-csrf-token': s.csrfToken };
  };
  const call = (h: Record<string, string>, url: string, payload: object) => app.inject({ method: 'POST', url, headers: h, payload });
  const status = async (id: string) => (await rp.get().query<{ s: string }>('SELECT identity_status AS s FROM app.fragrances WHERE id = $1', [id])).rows[0]!.s;
  const preview = async (h: Record<string, string>) => (await call(h, '/api/v1/fragrances/from-shop/preview', { url: URL_ICI })).json().preview;

  beforeAll(async () => {
    rp = await runtimePool();
    app = await buildApp({
      config: testConfig(),
      pool: rp,
      key,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      logger: false,
      imageSources: buildSources({ providerHosts: [], externalHosts: [] }),
      assetStore: new AssetStore(mkdtempSync(path.join(tmpdir(), 'fray-img-'))),
      tinyfish: new TinyFishClient(keyFile(), tfHttp, async () => {}, Date.now, 0),
    });
    A = await headersFor(await seedOwner(rp.get()));
    B = await headersFor(await seedOwner(rp.get()));
  });
  afterAll(async () => {
    await app.close();
    await rp.close();
  });

  it('refuses URLs outside the allow-list before calling TinyFish', async () => {
    const r = await call(A, '/api/v1/fragrances/from-shop/preview', { url: 'https://evil.example/rabanne/x/parfum/p/BP_1257290' });
    expect(r.statusCode).toBe(400);
    expect(fetches).toHaveLength(0);
  });

  it('previews without saving; confirm creates an owner-confirmed identity with the cited notes', async () => {
    const before = (await rp.get().query('SELECT count(*)::int AS n FROM app.fragrances')).rows[0].n;
    const p = await preview(A);
    expect(p).toMatchObject({ shop: 'ICI PARIS XL', brand: 'Rabanne', name: 'Phantom Parfum', concentration: 'parfum', pageEan: '3349668614585' });
    expect(fetches.at(-1)).toContain(URL_ICI); // only the URL was sent
    expect((await rp.get().query('SELECT count(*)::int AS n FROM app.fragrances')).rows[0].n).toBe(before); // nothing saved
    expect((await call(B, `/api/v1/fragrances/from-shop/${p.id}/confirm`, {})).statusCode).toBe(404); // another owner
    const r = await call(A, `/api/v1/fragrances/from-shop/${p.id}/confirm`, { name: `Phantom Parfum ${tag}` });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ created: true, identityStatus: 'owner_confirmed', notesSaved: true });
    const id = r.json().fragranceId as string;
    expect(await status(id)).toBe('owner_confirmed');
    expect((await effectiveProfile(rp.get(), id)).pyramid).toMatchObject({ origin: 'user', value: { top: ['Bergamote', 'Citron', 'Accord De Rhubarbe', 'Cardamome'] }, source: { provider: 'manual', url: URL_ICI, attribution: 'Confirmed by you from ICI PARIS XL' } });
    expect((await call(A, `/api/v1/fragrances/from-shop/${p.id}/confirm`, {})).statusCode).toBe(404); // a preview is used once
  });

  it('upgrades an existing draft and never changes a Scento-verified identity', async () => {
    const draft = await createDraft(rp.get(), { brand: 'Rabanne', name: `Draft Probe ${tag}`, concentration: 'parfum' });
    const up = (await call(A, `/api/v1/fragrances/from-shop/${(await preview(A)).id}/confirm`, { name: `Draft Probe ${tag}` })).json();
    expect(up).toMatchObject({ fragranceId: draft.fragranceId, created: false, identityStatus: 'owner_confirmed' });
    expect(await status(draft.fragranceId)).toBe('owner_confirmed');
    const brand = await upsertBrand(rp.get(), 'Rabanne');
    const verified = await createFragrance(rp.get(), { brandId: brand, name: `Verified Probe ${tag}`, concentration: 'parfum', identityStatus: 'verified' });
    const kept = (await call(A, `/api/v1/fragrances/from-shop/${(await preview(A)).id}/confirm`, { name: `Verified Probe ${tag}` })).json();
    expect(kept).toMatchObject({ fragranceId: verified, created: false, identityStatus: 'verified', notesSaved: false });
    expect(await status(verified)).toBe('verified');
    expect((await effectiveProfile(rp.get(), verified)).pyramid).toBeUndefined();
  });

  it('Compare accepts owner-confirmed identities', async () => {
    const brand = await upsertBrand(rp.get(), 'Rabanne');
    const a = await createFragrance(rp.get(), { brandId: brand, name: `Compare One ${tag}`, identityStatus: 'owner_confirmed' });
    const b = await createFragrance(rp.get(), { brandId: brand, name: `Compare Two ${tag}`, identityStatus: 'verified' });
    expect((await call(A, '/api/v1/compare', { fragranceIds: [a, b] })).statusCode).toBe(200);
    const d = await createDraft(rp.get(), { brand: 'Rabanne', name: `Compare Draft ${tag}`, concentration: null });
    expect((await call(A, '/api/v1/compare', { fragranceIds: [d.fragranceId, b] })).statusCode).toBe(409);
  });
});
