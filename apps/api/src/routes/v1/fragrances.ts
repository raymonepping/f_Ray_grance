// Discover → resolve → (confirm) enrich, plus drafts, refresh, user corrections and the
// provenance-labelled profile. All routes are owner-protected (registered under requireOwner)
// and mutations are CSRF-checked globally. Nothing personal is sent to Scento.
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import { normalizeGtin } from '../../domain/gtin.js';
import { normalizeIdentity } from '../../domain/identity.js';
import { brandKey } from '../../domain/brands.js';
import { CONCENTRATIONS, mapConcentration } from '../../domain/concentration.js';
import { resolve } from '../../domain/resolver.js';
import { SourceError, type ScentoClient } from '../../providers/scento.js';
import {
  addUserClaim,
  createDraft,
  effectiveProfile,
  enrichExact,
  findLocalExact,
  findVerifiedGtin,
  refreshFromProvider,
  USER_EDITABLE_FIELDS,
} from '../../repo/enrichment.js';
import { getFragrance } from '../../repo/catalog.js';
import type { RotatingPool } from '../../db/pool.js';

const Uuid = Type.String({ format: 'uuid' });
const Name = Type.String({ minLength: 1, maxLength: 120 });
const Conc = Type.Union(CONCENTRATIONS.map((c) => Type.Literal(c)));
const NoteList = Type.Union([Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 30 }), Type.Null()]);

function sourceFailure(err: unknown): never {
  if (err instanceof SourceError) {
    if (err.code === 'SOURCE_RATE_LIMITED') throw new ApiError('RATE_LIMITED', 'Scento rate limit; retry later', { source: err.code, retryAfterSeconds: err.retryAfterSeconds });
    if (err.code === 'NOT_FOUND') throw new ApiError('NOT_FOUND', 'Scento record not found', { source: err.code });
    throw new ApiError('DEPENDENCY_UNAVAILABLE', 'Scento is unavailable or changed; stored data remains usable', { source: err.code });
  }
  throw err;
}

export async function fragranceRoutes(base: FastifyInstance, deps: { pool: RotatingPool; scento: ScentoClient }): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const db = () => deps.pool.get();
  const limited = { rateLimit: { max: 20, timeWindow: '1 minute' } };

  app.post(
    '/fragrances/resolve',
    {
      config: limited,
      schema: {
        body: Type.Union([
          Type.Object({ brand: Name, name: Name, concentration: Type.Optional(Conc) }, { additionalProperties: false }),
          Type.Object({ gtin: Type.String({ minLength: 8, maxLength: 20 }) }, { additionalProperties: false }),
        ]),
      },
    },
    async (req) => {
      const body = req.body;
      if ('gtin' in body) {
        const g = normalizeGtin(body.gtin);
        if (!g.ok) throw new ApiError('VALIDATION_FAILED', 'Invalid barcode', { reason: g.reason });
        const hit = await findVerifiedGtin(db(), g.gtin14);
        if (hit) return { state: 'exact', reason: 'verified local GTIN mapping', gtin14: g.gtin14, checksumValid: true, catalogConfirmed: true, local: hit, candidates: [] };
        return {
          state: 'unresolved',
          errorCode: 'NO_APPROVED_BARCODE_RESOLVER',
          reason: 'check digit is valid, but no verified mapping exists and no external barcode source is approved; search by brand and name',
          gtin14: g.gtin14,
          checksumValid: true,
          catalogConfirmed: false,
          candidates: [],
        };
      }
      return resolve(
        { scento: deps.scento, findLocal: (i) => findLocalExact(db(), i) },
        { brand: body.brand, name: body.name, concentration: body.concentration ?? null },
      );
    },
  );

  // The client sends the candidate it confirmed; the server re-verifies exactness itself.
  app.post(
    '/fragrances/enrich',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: Type.Object(
          { providerId: Type.String({ pattern: '^[a-z0-9-]{1,120}$' }), brand: Name, name: Name, concentration: Type.Optional(Conc) },
          { additionalProperties: false },
        ),
      },
    },
    async (req, reply) => {
      const b = req.body;
      const p = await deps.scento.fetchProfile(b.providerId).catch(sourceFailure);
      const nameOk = normalizeIdentity(p.name) === normalizeIdentity(b.name);
      const brandOk = brandKey(p.house) === brandKey(b.brand);
      const concOk = !b.concentration || mapConcentration(p.concentrationRaw) === b.concentration;
      if (!nameOk || !brandOk || !concOk) {
        throw new ApiError('CONFLICT', 'Scento record is not the confirmed identity; nothing was saved', {
          scento: { name: p.name, house: p.house, concentration: p.concentrationRaw },
          mismatch: { name: !nameOk, brand: !brandOk, concentration: !concOk },
        });
      }
      const out = await enrichExact(db(), p);
      return reply.code(out.created ? 201 : 200).send({ ...out, partial: p.partial, sourceUrl: p.sourceUrl, attribution: p.attribution });
    },
  );

  app.post(
    '/fragrances/drafts',
    { schema: { body: Type.Object({ brand: Name, name: Name, concentration: Type.Optional(Conc) }, { additionalProperties: false }) } },
    async (req, reply) => {
      const out = await createDraft(db(), { brand: req.body.brand, name: req.body.name, concentration: req.body.concentration ?? null });
      return reply.code(out.created ? 201 : 200).send({ ...out, identityStatus: 'draft' });
    },
  );

  app.post(
    '/fragrances/:id/refresh',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { params: Type.Object({ id: Uuid }, { additionalProperties: false }) } },
    async (req) => {
      const { rows } = await db().query<{ external_id: string }>(
        `SELECT r.external_id FROM app.source_claims c JOIN app.source_records r ON r.id = c.source_record_id
          WHERE c.fragrance_id = $1 AND r.provider = 'scento' ORDER BY r.checked_at DESC LIMIT 1`,
        [req.params.id],
      );
      if (!rows[0]) throw new ApiError('NOT_FOUND', 'No Scento source recorded for this fragrance');
      const p = await deps.scento.fetchProfile(rows[0].external_id).catch(sourceFailure);
      try {
        return await refreshFromProvider(db(), req.params.id, p);
      } catch (err) {
        if ((err as Error).message === 'IDENTITY_CHANGED') throw new ApiError('CONFLICT', 'Scento now describes a different identity; refresh refused');
        throw err;
      }
    },
  );

  app.post(
    '/fragrances/:id/claims',
    {
      schema: {
        params: Type.Object({ id: Uuid }, { additionalProperties: false }),
        body: Type.Union([
          Type.Object({ field: Type.Literal('pyramid'), value: Type.Object({ top: NoteList, heart: NoteList, base: NoteList }, { additionalProperties: false }) }, { additionalProperties: false }),
          Type.Object({ field: Type.Literal('concentration'), value: Conc }, { additionalProperties: false }),
          Type.Object({ field: Type.Literal('launch_year'), value: Type.Integer({ minimum: 1700, maximum: 2100 }) }, { additionalProperties: false }),
          Type.Object(
            { field: Type.Union([Type.Literal('family'), Type.Literal('subfamily'), Type.Literal('character')]), value: Type.String({ minLength: 1, maxLength: 500 }) },
            { additionalProperties: false },
          ),
        ]),
      },
    },
    async (req, reply) => {
      if (!(await getFragrance(db(), req.params.id))) throw new ApiError('NOT_FOUND', 'Fragrance not found');
      const field = req.body.field as (typeof USER_EDITABLE_FIELDS)[number];
      const claimId = await addUserClaim(db(), req.params.id, field, req.body.value);
      return reply.code(201).send({ claimId, origin: 'user' });
    },
  );

  app.get('/fragrances/:id/profile', { schema: { params: Type.Object({ id: Uuid }, { additionalProperties: false }) } }, async (req) => {
    const f = await getFragrance(db(), req.params.id);
    if (!f) throw new ApiError('NOT_FOUND', 'Fragrance not found');
    return { fragrance: f, fields: await effectiveProfile(db(), req.params.id) };
  });
}
