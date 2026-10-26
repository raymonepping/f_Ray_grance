// Quick find (name / brand / barcode). Fake Scento and Open Beauty Facts transports; disposable PG.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { ScentoClient, type Fetcher } from '../src/providers/scento.js';
import { TinyFishClient } from '../src/providers/tinyfish.js';
import type { RotatingPool } from '../src/db/pool.js';
import { EXPECTED_SCHEMA_VERSION, runtimePool, seedOwner, sessionKey, testConfig, uniq } from './helpers.js';

const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const search = (matches: unknown[]) => ({ folio: 'search', lede: '', detail: { kind: 'search', query: 'q', total: matches.length, matches }, scento_page: { label: 's', url: 'https://www.scento.com/search' }, further_reading: [], cite: 'Scento Perfume API, scento.com', continuation: null });
const scentoQueries: string[] = [];
const scentoFetch: Fetcher = async (url) => {
  const q = new URL(url).searchParams.get('q') ?? '';
  scentoQueries.push(q);
  return ok(search([
    { kind: 'perfume', name: 'CK One', house: 'Calvin Klein', family: null, page: 'https://www.scento.com/brand/calvin-klein' },
    { kind: 'perfume', name: 'Euphoria', house: 'Calvin Klein', family: null, page: 'https://www.scento.com/perfumes/euphoria-calvin-klein' },
  ]));
};
const obf = (async (url: string) =>
  url.includes('/3616303473396')
    ? ok({ status: 1, product: { product_name: 'Calvin Klein Ck One Essence Parfum - Eau de Parfum    100ml', brands: '' } })
    : ok({ status: 0 }, 404)) as typeof fetch;

describe('quick find', () => {
  let app: FastifyInstance;
  let rp: RotatingPool;
  let A: Record<string, string>;
  let known: string;
  const { key } = sessionKey();
  const find = (query: string) => app.inject({ method: 'POST', url: '/api/v1/fragrances/lookup', headers: A, payload: { query } });

  beforeAll(async () => {
    rp = await runtimePool();
    app = await buildApp({
      config: testConfig(), pool: rp, key, expectedSchemaVersion: EXPECTED_SCHEMA_VERSION, logger: false,
      scento: new ScentoClient({ fetch: scentoFetch, sleep: async () => {}, ratePerSecond: 1000, burst: 1000, cacheTtlMs: 0 }),
      tinyfish: new TinyFishClient(null),
      imageLookup: { http: obf },
    });
    const s = await createSession(rp.get(), key, await seedOwner(rp.get()), 1);
    A = { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: 'http://localhost:8470', 'x-csrf-token': s.csrfToken };
    const brand = await upsertBrand(rp.get(), uniq('Calvin Klein'));
    known = await createFragrance(rp.get(), { brandId: brand, name: 'Known Barcode', concentration: 'eau_de_parfum', identityStatus: 'verified' });
    await rp.get().query("INSERT INTO app.product_variants (fragrance_id, gtin14, raw_barcode, verification_state, verified_source) VALUES ($1, '04006381333931', '4006381333931', 'verified', 'owner-confirmed')", [known]);
  });
  afterAll(async () => {
    await app.close();
    await rp.close();
  });

  it('text (part of a name or a brand) returns Scento suggestions with derived ids for brand-page listings', async () => {
    const r = (await find('ck one')).json();
    expect(r.kind).toBe('text');
    expect(r.suggestions.map((s: { providerId: string }) => s.providerId)).toEqual(['ck-one-calvin-klein', 'euphoria-calvin-klein']);
  });
  it('an EAN in Open Beauty Facts becomes a cleaned hint, then Scento suggestions; nothing is substituted', async () => {
    const r = (await find('3616303473396')).json();
    expect(r).toMatchObject({ kind: 'barcode', gtin14: '03616303473396', hint: { source: 'Open Beauty Facts', brand: 'Calvin Klein', name: 'Ck One Essence', sizeMl: 100 } });
    expect(scentoQueries.at(-1)).toBe('Calvin Klein Ck One Essence');
    expect(r.suggestions.every((s: { exactToHint: boolean }) => s.exactToHint === false)).toBe(true); // "CK One" is not "CK One Essence"
  });
  it('a barcode already linked to a verified fragrance finds it directly', async () => {
    expect((await find('4006381333931')).json()).toMatchObject({ kind: 'barcode', local: { fragranceId: known, name: 'Known Barcode' } });
  });
  it('invalid and unknown barcodes are handled honestly', async () => {
    expect((await find('4006381333932')).json()).toMatchObject({ invalid: true });
    expect((await find('5000000000005')).json()).toMatchObject({ hint: null, message: expect.stringMatching(/not in Open Beauty Facts/) });
  });
});
