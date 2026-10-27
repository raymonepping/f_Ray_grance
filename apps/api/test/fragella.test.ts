// ADR-022: Fragella, the last-resort source (20 calls per month). Tested against a response recorded
// live (fixtures/fragella) and a fake /usage; nothing here contacts Fragella or spends quota.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { claimRank, effectiveProfile } from '../src/repo/enrichment.js';
import { FragellaClient, type HttpFetch } from '../src/providers/fragella.js';
import { NoteboxdClient } from '../src/providers/noteboxd.js';
import { mapGapProfile, pickExactHit } from '../src/domain/gap-sources.js';
import { buildSources } from '../src/images/sources.js';
import { AssetStore } from '../src/images/store.js';
import type { RotatingPool } from '../src/db/pool.js';
import { EXPECTED_SCHEMA_VERSION, runtimePool, seedOwner, sessionKey, testConfig } from './helpers.js';

const ORIGIN = 'http://localhost:8470';
const SEARCH = readFileSync(new URL('./fixtures/fragella/search-phantom-in-red.json', import.meta.url), 'utf8');
const keyFile = (key: string) => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'fray-fr-')), 'key.json');
  writeFileSync(f, JSON.stringify({ api_key: key, version: 1 }), { mode: 0o600 });
  return f;
};
const json = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } });
const usage = (remaining: number) => JSON.stringify({ plan: 'free', billing_period: { start: '2026-10-27T10:45:02.491Z', end: '2026-11-27T10:45:02.490Z' }, limit: { total_effective_limit: 20, base_limit: 20, carried_over_from_previous_period: 0 }, usage: { requests_made: 20 - remaining, requests_remaining: remaining } });
/** Fake Fragella: /usage is free; each search spends one call. Optionally renames Phantom in Red. */
const fakeFragella = (state: { remaining: number; calls: string[] }, name?: string): HttpFetch => async (url) => {
  state.calls.push(url);
  if (url.endsWith('/usage')) return json(usage(state.remaining));
  if (url.includes('/fragrances?')) {
    state.remaining -= 1;
    return json(name ? SEARCH.replaceAll('"Phantom in Red"', JSON.stringify(name)) : SEARCH);
  }
  return json('{}', 404);
};
const PHANTOM = { brand: 'Rabanne', name: 'Phantom in Red', concentration: 'parfum' as const };

describe('Fragella client (recorded live response)', () => {
  it('reads full profiles from one fuzzy search; only the exact hit survives the pick', async () => {
    const st = { remaining: 19, calls: [] as string[] };
    const c = new FragellaClient(keyFile('fragella_test_key_12345'), 2, fakeFragella(st));
    const rows = await c.search('Rabanne Phantom in Red');
    expect(rows).toHaveLength(5);
    const pick = pickExactHit(rows, PHANTOM, 'Fragella');
    expect(pick.hit).toMatchObject({ name: 'Phantom in Red', brand: 'Rabanne', concentration: null, launchYear: 2025 });
    expect(pick.hit!.notes.filter((n) => n.tier === 'top')).toHaveLength(3);
    expect(pick.hit!.notes.filter((n) => n.tier === 'base')).toHaveLength(4);
    expect(pick.hit!.generalNotes!.length).toBeGreaterThan(0);
    expect(st.calls.map((u) => new URL(u).pathname)).toEqual(['/api/v1/usage', '/api/v1/fragrances']); // free usage check first
  });
  it('refuses at the reserve without spending a call; maps 429, 402 and 401 without retrying', async () => {
    const st = { remaining: 2, calls: [] as string[] };
    const c = new FragellaClient(keyFile('fragella_test_key_12345'), 2, fakeFragella(st));
    await expect(c.search('a b c')).rejects.toMatchObject({ code: 'FRAGELLA_RESERVE' });
    expect(st.calls.some((u) => u.includes('/fragrances?'))).toBe(false);
    expect(await c.spendable()).toBe(0);
    for (const [status, code] of [[429, 'FRAGELLA_QUOTA'], [402, 'FRAGELLA_BALANCE'], [401, 'FRAGELLA_DISABLED']] as const) {
      let n = 0;
      const e = new FragellaClient(keyFile('fragella_test_key_12345'), 2, async (u) => {
        if (u.endsWith('/usage')) return json(usage(10));
        n += 1;
        return json('{}', status);
      });
      await expect(e.search('a b c')).rejects.toMatchObject({ code });
      expect(n).toBe(1); // never retried
    }
    expect(await new FragellaClient(null).enabled()).toBe(false);
  });
  it('maps a fully tiered profile to a pyramid, and falls back to the general notes otherwise', async () => {
    const st = { remaining: 19, calls: [] as string[] };
    const hit = pickExactHit(await new FragellaClient(keyFile('fragella_test_key_12345'), 2, fakeFragella(st)).search('x y z'), PHANTOM, 'Fragella').hit!;
    const full = mapGapProfile(hit, PHANTOM, 'Fragella');
    expect(full.proposals.map((p) => p.field)).toEqual(['launch_year', 'pyramid']); // empty OilType: no concentration
    const partial = mapGapProfile({ ...hit, notes: hit.notes.filter((n) => n.tier === 'top') }, PHANTOM, 'Fragella');
    expect(partial.proposals.find((p) => p.field === 'listed_notes')?.value).toEqual(hit.generalNotes);
  });
});

describe('Fragella through the API: last resort, owner-reviewed, reused for 30 days', () => {
  const { key } = sessionKey();
  let rp: RotatingPool;
  let app: FastifyInstance;
  let alone: FastifyInstance;
  let A: Record<string, string>;
  let B: Record<string, string>;
  let probe: string;
  const probeName = `Phantom Fragella ${Math.random().toString(36).slice(2, 8)}`;
  const fr = { remaining: 19, calls: [] as string[] };
  const nbCalls: string[] = [];
  const headersFor = async (owner: string) => {
    const s = await createSession(rp.get(), key, owner, 1);
    return { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: ORIGIN, 'x-csrf-token': s.csrfToken };
  };
  const call = (a: FastifyInstance, h: Record<string, string>, method: 'GET' | 'POST', url: string, payload?: object) => a.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });
  const build = (noteboxd: NoteboxdClient, fragella: FragellaClient) =>
    buildApp({
      config: testConfig(),
      pool: rp,
      key,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      logger: false,
      imageSources: buildSources({ providerHosts: [], externalHosts: [] }),
      assetStore: new AssetStore(mkdtempSync(path.join(tmpdir(), 'fray-img-'))),
      noteboxd,
      fragella,
    });

  beforeAll(async () => {
    rp = await runtimePool();
    const brand = await upsertBrand(rp.get(), 'Rabanne');
    probe = await createFragrance(rp.get(), { brandId: brand, name: probeName, concentration: 'parfum', identityStatus: 'verified' });
    // NoteboxD knows nothing about this probe (an empty search), so its check records a miss.
    const nb = new NoteboxdClient(keyFile('nb_live_test_key_1234'), 40, async (u) => {
      nbCalls.push(u);
      return new Response('{"query":"x","results":[]}', { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '45' } });
    });
    app = await build(nb, new FragellaClient(keyFile('fragella_test_key_12345'), 2, fakeFragella(fr, probeName)));
    alone = await build(new NoteboxdClient(null), new FragellaClient(keyFile('fragella_test_key_12345'), 2, fakeFragella({ remaining: 19, calls: [] }, probeName)));
    A = await headersFor(await seedOwner(rp.get()));
    B = await headersFor(await seedOwner(rp.get()));
  });
  afterAll(async () => {
    await app.close();
    await alone.close();
    await rp.close();
  });

  it('ranks Fragella after ScentRev and before web research, in SQL and TypeScript', async () => {
    for (const p of ['fragella', 'manual', 'scentrev']) {
      const { rows } = await rp.get().query<{ r: number }>("SELECT app.claim_rank('provider', $1) AS r", [p]);
      expect(rows[0]!.r).toBe(claimRank('provider', p));
    }
    expect([claimRank('provider', 'scentrev'), claimRank('provider', 'fragella'), claimRank('provider', 'manual'), claimRank('research', 'tinyfish')]).toEqual([32, 33, 34, 50]);
  });

  it('refuses Fragella until NoteboxD was tried; then proposes, saves on acceptance and reuses the check', async () => {
    const st = (await call(app, A, 'GET', `/api/v1/fragrances/${probe}/sources`)).json();
    expect(st.order.map((o: { key: string }) => o.key)).toEqual(['scento', 'noteboxd', 'scentrev', 'fragella', 'research']);
    expect(st.fragella).toMatchObject({ enabled: true, blockedBy: 'Fragella is the last resort: check NoteboxD first.', remainingThisMonth: 17 });
    const early = await call(app, A, 'POST', `/api/v1/fragrances/${probe}/sources/fragella/check`);
    expect(early.statusCode).toBe(409);
    expect(fr.calls.some((u) => u.includes('/fragrances?'))).toBe(false); // nothing spent
    const nb = (await call(app, A, 'POST', `/api/v1/fragrances/${probe}/sources/noteboxd/check`)).json();
    expect(nb.finding).toBeNull();
    expect(nb.message).toMatch(/no entry that is exactly/);
    expect((await call(app, A, 'GET', `/api/v1/fragrances/${probe}/sources`)).json().fragella.blockedBy).toBeNull();
    const r = (await call(app, A, 'POST', `/api/v1/fragrances/${probe}/sources/fragella/check`)).json();
    expect(r.finding).toMatchObject({ siteName: 'Fragella', productNameOnPage: `Rabanne ${probeName}`, rejected: null });
    const byField = Object.fromEntries(r.finding.proposals.map((p: { field: string }) => [p.field, p]));
    expect(byField.pyramid).toMatchObject({ acceptable: true });
    expect(byField.launch_year).toMatchObject({ acceptable: true, display: '2025' });
    expect(fr.calls.filter((u) => u.includes('/fragrances?'))).toHaveLength(1);
    expect((await call(app, B, 'POST', `/api/v1/fragrances/${probe}/sources/fragella/${r.finding.id}/accept`, { fields: ['pyramid'] })).statusCode).toBe(404);
    expect((await call(app, A, 'POST', `/api/v1/fragrances/${probe}/sources/fragella/${r.finding.id}/accept`, { fields: ['pyramid'] })).json()).toEqual({ saved: 1, fields: ['pyramid'] });
    expect((await effectiveProfile(rp.get(), probe)).pyramid).toMatchObject({ origin: 'provider', source: { provider: 'fragella' } });
    const again = (await call(app, A, 'POST', `/api/v1/fragrances/${probe}/sources/fragella/check`)).json();
    expect(again.fromCache).toBe(true);
    expect(fr.calls.filter((u) => u.includes('/fragrances?'))).toHaveLength(1); // reused: no second paid call
    expect(nbCalls.length).toBe(1); // and the NoteboxD miss is remembered too
  });

  it('with NoteboxD off, Fragella may be checked directly', async () => {
    const brand = await upsertBrand(rp.get(), 'Rabanne');
    const other = await createFragrance(rp.get(), { brandId: brand, name: `${probeName} Two`, concentration: 'parfum', identityStatus: 'verified' });
    const st = (await call(alone, A, 'GET', `/api/v1/fragrances/${other}/sources`)).json();
    expect(st.noteboxd.enabled).toBe(false);
    expect(st.fragella.blockedBy).toBeNull();
    expect((await call(alone, A, 'POST', `/api/v1/fragrances/${other}/sources/fragella/check`)).statusCode).toBe(200);
  });
});
