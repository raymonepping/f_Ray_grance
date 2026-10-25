// Personal collection (spec/PRODUCT_SPEC.md §3.1, DATA_MODEL.md §2). Every query is
// owner-scoped; another owner's entry is indistinguishable from a missing one (404).
// State changes are transitions with append-only history, never destructive edits.
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import { COLLECTION_STATES } from '../../domain/identity.js';
import { normalizeGtin } from '../../domain/gtin.js';
import { getFragrance } from '../../repo/catalog.js';
import {
  createEntryIdempotent,
  entriesForFragrance,
  entryHistory,
  getEntry,
  listEntries,
  updateEntry,
} from '../../repo/collection.js';
import type { RotatingPool } from '../../db/pool.js';

const Uuid = Type.String({ format: 'uuid' });
const State = Type.Union(COLLECTION_STATES.map((s) => Type.Literal(s)));
const Rating = Type.Union([Type.Integer({ minimum: 1, maximum: 5 }), Type.Null()]);
const Note = Type.Union([Type.String({ maxLength: 4000 }), Type.Null()]);
const Day = Type.Union([Type.String({ format: 'date' }), Type.Null()]);
const Reason = Type.Union([Type.String({ maxLength: 1000 }), Type.Null()]);

export async function collectionRoutes(base: FastifyInstance, deps: { pool: RotatingPool }): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const db = () => deps.pool.get();

  async function assertVariant(fragranceId: string, variantId: string | null | undefined) {
    if (!variantId) return;
    const { rowCount } = await db().query('SELECT 1 FROM app.product_variants WHERE id = $1 AND fragrance_id = $2', [variantId, fragranceId]);
    if (!rowCount) throw new ApiError('VALIDATION_FAILED', 'That size/barcode belongs to a different fragrance');
  }

  app.get(
    '/collection',
    {
      schema: {
        querystring: Type.Object(
          {
            state: Type.Optional(State),
            q: Type.Optional(Type.String({ maxLength: 120 })),
            sort: Type.Optional(Type.Union([Type.Literal('recent'), Type.Literal('name'), Type.Literal('brand'), Type.Literal('rating')])),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (req) => ({ items: await listEntries(db(), req.session!.owner.id, req.query.state, { q: req.query.q ?? '', sort: req.query.sort ?? 'recent' }) }),
  );

  app.post(
    '/collection',
    {
      schema: {
        body: Type.Object(
          {
            clientRequestId: Type.Optional(Uuid),
            fragranceId: Uuid,
            state: State,
            variantId: Type.Optional(Type.Union([Uuid, Type.Null()])),
            rating: Type.Optional(Rating),
            personalNote: Type.Optional(Note),
            acquiredOn: Type.Optional(Day),
            reason: Type.Optional(Reason),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (req, reply) => {
      const b = req.body;
      if (!(await getFragrance(db(), b.fragranceId))) throw new ApiError('NOT_FOUND', 'Fragrance not found');
      await assertVariant(b.fragranceId, b.variantId);
      const { entry, created } = await createEntryIdempotent(db(), req.session!.owner.id, {
        clientRequestId: b.clientRequestId ?? null,
        fragranceId: b.fragranceId,
        state: b.state,
        variantId: b.variantId ?? null,
        rating: b.rating ?? null,
        personalNote: b.personalNote ?? null,
        acquiredOn: b.acquiredOn ?? null,
        reason: b.reason ?? null,
      });
      return reply.code(created ? 201 : 200).send({ entry, created });
    },
  );

  app.get('/collection/:id', { schema: { params: Type.Object({ id: Uuid }, { additionalProperties: false }) } }, async (req) => {
    const owner = req.session!.owner.id;
    const entry = await getEntry(db(), owner, req.params.id);
    if (!entry) throw new ApiError('NOT_FOUND', 'Collection entry not found');
    return { entry, history: (await entryHistory(db(), owner, req.params.id)) ?? [] };
  });

  app.patch(
    '/collection/:id',
    {
      schema: {
        params: Type.Object({ id: Uuid }, { additionalProperties: false }),
        body: Type.Object(
          {
            state: Type.Optional(State),
            reason: Type.Optional(Reason),
            rating: Type.Optional(Rating),
            personalNote: Type.Optional(Note),
            acquiredOn: Type.Optional(Day),
            variantId: Type.Optional(Type.Union([Uuid, Type.Null()])),
          },
          { additionalProperties: false, minProperties: 1 },
        ),
      },
    },
    async (req) => {
      const owner = req.session!.owner.id;
      const current = await getEntry(db(), owner, req.params.id);
      if (!current) throw new ApiError('NOT_FOUND', 'Collection entry not found');
      await assertVariant(current.fragrance_id, req.body.variantId);
      const p = req.body;
      const entry = await updateEntry(db(), owner, req.params.id, {
        ...(p.state !== undefined ? { state: p.state } : {}),
        ...(p.reason !== undefined ? { reason: p.reason } : {}),
        ...(p.rating !== undefined ? { rating: p.rating } : {}),
        ...(p.personalNote !== undefined ? { personalNote: p.personalNote } : {}),
        ...(p.acquiredOn !== undefined ? { acquiredOn: p.acquiredOn } : {}),
        ...(p.variantId !== undefined ? { variantId: p.variantId } : {}),
      });
      return { entry, history: (await entryHistory(db(), owner, req.params.id)) ?? [] };
    },
  );

  app.get('/collection/:id/history', { schema: { params: Type.Object({ id: Uuid }, { additionalProperties: false }) } }, async (req) => {
    const events = await entryHistory(db(), req.session!.owner.id, req.params.id);
    if (!events) throw new ApiError('NOT_FOUND', 'Collection entry not found');
    return { items: events };
  });

  /** This owner's relationship to one fragrance: every entry (any size/state) with history. */
  app.get('/fragrances/:id/relationship', { schema: { params: Type.Object({ id: Uuid }, { additionalProperties: false }) } }, async (req) => {
    const owner = req.session!.owner.id;
    const entries = await entriesForFragrance(db(), owner, req.params.id);
    const withHistory = await Promise.all(entries.map(async (e) => ({ ...e, history: (await entryHistory(db(), owner, e.id)) ?? [] })));
    const variants = await db().query(
      `SELECT id, gtin14, bottle_ml, packaging_type, verification_state FROM app.product_variants WHERE fragrance_id = $1 ORDER BY bottle_ml NULLS LAST, id`,
      [req.params.id],
    );
    return { entries: withHistory, variants: variants.rows };
  });

  /** Record a package size / barcode for a fragrance. Owner-confirmed barcodes become verified mappings. */
  app.post(
    '/fragrances/:id/variants',
    {
      schema: {
        params: Type.Object({ id: Uuid }, { additionalProperties: false }),
        body: Type.Object(
          {
            gtin: Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
            bottleMl: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 5000 })),
            packagingType: Type.Optional(Type.String({ maxLength: 60 })),
            confirmed: Type.Optional(Type.Boolean()),
          },
          { additionalProperties: false, minProperties: 1 },
        ),
      },
    },
    async (req, reply) => {
      if (!(await getFragrance(db(), req.params.id))) throw new ApiError('NOT_FOUND', 'Fragrance not found');
      let gtin14: string | null = null;
      let raw: string | null = null;
      if (req.body.gtin) {
        const g = normalizeGtin(req.body.gtin);
        if (!g.ok) throw new ApiError('VALIDATION_FAILED', 'Invalid barcode', { reason: g.reason });
        gtin14 = g.gtin14;
        raw = g.raw;
      }
      const verified = Boolean(req.body.confirmed && gtin14);
      try {
        const { rows } = await db().query(
          `INSERT INTO app.product_variants (fragrance_id, gtin14, raw_barcode, bottle_ml, packaging_type, verification_state, verified_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, gtin14, bottle_ml, packaging_type, verification_state`,
          [req.params.id, gtin14, raw, req.body.bottleMl ?? null, req.body.packagingType ?? null, verified ? 'verified' : 'unverified', verified ? 'owner-confirmed' : null],
        );
        return reply.code(201).send(rows[0]);
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw new ApiError('CONFLICT', 'This barcode is already confirmed for a fragrance', { gtin14 });
        }
        throw err;
      }
    },
  );
}
