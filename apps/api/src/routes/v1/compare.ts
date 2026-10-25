import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import { getFragrance } from '../../repo/catalog.js';
import { effectiveProfile } from '../../repo/enrichment.js';
import { contrast, deriveDna, TRAIT_METHOD } from '../../domain/dna.js';
import type { RotatingPool } from '../../db/pool.js';
import { SeasonSchema } from '../../domain/seasons.js';

export async function compareRoutes(base: FastifyInstance, deps: { pool: RotatingPool }) {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const Uuid = Type.String({ format: 'uuid' });
  async function profile(id: string, ownerId: string, personal = true, season?:string) {
    const db = deps.pool.get();
    const fragrance = await getFragrance(db, id);
    if (!fragrance) throw new ApiError('NOT_FOUND', 'Fragrance not found');
    const fields = await effectiveProfile(db, id);
    const collection = personal ? (await db.query('SELECT state FROM app.collection_entries WHERE owner_id=$1 AND fragrance_id=$2 ORDER BY created_at', [ownerId, id])).rows : [];
    const seasons = personal ? (await db.query("SELECT season, affinity, affinity_origin FROM app.season_fragrances WHERE owner_id=$1 AND fragrance_id=$2 AND affinity_origin='user' AND ($3::text IS NULL OR season=$3) ORDER BY season", [ownerId, id, season??null])).rows : [];
    const image = (await db.query<{ id: string | null }>('SELECT app.primary_image($1, $2, NULL) AS id', [ownerId, id])).rows[0]?.id ?? null;
    return { fragrance, fields, ...deriveDna(fields), collection, personalSeasons: seasons, primaryImageId: image };
  }
  app.get('/fragrances/:id/dna', { schema: { params: Type.Object({ id: Uuid }, { additionalProperties: false }) } }, async (req) => profile(req.params.id, req.session!.owner.id));
  app.post('/compare', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { body: Type.Object({
      fragranceIds: Type.Array(Uuid, { minItems: 2, maxItems: 2, uniqueItems: true }),
      traitMethod: Type.Optional(Type.Literal(TRAIT_METHOD)),
      includePersonalSeasonContext: Type.Optional(Type.Boolean({ default: true })),
      season: Type.Optional(SeasonSchema),
    }, { additionalProperties: false }) },
  }, async (req) => {
    const [a, b] = await Promise.all(req.body.fragranceIds.map((id) => profile(id, req.session!.owner.id, req.body.includePersonalSeasonContext,req.body.season)));
    if (a!.fragrance.identity_status !== 'verified' || b!.fragrance.identity_status !== 'verified') throw new ApiError('CONFLICT', 'Select two verified fragrance identities; drafts require review');
    return { fragrances: [a!, b!], explanation: contrast(a!, b!), method: TRAIT_METHOD };
  });
}
