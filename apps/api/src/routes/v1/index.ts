// Protected API namespace. requireOwner runs before every handler registered here.
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import { requireOwner } from '../../security/plugin.js';
import { getFragrance, searchFragrances } from '../../repo/catalog.js';
import { entryHistory, listEntries } from '../../repo/collection.js';
import { COLLECTION_STATES } from '../../domain/identity.js';
import type { RotatingPool } from '../../db/pool.js';

const Uuid = Type.String({ format: 'uuid' });

// Registered inside its own encapsulated context so requireOwner applies to these routes only.
export async function v1Routes(base: FastifyInstance, deps: { pool: RotatingPool }): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  app.addHook('preHandler', requireOwner);
  const db = () => deps.pool.get();

  app.get('/session', async (req) => ({ owner: req.session!.owner }));

  app.get(
    '/fragrances',
    {
      schema: {
        querystring: Type.Object(
          {
            query: Type.Optional(Type.String({ maxLength: 120 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
            offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 10_000, default: 0 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (req) => {
      const { query = '', limit = 25, offset = 0 } = req.query;
      return { items: await searchFragrances(db(), query, limit, offset), limit, offset };
    },
  );

  app.get(
    '/fragrances/:id',
    { schema: { params: Type.Object({ id: Uuid }, { additionalProperties: false }) } },
    async (req) => {
      const f = await getFragrance(db(), req.params.id);
      if (!f) throw new ApiError('NOT_FOUND', 'Fragrance not found');
      return f;
    },
  );

  app.get(
    '/collection',
    {
      schema: {
        querystring: Type.Object(
          { state: Type.Optional(Type.Union(COLLECTION_STATES.map((s) => Type.Literal(s)))) },
          { additionalProperties: false },
        ),
      },
    },
    async (req) => ({ items: await listEntries(db(), req.session!.owner.id, req.query.state) }),
  );

  app.get(
    '/collection/:id/history',
    { schema: { params: Type.Object({ id: Uuid }, { additionalProperties: false }) } },
    async (req) => {
      const events = await entryHistory(db(), req.session!.owner.id, req.params.id);
      if (!events) throw new ApiError('NOT_FOUND', 'Collection entry not found');
      return { items: events };
    },
  );
}
