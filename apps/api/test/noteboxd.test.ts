// ADR-021: NoteboxD as the source after Scento, and one source order for every effective value.
// The client is tested against responses recorded live (fixtures/noteboxd); nothing here contacts
// NoteboxD. Order: Scento, NoteboxD, ScentRev, other providers, derived, web research.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { claimRank, effectiveProfile } from '../src/repo/enrichment.js';
import { listEntries, createEntry } from '../src/repo/collection.js';
import { NoteboxdClient, NoteboxdError, type HttpFetch, type NoteboxdProfile } from '../src/providers/noteboxd.js';
import { mapProfile, pickExact } from '../src/domain/noteboxd.js';
import { buildSources } from '../src/images/sources.js';
import { AssetStore } from '../src/images/store.js';
import type { RotatingPool } from '../src/db/pool.js';
import { EXPECTED_SCHEMA_VERSION, runtimePool, seedOwner, sessionKey, testConfig } from './helpers.js';

const ORIGIN = 'http://localhost:8470';
const fixture = (n: string) => readFileSync(new URL(`./fixtures/noteboxd/${n}`, import.meta.url), 'utf8');
const SEARCH = fixture('search-phantom-in-red.json');
const PROFILE = fixture('fragrance-phantom-in-red.json');
const keyFile = (key: string) => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'fray-nb-')), 'noteboxd.json');
  writeFileSync(f, JSON.stringify({ api_key: key, version: 1 }), { mode: 0o600 });
  return f;
};
const respond = (body: string, status = 200, remaining = 48) => new Response(body, { status, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': String(remaining) } });
// The recorded responses, optionally with only the fragrance name replaced (test isolation).
const fakeNoteboxd = (calls: string[], name?: string): HttpFetch => async (url) => {
  calls.push(url);
  const rename = (body: string) => (name ? body.replaceAll('"Phantom In Red"', JSON.stringify(name)) : body);
  if (url.includes('/v1/search?')) return respond(rename(SEARCH));
  if (url.endsWith('/v1/fragrances/cmpbr4bu71awl2coocnbji4ta')) return respond(rename(PROFILE));
  return respond('{"error":{"code":"NOT_FOUND"}}', 404);
};
const PHANTOM = { brand: 'Rabanne', name: 'Phantom in Red', concentration: 'parfum' as const };

describe('NoteboxD client (recorded live responses)', () => {
  it('reads the observed shapes: brand from subtitle, per-note tiers, launchYear', async () => {
    const c = new NoteboxdClient(keyFile('nb_live_test_key_1234'), 40, fakeNoteboxd([]));
    expect(await c.enabled()).toBe(true);
    const hits = await c.search('Rabanne Phantom in Red');
    expect(hits[0]).toEqual({ id: 'cmpbr4bu71awl2coocnbji4ta', name: 'Phantom In Red', brand: 'Rabanne' });
    const p = (await c.fragrance('cmpbr4bu71awl2coocnbji4ta'))!;
    expect(p).toMatchObject({ name: 'Phantom In Red', brand: 'Rabanne', slug: 'rabanne/phantom-in-red', concentration: null, launchYear: 2025 });
    expect(p.notes.filter((n) => n.tier === null)).toHaveLength(10);
    expect(p.notes.find((n) => n.name === 'Bergamot')?.tier).toBeNull();
  });
  it('is off without a key, and sends the key only as a Bearer header', async () => {
    expect(await new NoteboxdClient(null).enabled()).toBe(false);
    await expect(new NoteboxdClient(null).search('x y')).rejects.toMatchObject({ code: 'NOTEBOXD_DISABLED' });
    let auth = '';
    const c = new NoteboxdClient(keyFile('nb_live_test_key_1234'), 40, async (_u, init) => {
      auth = (init.headers as Record<string, string>).authorization!;
      return respond(SEARCH);
    });
    await c.search('Phantom');
    expect(auth).toBe('Bearer nb_live_test_key_1234');
  });
  it('keeps a local daily budget and follows the server count; maps 429, 402 and 401', async () => {
    const calls: string[] = [];
    const c = new NoteboxdClient(keyFile('nb_live_test_key_1234'), 2, fakeNoteboxd(calls));
    await c.search('a b');
    await c.search('a b');
    await expect(c.search('a b')).rejects.toMatchObject({ code: 'NOTEBOXD_BUDGET' });
    expect(calls).toHaveLength(2); // the third call never left the machine
    const low = new NoteboxdClient(keyFile('nb_live_test_key_1234'), 40, async () => respond(SEARCH, 200, 0));
    await low.search('a b');
    expect(low.remaining()).toBe(0);
    for (const [status, code] of [[429, 'NOTEBOXD_RATE_LIMITED'], [402, 'NOTEBOXD_BALANCE'], [401, 'NOTEBOXD_DISABLED'], [503, 'NOTEBOXD_UNAVAILABLE']] as const) {
      const e = new NoteboxdClient(keyFile('nb_live_test_key_1234'), 40, async () => respond('{}', status));
      await expect(e.search('a b')).rejects.toMatchObject({ code });
    }
    const down = new NoteboxdClient(keyFile('nb_live_test_key_1234'), 40, async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(down.search('a b')).rejects.toBeInstanceOf(NoteboxdError);
  });
});

describe('NoteboxD rules', () => {
  const profile = (over: Partial<NoteboxdProfile> = {}): NoteboxdProfile => ({ id: 'x1', name: 'Phantom In Red', brand: 'Rabanne', slug: 'rabanne/phantom-in-red', concentration: null, launchYear: 2025, notes: [], ...over });
  it('picks exactly one exact hit; another house, a flanker or ambiguity proposes nothing', () => {
    expect(pickExact([{ id: 'a1', name: 'Phantom In Red', brand: 'Rabanne' }, { id: 'b2', name: 'Phantom My Hero In Miami', brand: 'Emper' }], PHANTOM).hit?.id).toBe('a1');
    expect(pickExact([{ id: 'a1', name: 'Phantom In Red', brand: 'Paco Rabanne' }], PHANTOM).hit?.id).toBe('a1'); // house alias
    expect(pickExact([{ id: 'c3', name: 'Phantom In Red', brand: 'Emper' }], PHANTOM).hit).toBeNull();
    expect(pickExact([{ id: 'd4', name: 'Phantom In Red Intense', brand: 'Rabanne' }], PHANTOM).hit).toBeNull();
    const amb = pickExact([{ id: 'a1', name: 'Phantom In Red', brand: 'Rabanne' }, { id: 'a2', name: 'Phantom in Red', brand: 'Rabanne' }], PHANTOM);
    expect(amb.hit).toBeNull();
    expect(amb.reason).toMatch(/2 entries/);
  });
  it('proposes an untiered list unless every note has a tier; never proposes null', () => {
    const live = mapProfile(profile({ notes: [{ name: 'Bergamot', tier: null }, { name: 'Plum', tier: 'top' }] }), PHANTOM);
    expect(live.proposals.map((p) => p.field)).toEqual(['launch_year', 'listed_notes']); // concentration null: not proposed
    const tiered = mapProfile(profile({ notes: [{ name: 'Plum', tier: 'top' }, { name: 'Lavender', tier: 'heart' }, { name: 'Oud', tier: 'base' }] }), PHANTOM);
    expect(tiered.proposals.find((p) => p.field === 'pyramid')?.value).toEqual({ top: ['Plum'], heart: ['Lavender'], base: ['Oud'] });
    expect(mapProfile(profile({ launchYear: 1650 }), PHANTOM).proposals.some((p) => p.field === 'launch_year')).toBe(false);
    expect(mapProfile(profile({ launchYear: 2999 }), PHANTOM).proposals.some((p) => p.field === 'launch_year')).toBe(false);
  });
  it('rejects a different product: another name, or a contradicting concentration', () => {
    expect(mapProfile(profile({ name: 'Phantom Elixir' }), PHANTOM).rejected).toMatch(/not exactly/);
    expect(mapProfile(profile({ concentration: 'Eau de Toilette' }), PHANTOM).rejected).toMatch(/different concentration/);
    expect(mapProfile(profile({ concentration: 'Parfum' }), PHANTOM).proposals[0]).toMatchObject({ field: 'concentration', value: { normalized: 'parfum' } });
  });
});

describe('source order (app.claim_rank) and NoteboxD through the API', () => {
  const { key } = sessionKey();
  let rp: RotatingPool;
  let app: FastifyInstance;
  let A: Record<string, string>;
  let B: Record<string, string>;
  let ownerA: string;
  let probe: string;
  const calls: string[] = [];
  // A fragrance of its own: other test files also create Rabanne Phantom in Red with Scento data.
  const probeName = `Phantom Probe ${Math.random().toString(36).slice(2, 8)}`;
  const headersFor = async (owner: string) => {
    const s = await createSession(rp.get(), key, owner, 1);
    return { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: ORIGIN, 'x-csrf-token': s.csrfToken };
  };
  const call = (h: Record<string, string>, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });
  const record = async (provider: string) =>
    (await rp.get().query<{ id: string }>(`INSERT INTO app.source_records (provider, external_id, attribution) VALUES ($1, $2, 'test') RETURNING id`, [provider, `t-${Math.random()}`])).rows[0]!.id;
  const claim = async (fragrance: string, origin: string, provider: string | null, field: string, value: unknown, minutesAgo: number) =>
    rp.get().query(`INSERT INTO app.source_claims (fragrance_id, source_record_id, origin, field_name, value, claimed_at) VALUES ($1, $2, $3, $4, $5, now() - make_interval(mins => $6))`, [
      fragrance,
      provider ? await record(provider) : null,
      origin,
      field,
      JSON.stringify(value),
      minutesAgo,
    ]);

  beforeAll(async () => {
    rp = await runtimePool();
    const brand = await upsertBrand(rp.get(), 'Rabanne');
    probe = await createFragrance(rp.get(), { brandId: brand, name: probeName, concentration: 'parfum', identityStatus: 'verified' });
    app = await buildApp({
      config: testConfig(),
      pool: rp,
      key,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      logger: false,
      imageSources: buildSources({ providerHosts: [], externalHosts: [] }),
      assetStore: new AssetStore(mkdtempSync(path.join(tmpdir(), 'fray-img-'))),
      noteboxd: new NoteboxdClient(keyFile('nb_live_test_key_1234'), 40, fakeNoteboxd(calls, probeName)),
    });
    ownerA = await seedOwner(rp.get());
    A = await headersFor(ownerA);
    B = await headersFor(await seedOwner(rp.get()));
  });
  afterAll(async () => {
    await app.close();
    await rp.close();
  });

  it('claim_rank in SQL matches the TypeScript mirror for every origin and provider', async () => {
    const origins = ['user', 'official', 'provider', 'derived', 'research'];
    const providers = ['scento', 'noteboxd', 'scentrev', 'tinyfish', 'manual', null];
    for (const o of origins)
      for (const p of providers) {
        const { rows } = await rp.get().query<{ r: number }>('SELECT app.claim_rank($1, $2) AS r', [o, p]);
        expect(rows[0]!.r, `${o}/${p}`).toBe(claimRank(o, p));
      }
    expect([claimRank('user', null), claimRank('official', null), claimRank('provider', 'scento'), claimRank('provider', 'noteboxd'), claimRank('provider', 'scentrev'), claimRank('research', 'tinyfish')]).toEqual([10, 20, 30, 31, 32, 50]);
  });

  it('a newer NoteboxD value never outranks Scento; ScentRev follows NoteboxD; research is last', async () => {
    const brand = await upsertBrand(rp.get(), `Order House ${Math.random().toString(36).slice(2, 7)}`);
    const f = await createFragrance(rp.get(), { brandId: brand, name: 'Order Probe', identityStatus: 'verified' });
    await claim(f, 'provider', 'scento', 'launch_year', 2001, 300); // oldest
    await claim(f, 'provider', 'scentrev', 'launch_year', 2003, 30);
    await claim(f, 'provider', 'noteboxd', 'launch_year', 2002, 20);
    await claim(f, 'research', 'tinyfish', 'launch_year', 2004, 1); // newest
    const top = async () => ((await effectiveProfile(rp.get(), f)).launch_year as { value: number }).value;
    expect(await top()).toBe(2001);
    const drop = (provider: string) =>
      rp.get().query(`UPDATE app.source_claims SET superseded_at = now() WHERE fragrance_id = $1 AND source_record_id IN (SELECT id FROM app.source_records WHERE provider = $2)`, [f, provider]);
    await drop('scento');
    expect(await top()).toBe(2002);
    await drop('noteboxd');
    expect(await top()).toBe(2003);
    await drop('scentrev');
    expect(await top()).toBe(2004);
    // The Collection pyramid follows the same order.
    await claim(f, 'provider', 'scento', 'pyramid', { top: ['Scento Note'], heart: null, base: null }, 200);
    await claim(f, 'provider', 'noteboxd', 'pyramid', { top: ['NoteboxD Note'], heart: null, base: null }, 1);
    await createEntry(rp.get(), ownerA, { fragranceId: f, state: 'owned' });
    const row = (await listEntries(rp.get(), ownerA)).find((e) => e.fragrance_id === f)!;
    expect(row.pyramid).toEqual({ top: ['Scento Note'], heart: null, base: null });
  });

  it('checks NoteboxD, proposes only gaps, saves accepted values below Scento, and reuses the observation', async () => {
    const st = (await call(A, 'GET', `/api/v1/fragrances/${probe}/sources`)).json();
    expect(st.order.map((o: { key: string }) => o.key)).toEqual(['scento', 'noteboxd', 'scentrev', 'research']);
    expect(st.noteboxd.enabled).toBe(true);
    expect(st.noteboxd.missing).toEqual(expect.arrayContaining(['launch_year']));
    expect(st.noteboxd.missing).not.toContain('concentration'); // the verified identity states Parfum
    const r = (await call(A, 'POST', `/api/v1/fragrances/${probe}/sources/noteboxd/check`)).json();
    expect(r).toMatchObject({ available: true, fromCache: false });
    expect(calls.filter((u) => u.includes('/search?'))).toHaveLength(1);
    expect(r.finding.productNameOnPage).toBe(`Rabanne ${probeName}`);
    expect(r.finding.pageUrl).toBe('https://www.noteboxd.com/fragrance/rabanne/phantom-in-red');
    const byField = Object.fromEntries(r.finding.proposals.map((p: { field: string }) => [p.field, p]));
    expect(byField.launch_year).toMatchObject({ acceptable: true, display: '2025' });
    expect(byField.listed_notes).toMatchObject({ acceptable: true });
    expect(byField.concentration).toBeUndefined();
    expect((await effectiveProfile(rp.get(), probe)).launch_year).toBeUndefined(); // nothing saved yet
    expect((await call(B, 'POST', `/api/v1/fragrances/${probe}/sources/noteboxd/${r.finding.id}/accept`, { fields: ['launch_year'] })).statusCode).toBe(404); // another owner
    expect((await call(A, 'POST', `/api/v1/fragrances/${probe}/sources/noteboxd/${r.finding.id}/accept`, { fields: ['launch_year'] })).json()).toEqual({ saved: 1, fields: ['launch_year'] });
    expect((await effectiveProfile(rp.get(), probe)).launch_year).toMatchObject({ origin: 'provider', value: 2025, source: { provider: 'noteboxd', url: 'https://www.noteboxd.com/fragrance/rabanne/phantom-in-red' } });
    // A second check within 24 hours reuses the stored observation: no new NoteboxD call.
    const before = calls.length;
    const again = (await call(A, 'POST', `/api/v1/fragrances/${probe}/sources/noteboxd/check`)).json();
    expect(again.fromCache).toBe(true);
    expect(calls.length).toBe(before);
    expect(again.finding.proposals.find((p: { field: string }) => p.field === 'launch_year')).toMatchObject({ acceptable: false }); // no longer a gap
    // A Scento value arriving later wins over the accepted NoteboxD value.
    await claim(probe, 'provider', 'scento', 'launch_year', 2024, 0);
    expect((await effectiveProfile(rp.get(), probe)).launch_year).toMatchObject({ value: 2024, source: { provider: 'scento' } });
  });
});
