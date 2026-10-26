// Untiered notes: when Scento lists notes without a pyramid (e.g. Boss Bottled Elixir), the adapter
// keeps them as their own provenance-labelled facts, traits may use them, and no tier is invented.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ScentoClient, type Fetcher } from '../src/providers/scento.js';
import { effectiveProfile, enrichExact } from '../src/repo/enrichment.js';
import { deriveDna } from '../src/domain/dna.js';
import type { RotatingPool } from '../src/db/pool.js';
import { runtimePool } from './helpers.js';

const body = readFileSync(new URL('./fixtures/scento/profile-boss-bottled-elixir-hugo-boss.json', import.meta.url), 'utf8');
const fetcher: Fetcher = async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
const scento = new ScentoClient({ fetch: fetcher, sleep: async () => {}, ratePerSecond: 1000, burst: 1000, cacheTtlMs: 0 });

describe('untiered Scento notes', () => {
  let rp: RotatingPool;
  beforeAll(async () => (rp = await runtimePool()));
  afterAll(async () => rp.close());

  it('keeps listed notes and signature materials, with every tier still unknown', async () => {
    const p = await scento.fetchProfile('boss-bottled-elixir-hugo-boss');
    expect(p.pyramid).toEqual({ top: null, heart: null, base: null });
    expect(p.listedNotes).toEqual(['Incense', 'Vetiver', 'Cedarwood']);
    expect(p.signatureMaterials).toEqual(['Vetiver', 'Cedarwood']);
    expect(p.concentrationRaw).toBeNull();
    expect(p.partial).toBe(true);
  });

  it('stores them as provenance-labelled claims, backfills an unchanged observation, and lets traits use them', async () => {
    const p = await scento.fetchProfile('boss-bottled-elixir-hugo-boss');
    const { fragranceId } = await enrichExact(rp.get(), p);
    const fields = await effectiveProfile(rp.get(), fragranceId);
    expect(fields.listed_notes).toMatchObject({ value: ['Incense', 'Vetiver', 'Cedarwood'], origin: 'provider', source: { provider: 'scento' } });
    expect(fields.signature_materials?.value).toEqual(['Vetiver', 'Cedarwood']);
    expect(fields.pyramid?.origin).not.toBe('provider'); // the all-unknown Scento pyramid states nothing; no tier is invented
    // (another test may have saved a web-research pyramid for this same real fragrance)
    expect((await rp.get().query("SELECT count(*)::int AS n FROM app.fragrance_notes n JOIN app.source_claims c ON c.id = n.source_claim_id WHERE n.fragrance_id = $1 AND c.origin = 'provider'", [fragranceId])).rows[0].n).toBe(0);

    // An observation stored before this field existed gains it on the next identical fetch.
    await rp.get().query("DELETE FROM app.source_claims WHERE fragrance_id = $1 AND field_name IN ('listed_notes','signature_materials')", [fragranceId]);
    await enrichExact(rp.get(), p);
    expect((await effectiveProfile(rp.get(), fragranceId)).listed_notes?.value).toEqual(['Incense', 'Vetiver', 'Cedarwood']);

    const dna = deriveDna(fields);
    expect(dna.notes.map((n) => n.label)).toEqual(['Incense', 'Vetiver', 'Cedarwood']);
    expect(dna.traits.find((t) => t.code === 'smoky')?.score).toBe(3); // incense rule, from an untiered source note
  });
});
