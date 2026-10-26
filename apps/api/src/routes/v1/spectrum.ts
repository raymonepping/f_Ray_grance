// My Spectrum API (Phase 13, spec/SPECTRUM_SPEC.md). Owner-scoped and read-only: computed on read
// from the owner's own owned (optionally sampled) fragrances; nothing is stored or sent anywhere.
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { RotatingPool } from '../../db/pool.js';
import { deriveDna } from '../../domain/dna.js';
import { computeSpectrum, type SpectrumInput } from '../../domain/spectrum.js';
import { effectiveProfile } from '../../repo/enrichment.js';

export async function spectrumRoutes(base: FastifyInstance, deps: { pool: RotatingPool }): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const db = () => deps.pool.get();

  app.get(
    '/profile/spectrum',
    { schema: { querystring: Type.Object({ scope: Type.Optional(Type.Union([Type.Literal('owned'), Type.Literal('owned_and_samples')])) }, { additionalProperties: false }) } },
    async (req) => {
      const scope = req.query.scope ?? 'owned';
      const states = scope === 'owned' ? ['owned'] : ['owned', 'sampled'];
      // One row per fragrance: several bottles of the same fragrance count once.
      const { rows } = await db().query<{ id: string; brand: string; name: string }>(
        `SELECT DISTINCT f.id, b.canonical_name AS brand, f.canonical_name AS name
           FROM app.collection_entries e JOIN app.fragrances f ON f.id = e.fragrance_id JOIN app.brands b ON b.id = f.brand_id
          WHERE e.owner_id = $1 AND e.state = ANY($2::text[])
          ORDER BY name, brand, f.id`,
        [req.session!.owner.id, states],
      );
      const items: SpectrumInput[] = [];
      for (const r of rows) {
        const fields = await effectiveProfile(db(), r.id);
        const dna = deriveDna(fields);
        const fam = fields.family?.value;
        items.push({ id: r.id, brand: r.brand, name: r.name, family: typeof fam === 'string' ? fam : null, traits: Object.fromEntries(dna.traits.map((t) => [t.code, t.score])) });
      }
      return { scope, ...computeSpectrum(items) };
    },
  );
}
