// Scento adapter + exact-identity resolver contract tests (offline, captured fixtures).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ScentoClient, SourceError, type Fetcher } from '../src/providers/scento.js';
import { classify, resolve } from '../src/domain/resolver.js';
import { brandKey, canonicalBrand } from '../src/domain/brands.js';
import { mapConcentration } from '../src/domain/concentration.js';

const fx = (name: string): string => readFileSync(new URL(`./fixtures/scento/${name}.json`, import.meta.url), 'utf8');
const json = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } });

/** Routes request paths to fixtures; overrides allow fault injection per path. */
function fakeFetch(overrides: Record<string, (n: number) => Response | Promise<Response>> = {}): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  const counts: Record<string, number> = {};
  const f = (async (url: string, init: { signal: AbortSignal }) => {
    const path = url.replace('https://www.scento.com/api/perfume/v1', '');
    calls.push(path);
    counts[path] = (counts[path] ?? 0) + 1;
    if (overrides[path]) return overrides[path]!(counts[path]!);
    if (init.signal.aborted) throw new DOMException('aborted', 'AbortError');
    const q = decodeURIComponent(path).toLowerCase();
    if (q.startsWith('/search')) {
      if (q.includes('phantom in red')) return json(fx('search-phantom-in-red'));
      if (q.includes('invictus')) return json(fx('search-invictus-elixir'));
      if (q.includes('1 million black')) return json(fx('search-1-million-black'));
      return json(JSON.stringify({ folio: 'perfume-search', detail: { query: 'x', total: 0, matches: [] }, cite: 'Scento Perfume API, scento.com' }));
    }
    if (path === '/perfumes/phantom-in-red-rabanne') return json(fx('profile-phantom-in-red-rabanne'));
    if (path === '/perfumes/invictus-victory-elixir-rabanne') return json(fx('profile-invictus-victory-elixir-rabanne'));
    return json('{}', 404);
  }) as unknown as Fetcher & { calls: string[] };
  f.calls = calls;
  return f;
}

const client = (fetch: Fetcher, extra: Partial<ConstructorParameters<typeof ScentoClient>[0]> = {}) =>
  new ScentoClient({ fetch, sleep: async () => {}, ratePerSecond: 100, burst: 100, ...extra });
const noLocal = async () => [];

describe('brand registry and concentration vocabulary', () => {
  it('maps focus-brand aliases and leaves unknown brands open', () => {
    expect(brandKey('Paco Rabanne')).toBe(brandKey('Rabanne'));
    expect(brandKey('Christian Dior')).toBe(brandKey('DIOR'));
    expect(brandKey('BOSS')).toBe(brandKey('Hugo Boss'));
    expect(brandKey('JPG')).toBe(brandKey('Jean Paul Gaultier'));
    expect(brandKey('joop')).toBe(brandKey('JOOP!'));
    expect(canonicalBrand('paco rabanne')).toBe('Rabanne');
    expect(canonicalBrand('Maison Margiela')).toBe('Maison Margiela');
    expect(brandKey('Versace')).not.toBe(brandKey('Valentino'));
  });
  it('maps provider wording without guessing', () => {
    expect(mapConcentration('eau de parfum')).toBe('eau_de_parfum');
    expect(mapConcentration('Parfum')).toBe('parfum');
    expect(mapConcentration('EDT')).toBe('eau_de_toilette');
    expect(mapConcentration('intense mist of mystery')).toBeNull();
    expect(mapConcentration(null)).toBeNull();
  });
  it('classifies near names as near_match, never exact', () => {
    const want = { brand: 'Rabanne', name: 'Invictus Elixir' };
    expect(classify(want, { name: 'Invictus Victory Elixir', house: 'Rabanne' })).toBe('near_match');
    expect(classify(want, { name: 'Invictus Elixir', house: 'Rabanne' })).toBe('exact_name');
    expect(classify(want, { name: 'Invictus Elixir', house: 'Versace' })).toBe('other');
    expect(classify({ brand: 'JPG', name: 'Le Male' }, { name: 'Le Male Elixir', house: 'Jean Paul Gaultier' })).toBe('near_match');
  });
});

describe('resolver (DATA_SOURCES §6 contract cases)', () => {
  it('Rabanne Phantom In Red resolves EXACT with a full sourced pyramid and source link', async () => {
    const r = await resolve({ scento: client(fakeFetch()), findLocal: noLocal }, { brand: 'Rabanne', name: 'Phantom In Red' });
    expect(r.state).toBe('exact');
    expect(r.profile).toMatchObject({ providerId: 'phantom-in-red-rabanne', name: 'Phantom in Red', concentration: 'parfum', partial: false });
    expect(r.profile!.pyramid.top).toEqual(['Plum', 'Saffron', 'Bergamot']);
    expect(r.profile!.sourceUrl).toBe('https://www.scento.com/perfumes/phantom-in-red-rabanne');
    expect(r.profile!.attribution).toMatch(/Scento/);
  });

  it('"Paco Rabanne" alias still resolves exactly', async () => {
    const r = await resolve({ scento: client(fakeFetch()), findLocal: noLocal }, { brand: 'Paco Rabanne', name: 'phantom in red' });
    expect(r.state).toBe('exact');
  });

  it('Rabanne Invictus Elixir is NOT resolved to Invictus Victory Elixir', async () => {
    const r = await resolve({ scento: client(fakeFetch()), findLocal: noLocal }, { brand: 'Rabanne', name: 'Invictus Elixir' });
    expect(r.state).toBe('candidate_needs_review');
    expect(r.errorCode).toBe('NO_EXACT_MATCH');
    expect(r.profile).toBeUndefined();
    const victory = r.candidates.find((c) => c.name === 'Invictus Victory Elixir')!;
    expect(victory.match).toBe('near_match');
    expect(victory.reason).toMatch(/extra "victory".*not the same fragrance/);
  });

  it('an exact-looking listing contradicted by its own profile is a CONFLICT, not exact', async () => {
    // Scento lists "Invictus Victory Elixir" but the profile is "Invictus Victory", eau de parfum (observed 2026-10-25).
    const r = await resolve({ scento: client(fakeFetch()), findLocal: noLocal }, { brand: 'Rabanne', name: 'Invictus Victory Elixir' });
    expect(r.state).toBe('conflict');
    expect(r.candidates[0]!.reason).toMatch(/profile is "Invictus Victory"/);
  });

  it('a requested concentration that disagrees with the profile is a CONFLICT', async () => {
    const r = await resolve({ scento: client(fakeFetch()), findLocal: noLocal }, { brand: 'Rabanne', name: 'Phantom in Red', concentration: 'eau_de_toilette' });
    expect(r.state).toBe('conflict');
    expect(r.reason).toMatch(/requested eau_de_toilette, Scento lists parfum/);
  });

  it('1 Million Black has no exact record: review/draft, no fabricated notes', async () => {
    const r = await resolve({ scento: client(fakeFetch()), findLocal: noLocal }, { brand: 'Rabanne', name: '1 Million Black' });
    expect(['candidate_needs_review', 'unresolved']).toContain(r.state);
    expect(r.errorCode).toBe('NO_EXACT_MATCH');
    expect(r.profile).toBeUndefined();
    expect(r.candidates.every((c) => c.match !== 'exact_name')).toBe(true);
  });

  it('a name with no similar records is UNRESOLVED', async () => {
    const r = await resolve({ scento: client(fakeFetch()), findLocal: noLocal }, { brand: 'Davidoff', name: 'Zzyzx Imaginary 2026' });
    expect(r.state).toBe('unresolved');
  });

  it('a verified local identity short-circuits without calling Scento', async () => {
    const f = fakeFetch();
    const r = await resolve({ scento: client(f), findLocal: async () => [{ fragranceId: 'x', identityStatus: 'verified' }] }, { brand: 'Rabanne', name: 'Phantom in Red' });
    expect(r.state).toBe('exact');
    expect(f.calls).toHaveLength(0);
  });

  it('partial pyramid is exact but flagged SOURCE_PARTIAL_DATA; missing tier stays null', async () => {
    const partial = JSON.parse(fx('profile-phantom-in-red-rabanne'));
    partial.detail.pyramid.heart = null;
    const f = fakeFetch({ '/perfumes/phantom-in-red-rabanne': () => json(JSON.stringify(partial)) });
    const r = await resolve({ scento: client(f), findLocal: noLocal }, { brand: 'Rabanne', name: 'Phantom in Red' });
    expect(r.state).toBe('exact');
    expect(r.errorCode).toBe('SOURCE_PARTIAL_DATA');
    expect(r.profile!.pyramid.heart).toBeNull();
  });

  it('Scento down: unresolved with SOURCE_UNAVAILABLE, never a guess', async () => {
    const f = fakeFetch({ ['/search?q=Rabanne%20Phantom%20In%20Red&kind=perfume']: () => json('oops', 503) });
    const r = await resolve({ scento: client(f), findLocal: noLocal }, { brand: 'Rabanne', name: 'Phantom In Red' });
    expect(r).toMatchObject({ state: 'unresolved', errorCode: 'SOURCE_UNAVAILABLE' });
  });
});

describe('adapter resilience', () => {
  const path = '/perfumes/phantom-in-red-rabanne';
  it('retries 5xx with backoff, then succeeds', async () => {
    const f = fakeFetch({ [path]: (n) => (n < 3 ? json('busy', 502) : json(fx('profile-phantom-in-red-rabanne'))) });
    const p = await client(f).fetchProfile('phantom-in-red-rabanne');
    expect(p.name).toBe('Phantom in Red');
    expect(f.calls.filter((c) => c === path)).toHaveLength(3);
  });
  it('429 → SOURCE_RATE_LIMITED with Retry-After, no retry storm', async () => {
    const f = fakeFetch({ [path]: () => json('slow down', 429, { 'retry-after': '120' }) });
    const err = await client(f).fetchProfile('phantom-in-red-rabanne').catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err).toMatchObject({ code: 'SOURCE_RATE_LIMITED', retryAfterSeconds: 120 });
    expect(f.calls).toHaveLength(1);
  });
  it('slow response times out → SOURCE_UNAVAILABLE', async () => {
    const hang: Fetcher = (_u, init) => new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const err = await new ScentoClient({ fetch: hang, timeoutMs: 20, retries: 1, sleep: async () => {} }).fetchProfile('phantom-in-red-rabanne').catch((e) => e);
    expect(err).toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
  });
  it('network loss → SOURCE_UNAVAILABLE', async () => {
    const down: Fetcher = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await client(down).search('x').catch((e) => e.code)).toBe('SOURCE_UNAVAILABLE');
  });
  it('unexpected JSON schema and non-JSON → SOURCE_SCHEMA_CHANGED', async () => {
    expect(await client(fakeFetch({ [path]: () => json('{"detail":{"name":42}}') })).fetchProfile('phantom-in-red-rabanne').catch((e) => e.code)).toBe('SOURCE_SCHEMA_CHANGED');
    expect(await client(fakeFetch({ [path]: () => json('<html>') })).fetchProfile('phantom-in-red-rabanne').catch((e) => e.code)).toBe('SOURCE_SCHEMA_CHANGED');
  });
  it('403/451 → SOURCE_TERMS_BLOCK', async () => {
    expect(await client(fakeFetch({ [path]: () => json('{}', 451) })).fetchProfile('phantom-in-red-rabanne').catch((e) => e.code)).toBe('SOURCE_TERMS_BLOCK');
  });
  it('caches user lookups (TTL) and enforces a local request budget', async () => {
    const f = fakeFetch();
    const c = new ScentoClient({ fetch: f, ratePerSecond: 0.0001, burst: 2, sleep: async () => {} });
    await c.fetchProfile('phantom-in-red-rabanne');
    await c.fetchProfile('phantom-in-red-rabanne'); // cache hit, no token used
    await c.search('Rabanne Phantom In Red');
    expect(await c.search('another query').catch((e) => e.code)).toBe('SOURCE_RATE_LIMITED');
    expect(f.calls).toHaveLength(2);
  });
  it('sends only the search text — no owner or personal data — and an honest user agent', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const spy: Fetcher = async (url, init) => {
      seen.push({ url, headers: init.headers });
      return json(fx('search-phantom-in-red'));
    };
    await client(spy).search('Rabanne Phantom In Red');
    expect(seen[0]!.url).toBe('https://www.scento.com/api/perfume/v1/search?q=Rabanne%20Phantom%20In%20Red&kind=perfume');
    expect(Object.keys(seen[0]!.headers).sort()).toEqual(['accept', 'user-agent']);
  });
  it('rejects unsafe provider ids before any request', async () => {
    const f = fakeFetch();
    expect(await client(f).fetchProfile('../../admin').catch((e) => e.code)).toBe('NOT_FOUND');
    expect(f.calls).toHaveLength(0);
  });
});

export { fakeFetch, client };
