// Scento search sometimes links a perfume to its brand page (seen live for Calvin Klein CK One).
// The id is derived from Scento's "<name>-<house>" slug pattern; the resolver still verifies the
// fetched profile exactly, and a derived id with no profile is reported, never substituted.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ScentoClient, scentoSlug, type Fetcher } from '../src/providers/scento.js';
import { resolve } from '../src/domain/resolver.js';
import { hintFromProductTitle } from '../src/domain/barcode-hint.js';

const profile = JSON.parse(readFileSync(new URL('./fixtures/scento/profile-boss-bottled-elixir-hugo-boss.json', import.meta.url), 'utf8'));
const asCkOne = { ...profile, detail: { ...profile.detail, name: 'CK One', house: 'Calvin Klein' }, scento_page: { label: 'CK One', url: 'https://www.scento.com/perfumes/ck-one-calvin-klein' } };
const search = (matches: unknown[]) => ({ folio: 'search', lede: '', detail: { kind: 'search', query: 'q', total: matches.length, matches }, scento_page: { label: 's', url: 'https://www.scento.com/search' }, further_reading: [], cite: 'Scento Perfume API, scento.com', continuation: null });
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });

function client(profiles: Record<string, unknown>) {
  const fetcher: Fetcher = async (url) => {
    if (url.includes('/search?')) {
      return ok(search([
        { kind: 'perfume', name: 'CK One', house: 'Calvin Klein', family: null, page: 'https://www.scento.com/brand/calvin-klein' },
        { kind: 'perfume', name: 'CK Be', house: 'Calvin Klein', family: null, page: 'https://www.scento.com/brand/calvin-klein' },
      ]));
    }
    const slug = url.split('/perfumes/')[1]!;
    return profiles[slug] ? ok(profiles[slug]) : new Response('{}', { status: 404 });
  };
  return new ScentoClient({ fetch: fetcher, sleep: async () => {}, ratePerSecond: 1000, burst: 1000, cacheTtlMs: 0 });
}

describe('brand-page listings', () => {
  it('derives Scento slugs in the name-house pattern', () => {
    expect(scentoSlug('CK One', 'Calvin Klein')).toBe('ck-one-calvin-klein');
    expect(scentoSlug('Boss Bottled Elixir', 'Hugo Boss')).toBe('boss-bottled-elixir-hugo-boss');
    expect(scentoSlug("L'Homme Idéal", 'Guerlain')).toBe('l-homme-ideal-guerlain');
  });
  it('verifies a derived id exactly and resolves CK One as exact', async () => {
    const r = await resolve({ scento: client({ 'ck-one-calvin-klein': asCkOne }), findLocal: async () => [] }, { brand: 'Calvin Klein', name: 'CK One', concentration: null });
    expect(r.state).toBe('exact');
    expect(r.profile).toMatchObject({ providerId: 'ck-one-calvin-klein', name: 'CK One', house: 'Calvin Klein' });
  });
  it('reports a derived id without a profile as not verifiable instead of failing the lookup', async () => {
    const r = await resolve({ scento: client({}), findLocal: async () => [] }, { brand: 'Calvin Klein', name: 'CK One', concentration: null });
    expect(r.state).toBe('conflict');
    expect(r.candidates.find((c) => c.name === 'CK One')?.reason).toMatch(/no profile page/);
  });
});

describe('barcode title hints', () => {
  it('cleans a barcode-database title into brand, name, size and concentration', () => {
    expect(hintFromProductTitle('Calvin Klein Ck One Essence Parfum - Eau de Parfum    100ml', '', ['Calvin Klein'])).toEqual({
      brand: 'Calvin Klein', name: 'Ck One Essence', sizeMl: 100, concentration: null, query: 'Calvin Klein Ck One Essence',
    });
    expect(hintFromProductTitle('Boss Bottled Parfum 100 ml', 'Hugo Boss')).toMatchObject({ brand: 'Hugo Boss', name: 'Boss Bottled', sizeMl: 100, concentration: 'parfum' });
  });
});
