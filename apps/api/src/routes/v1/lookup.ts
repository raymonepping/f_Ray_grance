// Quick find for Discover: one box for a name, part of a name, a brand, or a barcode (EAN/UPC),
// like ISBN for books. It only SUGGESTS: identity is still decided by the exact resolver
// (/fragrances/resolve) or, when Scento lacks the fragrance, by the owner creating a draft.
//  - Barcode: a verified local mapping wins; otherwise Open Beauty Facts gives the product title,
//    else (when configured) a TinyFish web search of the code gives title hints. The title is
//    cleaned into brand + name and searched in Scento. Similar names are never substituted.
//  - Text: Scento search.
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { RotatingPool } from '../../db/pool.js';
import { normalizeGtin } from '../../domain/gtin.js';
import { normalizeIdentity } from '../../domain/identity.js';
import { hintFromProductTitle, type BarcodeHint } from '../../domain/barcode-hint.js';
import { lookupBarcode } from '../../images/lookup.js';
import { findVerifiedGtin } from '../../repo/enrichment.js';
import { SourceError, type ScentoClient, type SearchCandidate } from '../../providers/scento.js';
import { TinyFishError, type TinyFishClient } from '../../providers/tinyfish.js';

export async function lookupRoutes(base: FastifyInstance, deps: { pool: RotatingPool; scento: ScentoClient; tinyfish: TinyFishClient; http?: typeof fetch }): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const db = () => deps.pool.get();

  async function scentoSuggest(query: string): Promise<{ suggestions: SearchCandidate[]; sourceDown: boolean }> {
    try {
      return { suggestions: (await deps.scento.search(query)).filter((c) => c.providerId).slice(0, 8), sourceDown: false };
    } catch (e) {
      if (e instanceof SourceError) return { suggestions: [], sourceDown: true };
      throw e;
    }
  }
  const sameName = (a: string, b: string) => normalizeIdentity(a) === normalizeIdentity(b);

  app.post(
    '/fragrances/lookup',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { body: Type.Object({ query: Type.String({ minLength: 2, maxLength: 120 }) }, { additionalProperties: false }) } },
    async (req) => {
      const q = req.body.query.trim();
      const digits = q.replace(/[\s-]/g, '');
      if (!/^\d{8,14}$/.test(digits)) {
        const r = await scentoSuggest(q);
        return { kind: 'text', query: q, ...r };
      }
      const g = normalizeGtin(digits);
      if (!g.ok) return { kind: 'barcode', query: q, invalid: true, message: 'That barcode is not valid (check the digits).', suggestions: [], sourceDown: false };
      const local = await findVerifiedGtin(db(), g.gtin14);
      if (local) {
        const f = (await db().query<{ name: string; brand: string }>('SELECT f.canonical_name AS name, b.canonical_name AS brand FROM app.fragrances f JOIN app.brands b ON b.id = f.brand_id WHERE f.id = $1', [local.fragrance_id])).rows[0];
        return { kind: 'barcode', query: q, gtin14: g.gtin14, local: { fragranceId: local.fragrance_id, ...f }, suggestions: [], sourceDown: false };
      }
      // 1) Open Beauty Facts product title.
      let hint: (BarcodeHint & { source: 'Open Beauty Facts' | 'Web search'; title: string; url: string | null }) | null = null;
      const obf = await lookupBarcode(digits, deps.http);
      if (obf.found && (obf.productName || obf.brands)) {
        const prelim = hintFromProductTitle(obf.productName, obf.brands);
        const houses = (await scentoSuggest(prelim.query)).suggestions.map((s) => s.house);
        hint = { ...hintFromProductTitle(obf.productName, obf.brands, houses), source: 'Open Beauty Facts', title: [obf.brands, obf.productName].filter(Boolean).join(' · '), url: obf.productUrl };
      }
      // 2) Otherwise a web search of the code itself (lower trust; shown as a hint only).
      let webTitles: { title: string; url: string; siteName: string }[] = [];
      if (!hint && (await deps.tinyfish.enabled())) {
        try {
          webTitles = (await deps.tinyfish.search(`"${g.gtin14.replace(/^0+/, '')}" perfume`)).slice(0, 5).map((r) => ({ title: r.title, url: r.url, siteName: r.siteName }));
          const first = webTitles.find((w) => w.title.length > 3);
          if (first) {
            const prelim = hintFromProductTitle(first.title, '');
            const houses = (await scentoSuggest(prelim.query)).suggestions.map((s) => s.house);
            hint = { ...hintFromProductTitle(first.title, '', houses), source: 'Web search', title: first.title, url: first.url };
          }
        } catch (e) {
          if (!(e instanceof TinyFishError)) throw e;
        }
      }
      if (!hint) {
        return { kind: 'barcode', query: q, gtin14: g.gtin14, hint: null, webTitles, suggestions: [], sourceDown: false, message: 'This barcode is not in Open Beauty Facts. Search by brand and name instead; the barcode is kept for when you save.' };
      }
      const r = await scentoSuggest(hint.query);
      return {
        kind: 'barcode',
        query: q,
        gtin14: g.gtin14,
        hint,
        webTitles,
        ...r,
        suggestions: r.suggestions.map((s) => ({ ...s, exactToHint: sameName(s.name, hint!.name) && (!hint!.brand || sameName(s.house, hint!.brand)) })),
      };
    },
  );
}
