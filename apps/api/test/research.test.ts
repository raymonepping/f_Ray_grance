// ADR-013: web research (TinyFish) and owner-started image lookups (Open Beauty Facts barcode,
// TinyFish web search). Pure rules first, then the API end to end with fake transports: nothing in
// this file contacts TinyFish, Open Beauty Facts or any image host.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { effectiveProfile, enrichExact } from '../src/repo/enrichment.js';
import { ScentoClient, type Fetcher } from '../src/providers/scento.js';
import { TinyFishClient, type HttpFetch } from '../src/providers/tinyfish.js';
import { namesExactly, selectPages, validateFinding, researchQuery } from '../src/domain/research.js';
import { lookupBarcode, pageImage } from '../src/images/lookup.js';
import { buildSources } from '../src/images/sources.js';
import { AssetStore } from '../src/images/store.js';
import type { RotatingPool } from '../src/db/pool.js';
import { readFileSync } from 'node:fs';
import { EXPECTED_SCHEMA_VERSION, runtimePool, seedOwner, sessionKey, testConfig } from './helpers.js';

const ORIGIN = 'http://localhost:8470';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const keyFile = (key: string) => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'fray-tf-')), 'tinyfish.json');
  writeFileSync(f, JSON.stringify({ api_key: key, version: 1 }), { mode: 0o600 });
  return f;
};
const sr = (position: number, url: string, title: string, site = new URL(url).hostname) => ({ position, siteName: site, title, snippet: '', url });

describe('research rules', () => {
  it('matches the exact name only, never a flanker', () => {
    expect(namesExactly('Boss Bottled Elixir Hugo Boss for men', 'Boss Bottled Elixir')).toBe(true);
    expect(namesExactly('Hugo Boss Bottled Elixir Parfum', 'Boss Bottled Elixir')).toBe(true);
    expect(namesExactly('Boss Bottled Triumph Elixir', 'Boss Bottled Elixir')).toBe(false);
    expect(namesExactly('Boss The Scent Elixir For Him', 'Boss Bottled Elixir')).toBe(false);
    expect(researchQuery('Hugo Boss', 'Boss Bottled Elixir', 'eau_de_parfum')).toBe('Hugo Boss Boss Bottled Elixir eau de parfum perfume notes');
  });
  it("selects exact-name pages, brand's own site first, skipping video and social", () => {
    const pages = selectPages(
      [
        sr(1, 'https://www.fragrantica.com/perfume/Hugo-Boss/Boss-Bottled-Elixir-84074.html', 'Boss Bottled Elixir Hugo Boss for men'),
        sr(2, 'https://www.youtube.com/watch?v=x', 'Boss Bottled Elixir review'),
        sr(3, 'https://www.hugoboss.com/us/boss-bottled-elixir.html', 'BOSS Bottled Elixir eau de toilette 100ml'),
        sr(4, 'https://www.fragrantica.com/perfume/Hugo-Boss/Boss-The-Scent-Elixir.html', 'Boss The Scent Elixir For Him'),
      ],
      'Hugo Boss',
      'Boss Bottled Elixir',
    );
    expect(pages.map((p) => new URL(p.url).hostname)).toEqual(['www.hugoboss.com', 'www.fragrantica.com']);
  });
  it('validates agent output strictly: identity, conflicts, tiers, untiered notes, sanitising', () => {
    const page = { url: 'https://www.hugoboss.com/x', siteName: 'hugoboss.com' };
    const ok = validateFinding(
      {
        exact_match: true,
        product_name_on_page: 'BOSS Bottled Elixir 100ml',
        concentrations_seen: ['Parfum Intense', 'parfum'],
        launch_year: 2023,
        top_notes: ['Incense', '<b>x</b>', 'I'],
        heart_notes: ['Vetiver'],
        base_notes: null,
        notes_without_tiers: ['Cedarwood'],
        evidence: 'warm incense top notes, an enticing vetiver heart',
      },
      page,
      'Boss Bottled Elixir',
    );
    expect(ok.rejected).toBeNull();
    const by = Object.fromEntries(ok.proposals.map((p) => [p.field, p]));
    expect(by.concentration).toMatchObject({ value: null, note: expect.stringMatching(/conflicting/) }); // "Parfum Intense" next to "parfum"
    expect(by.launch_year?.value).toBe(2023);
    expect(by.pyramid?.value).toEqual({ top: ['Incense', 'bx/b'], heart: ['Vetiver'], base: null }); // markup stripped, 1-char noise dropped
    expect(by.listed_notes?.value).toEqual(['Cedarwood']);
    const conflict = validateFinding({ exact_match: true, product_name_on_page: 'BOSS Bottled Elixir', concentrations_seen: ['eau de toilette', 'Eau de Parfum'] }, page, 'Boss Bottled Elixir');
    expect(conflict.proposals[0]).toMatchObject({ field: 'concentration', value: null });
    expect(conflict.proposals[0]!.note).toMatch(/conflicting/);
    expect(validateFinding({ exact_match: true, product_name_on_page: 'Boss Bottled Triumph Elixir', launch_year: 2020 }, page, 'Boss Bottled Elixir').rejected).toMatch(/not about exactly/);
    expect(validateFinding({ exact_match: false, product_name_on_page: 'Boss Bottled Elixir', launch_year: 2020 }, page, 'Boss Bottled Elixir').proposals).toEqual([]);
  });
});

describe('image lookup rules', () => {
  it('reads og:image (https only, relative resolved) and ignores insecure values', () => {
    expect(pageImage('<meta content="https://img.example.com/a.jpg?x=1&amp;y=2" property="og:image"/>', 'https://shop.example.com/p')).toBe('https://img.example.com/a.jpg?x=1&y=2');
    expect(pageImage('<meta property="og:image" content="/img/b.png">', 'https://shop.example.com/p')).toBe('https://shop.example.com/img/b.png');
    expect(pageImage('<meta property="og:image" content="http://insecure.example.com/c.jpg">', 'https://shop.example.com/p')).toBeNull();
    expect(pageImage('<meta name="twitter:image" content="https://t.example.com/d.webp">', 'https://shop.example.com/p')).toBe('https://t.example.com/d.webp');
  });
  it('looks a barcode up in Open Beauty Facts and keeps only its own image host', async () => {
    const calls: string[] = [];
    const http = (async (url: string) => {
      calls.push(url);
      if (url.includes('/3616303173098')) return json({ status: 1, product: { product_name: 'Boss Bottled Parfum 100 ml', brands: 'Hugo Boss', image_front_url: 'https://images.openbeautyfacts.org/images/products/361/630/317/3098/front_fr.3.400.jpg' } });
      if (url.includes('/0737052057989')) return json({ status: 1, product: { product_name: 'X', brands: 'Y', image_front_url: 'https://evil.example.com/x.jpg' } });
      return json({ status: 0 }, 404);
    }) as typeof fetch;
    const hit = await lookupBarcode('3616303173098', http);
    expect(hit).toMatchObject({ found: true, productName: 'Boss Bottled Parfum 100 ml', imageUrl: expect.stringMatching(/^https:\/\/images\.openbeautyfacts\.org\//) });
    expect(calls[0]).toBe('https://world.openbeautyfacts.org/api/v2/product/3616303173098?fields=code,product_name,brands,image_front_url,image_url');
    expect((await lookupBarcode('0737052057989', http)) as { imageUrl: string | null }).toMatchObject({ found: true, imageUrl: null });
    expect(await lookupBarcode('3616303173099', http)).toMatchObject({ found: false, reason: expect.stringMatching(/check digit/) });
    expect(await lookupBarcode('4006381333931', http)).toMatchObject({ found: false, reason: 'Not in Open Beauty Facts' });
  });
});

describe('TinyFish client', () => {
  it('is off without a key, sends X-API-Key, maps rate limits and failed runs', async () => {
    expect(await new TinyFishClient(null).enabled()).toBe(false);
    expect(await new TinyFishClient(keyFile('')).enabled()).toBe(false);
    await expect(new TinyFishClient(null).search('x')).rejects.toMatchObject({ code: 'TINYFISH_DISABLED' });
    const seen: { url: string; key: string | undefined }[] = [];
    const http: HttpFetch = async (url, init) => {
      seen.push({ url, key: (init.headers as Record<string, string>)['X-API-Key'] });
      if (url.startsWith('https://api.search.tinyfish.ai')) return json({ results: [{ position: 1, site_name: 'a.com', title: 'T', snippet: 's', url: 'https://a.com/p' }, { position: 2, url: 'javascript:alert(1)' }] });
      if (url === 'https://agent.tinyfish.ai/v1/automation/run-async') return json({ run_id: 'run_1' });
      if (url === 'https://agent.tinyfish.ai/v1/runs/run_1') return json({ status: 'FAILED', error: { message: 'blocked' } });
      return json({}, 429);
    };
    const tf = new TinyFishClient(keyFile('tf-test-key-123'), http, async () => {}, Date.now, 0);
    expect(await tf.enabled()).toBe(true);
    expect(await tf.search('Boss Bottled Elixir')).toEqual([{ position: 1, siteName: 'a.com', title: 'T', snippet: 's', url: 'https://a.com/p' }]);
    expect(seen[0]).toEqual({ url: 'https://api.search.tinyfish.ai?query=Boss+Bottled+Elixir', key: 'tf-test-key-123' });
    await expect(tf.agentRun('https://a.com/p', 'g', {})).rejects.toMatchObject({ code: 'TINYFISH_RUN_FAILED', message: 'blocked' });
    await expect(tf.fetchSelected(['https://a.com/p'], ['img'])).rejects.toMatchObject({ code: 'TINYFISH_RATE_LIMITED' });
  });
  it('cancels an agent run on TinyFish at our deadline instead of waiting (observed live: 19 minutes)', async () => {
    let t = 0;
    const calls: string[] = [];
    const http: HttpFetch = async (url, init) => {
      calls.push(`${init.method} ${url}`);
      if (url.endsWith('/run-async')) return json({ run_id: 'run_slow' });
      if (url.endsWith('/runs/run_slow')) return json({ status: 'RUNNING' });
      if (url.endsWith('/runs/run_slow/cancel')) return json({ status: 'CANCELLED' });
      return json({}, 404);
    };
    const tf = new TinyFishClient(keyFile('tf-test-key-123'), http, async (ms) => void (t += ms), () => t, 4000);
    await expect(tf.agentRun('https://a.com/p', 'g', {}, 120)).rejects.toMatchObject({ code: 'TINYFISH_RUN_FAILED', message: expect.stringMatching(/cancelled/) });
    expect(calls.at(-1)).toBe('POST https://agent.tinyfish.ai/v1/runs/run_slow/cancel');
    expect(calls.filter((c) => c.startsWith('GET')).length).toBe(31); // polled every 4 s for 120 s
  });
  it('a hanging HTTP call is aborted by its own timer', async () => {
    const http: HttpFetch = (_url, init) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))));
    const tf = new TinyFishClient(keyFile('tf-test-key-123'), http);
    const t0 = Date.now();
    await expect((tf as unknown as { call: (u: string, i: RequestInit, ms: number) => Promise<unknown> }).call('https://api.search.tinyfish.ai?query=x', { method: 'GET' }, 50)).rejects.toMatchObject({ code: 'TINYFISH_UNAVAILABLE', message: 'TinyFish did not answer in time' });
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('research and lookup API', () => {
  let app: FastifyInstance;
  let rp: RotatingPool;
  let A: Record<string, string>;
  let B: Record<string, string>;
  let bbe: string;
  let plain: string;
  const { key } = sessionKey();
  const agentCalls: string[] = [];
  // Distinct bytes per URL so checksum dedupe does not merge different candidates.
  const png = (seed = 40) => sharp({ create: { width: 400, height: 500, channels: 3, background: { r: seed % 256, g: 40, b: 40 } } }).png().toBuffer();
  const tfHttp: HttpFetch = async (url, init) => {
    if (url.startsWith('https://api.search.tinyfish.ai')) {
      return json({
        results: [
          { position: 1, site_name: 'www.fragrantica.com', title: 'Boss Bottled Elixir Hugo Boss for men', url: 'https://www.fragrantica.com/perfume/Hugo-Boss/Boss-Bottled-Elixir-84074.html' },
          { position: 2, site_name: 'www.hugoboss.com', title: 'BOSS Bottled Elixir eau de toilette 100ml', url: 'https://www.hugoboss.com/us/boss-bottled-elixir.html' },
          { position: 3, site_name: 'www.fragrantica.com', title: 'Boss The Scent Elixir For Him', url: 'https://www.fragrantica.com/perfume/Hugo-Boss/Boss-The-Scent-Elixir.html' },
        ],
      });
    }
    if (url === 'https://api.fetch.tinyfish.ai') {
      const body = JSON.parse(String(init.body));
      expect(body.format).toBe('html');
      return json({ results: body.urls.map((u: string) => ({ url: u, final_url: u, title: 't', text: `<meta property="og:image" content="https://img.${new URL(u).hostname.replace('www.', '')}/bottle.jpg"/>` })), errors: [] });
    }
    if (url === 'https://agent.tinyfish.ai/v1/automation/run-async') {
      const body = JSON.parse(String(init.body));
      agentCalls.push(body.url);
      return json({ run_id: body.url.includes('hugoboss') ? 'run_official' : 'run_other' });
    }
    if (url.startsWith('https://agent.tinyfish.ai/v1/runs/')) {
      if (url.endsWith('run_official')) {
        return json({ status: 'COMPLETED', result: { exact_match: true, product_name_on_page: 'BOSS Bottled Elixir eau de toilette 100ml', concentrations_seen: ['eau de toilette', 'Eau de Parfum'], top_notes: ['Incense'], heart_notes: ['Vetiver'], base_notes: ['Cedarwood'], evidence: 'warm incense top notes, an enticing vetiver heart, and a base of cedarwood essence' } });
      }
      return json({ status: 'COMPLETED', result: { exact_match: true, product_name_on_page: 'Boss Bottled Elixir', concentrations_seen: ['Parfum'], launch_year: 2023, top_notes: ['Incense', 'Cardamom'], heart_notes: ['Vetiver'], base_notes: ['Cedar'], evidence: 'Launched in 2023' } });
    }
    return json({}, 404);
  };
  const obfHttp = (async (url: string) =>
    url.includes('/3616304691645')
      ? json({ status: 1, product: { product_name: 'Boss Bottled Elixir', brands: 'Hugo Boss', image_front_url: 'https://images.openbeautyfacts.org/images/products/361/630/469/1645/front_en.3.400.jpg' } })
      : json({ status: 0 }, 404)) as typeof fetch;
  const downloads: { url: string; hosts: readonly string[] }[] = [];

  const headersFor = async (owner: string) => {
    const s = await createSession(rp.get(), key, owner, 1);
    return { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: ORIGIN, 'x-csrf-token': s.csrfToken };
  };
  const call = (h: Record<string, string>, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });
  // Research runs as a background job: start it, then poll until done.
  async function research(h: Record<string, string>, id: string) {
    const start = await call(h, 'POST', `/api/v1/fragrances/${id}/research`);
    if (start.statusCode !== 202) return start;
    for (let i = 0; i < 100; i++) {
      const r = await call(h, 'GET', `/api/v1/fragrances/${id}/research/jobs/${start.json().jobId}`);
      if (r.json().status === 'done') return r;
      await new Promise((res) => setTimeout(res, 20));
    }
    throw new Error('research job did not finish');
  }

  beforeAll(async () => {
    rp = await runtimePool();
    const body = readFileSync(new URL('./fixtures/scento/profile-boss-bottled-elixir-hugo-boss.json', import.meta.url), 'utf8');
    const scentoFetch: Fetcher = async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    const scento = new ScentoClient({ fetch: scentoFetch, sleep: async () => {}, ratePerSecond: 1000, burst: 1000, cacheTtlMs: 0 });
    bbe = (await enrichExact(rp.get(), await scento.fetchProfile('boss-bottled-elixir-hugo-boss'))).fragranceId;
    await rp.get().query("INSERT INTO app.product_variants (fragrance_id, gtin14, raw_barcode) VALUES ($1, '03616304691645', '3616304691645') ON CONFLICT DO NOTHING", [bbe]);
    const brand = await upsertBrand(rp.get(), 'Rabanne');
    plain = await createFragrance(rp.get(), { brandId: brand, name: `Probe ${Math.random().toString(36).slice(2, 7)}`, concentration: 'parfum', identityStatus: 'verified' });
    app = await buildApp({
      config: testConfig(),
      pool: rp,
      key,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      logger: false,
      imageSources: buildSources({ providerHosts: [], externalHosts: [] }),
      assetStore: new AssetStore(mkdtempSync(path.join(tmpdir(), 'fray-img-'))),
      tinyfish: new TinyFishClient(keyFile('tf-test-key-123'), tfHttp, async () => {}, Date.now, 0),
      imageLookup: {
        http: obfHttp,
        fetchImage: async (url, opts) => {
          downloads.push({ url, hosts: opts.allowedHosts });
          return { bytes: await png([...url].reduce((a, ch) => a + ch.charCodeAt(0), 0)), finalUrl: url };
        },
      },
    });
    A = await headersFor(await seedOwner(rp.get()));
    B = await headersFor(await seedOwner(rp.get()));
  });
  afterAll(async () => {
    await app.close();
    await rp.close();
  });

  it('reports what is missing, proposes facts from exact-name pages only, and stores nothing until accepted', async () => {
    const st = (await call(A, 'GET', `/api/v1/fragrances/${bbe}/research`)).json();
    expect(st).toEqual({ enabled: true, missing: ['concentration', 'launch_year', 'pyramid'] });
    const r = (await research(A, bbe)).json();
    expect(r.available).toBe(true);
    expect(agentCalls.some((u) => u.includes('The-Scent'))).toBe(false); // flanker page never read
    expect(r.findings[0].siteName).toBe('www.hugoboss.com'); // brand site first
    const official = r.findings[0];
    expect(official.proposals.find((p: { field: string }) => p.field === 'concentration')).toMatchObject({ acceptable: false });
    expect(official.evidence).toMatch(/incense top notes/);
    expect((await effectiveProfile(rp.get(), bbe)).pyramid).toBeUndefined(); // nothing saved yet
    // Accept the pyramid from the brand site, and the year from the second page.
    expect((await call(A, 'POST', `/api/v1/fragrances/${bbe}/research/${official.id}/accept`, { fields: ['pyramid', 'concentration'] })).json()).toEqual({ saved: 1, fields: ['pyramid'] });
    const second = r.findings[1];
    expect((await call(A, 'POST', `/api/v1/fragrances/${bbe}/research/${second.id}/accept`, { fields: ['launch_year', 'concentration'] })).json().saved).toBe(2);
    const fields = await effectiveProfile(rp.get(), bbe);
    expect(fields.pyramid).toMatchObject({ origin: 'research', value: { top: ['Incense'], heart: ['Vetiver'], base: ['Cedarwood'] }, source: { provider: 'tinyfish', url: 'https://www.hugoboss.com/us/boss-bottled-elixir.html' } });
    expect(fields.launch_year).toMatchObject({ origin: 'research', value: 2023 });
    expect(fields.concentration).toMatchObject({ origin: 'research', value: { raw: 'Parfum', normalized: 'parfum' } });
    expect(fields.listed_notes?.origin).toBe('provider'); // Scento facts untouched
    expect((await call(A, 'GET', `/api/v1/fragrances/${bbe}/research`)).json().missing).toEqual([]);
  });

  it('research never overrides higher-precedence data and cannot be accepted by another owner', async () => {
    const r = (await research(A, plain)).json();
    expect(r.findings).toEqual([]); // no page names this probe fragrance
    const run = (await research(A, bbe)).json();
    expect((await call(B, 'POST', `/api/v1/fragrances/${bbe}/research/${run.findings[0].id}/accept`, { fields: ['pyramid'] })).statusCode).toBe(404);
    // A user correction (precedence 1) wins over research (5).
    await rp.get().query("INSERT INTO app.source_claims (fragrance_id, origin, field_name, value) VALUES ($1, 'user', 'launch_year', '2022')", [bbe]);
    expect((await effectiveProfile(rp.get(), bbe)).launch_year).toMatchObject({ origin: 'user', value: 2022 });
    expect((await call(A, 'POST', `/api/v1/fragrances/${bbe}/research`)).statusCode).toBe(429); // 3 runs per 10 minutes per owner
    expect((await call(B, 'GET', `/api/v1/fragrances/${bbe}/research/jobs/00000000-0000-4000-8000-000000000000`)).statusCode).toBe(404);
  });

  it('finds an image by barcode (Open Beauty Facts) and attaches it with its licence and fixed host', async () => {
    const list = (await call(A, 'GET', `/api/v1/fragrances/${bbe}/images`)).json();
    expect(list.lookups.barcode.barcodes).toEqual(['03616304691645']);
    const r = (await call(A, 'POST', `/api/v1/fragrances/${bbe}/images/barcode`, {})).json();
    const c = r.results[0].candidate;
    expect(c).toMatchObject({ kind: 'approved_remote', siteName: 'Open Beauty Facts', barcode: '3616304691645', exactName: true, attribution: 'Open Beauty Facts contributors (CC BY-SA)' });
    expect(c).not.toHaveProperty('imageUrl'); // the client never sees or supplies the fetch target
    expect((await app.inject({ method: 'GET', url: c.previewUrl, headers: A })).headers['content-type']).toBe('image/webp');
    expect((await app.inject({ method: 'GET', url: c.previewUrl, headers: B })).statusCode).toBe(404);
    const att = await call(A, 'POST', `/api/v1/fragrances/${bbe}/images/candidates/${c.id}`, { makePrimary: true });
    expect(att.statusCode).toBe(201);
    expect(att.json().image).toMatchObject({ sourceKind: 'approved_remote', isPrimary: true, licenseNotes: expect.stringMatching(/CC BY-SA/) });
    expect(downloads.at(-1)!.hosts).toEqual(['images.openbeautyfacts.org']);
    const miss = (await call(A, 'POST', `/api/v1/fragrances/${bbe}/images/barcode`, { barcode: '4006381333931' })).json();
    expect(miss.results[0]).toMatchObject({ found: false, candidate: null });
  });

  it('web image search returns exact-name candidates only; picked images are stored as web_search', async () => {
    const r = (await call(A, 'POST', `/api/v1/fragrances/${bbe}/images/search`)).json();
    expect(r.available).toBe(true);
    expect(r.candidates.map((c: { siteName: string }) => c.siteName)).toEqual(['www.fragrantica.com', 'www.hugoboss.com']);
    const c = r.candidates[1];
    const att = (await call(A, 'POST', `/api/v1/fragrances/${bbe}/images/candidates/${c.id}`, {})).json();
    expect(att.image).toMatchObject({ sourceKind: 'web_search', effectivePrimary: false, attribution: 'www.hugoboss.com (found by web search)' });
    expect(downloads.at(-1)).toEqual({ url: 'https://img.hugoboss.com/bottle.jpg', hosts: ['img.hugoboss.com'] });
    expect((await call(A, 'POST', `/api/v1/fragrances/${plain}/images/candidates/${c.id}`, {})).statusCode).toBe(404); // bound to its fragrance
  });
});
