// Protected API namespace. requireOwner runs before every handler registered here.
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import { requireOwner } from '../../security/plugin.js';
import { getFragrance, searchFragrances } from '../../repo/catalog.js';
import type { RotatingPool } from '../../db/pool.js';
import type { ScentoClient } from '../../providers/scento.js';
import rateLimit from '@fastify/rate-limit';
import { fragranceRoutes } from './fragrances.js';
import { collectionRoutes } from './collection.js';
import { compareRoutes } from './compare.js';
import { discoveryRoutes } from './discovery.js';
import type { OllamaClient } from '../../providers/ollama.js';
import { seasonRoutes } from './seasons.js';
import { academyRoutes } from './academy.js';
import { portabilityRoutes } from './portability.js';
import { imageRoutes } from './images.js';
import { researchRoutes } from './research.js';
import { lookupRoutes } from './lookup.js';
import { spectrumRoutes } from './spectrum.js';
import type { TinyFishClient } from '../../providers/tinyfish.js';
import type { ImageSources } from '../../images/sources.js';
import type { AssetStore } from '../../images/store.js';

const Uuid = Type.String({ format: 'uuid' });

// Registered inside its own encapsulated context so requireOwner applies to these routes only.
export async function v1Routes(base: FastifyInstance, deps: { pool: RotatingPool; scento: ScentoClient; ollama: OllamaClient; importEnabled: boolean; imageSources: ImageSources; assetStore: AssetStore; tinyfish: TinyFishClient; imageLookup?: Partial<import('./images.js').ImageLookupDeps> }): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  // onRequest (not preHandler): anonymous callers get 401 before body validation can reveal schemas.
  app.addHook('onRequest', requireOwner);
  await app.register(rateLimit, { global: false });
  await app.register(fragranceRoutes, { pool: deps.pool, scento: deps.scento });
  await app.register(collectionRoutes, { pool: deps.pool });
  await app.register(compareRoutes, { pool: deps.pool });
  await app.register(discoveryRoutes, { pool: deps.pool, ollama: deps.ollama });
  await app.register(seasonRoutes, { pool: deps.pool });
  await app.register(academyRoutes, { pool: deps.pool, scento: deps.scento, ollama: deps.ollama });
  await app.register(portabilityRoutes, { pool: deps.pool, importEnabled: deps.importEnabled });
  await app.register(imageRoutes, { pool: deps.pool, sources: deps.imageSources, store: deps.assetStore, tinyfish: deps.tinyfish, ...deps.imageLookup });
  await app.register(researchRoutes, { pool: deps.pool, tinyfish: deps.tinyfish });
  await app.register(spectrumRoutes, { pool: deps.pool });
  await app.register(lookupRoutes, { pool: deps.pool, scento: deps.scento, tinyfish: deps.tinyfish, ...(deps.imageLookup?.http ? { http: deps.imageLookup.http } : {}) });
  const db = () => deps.pool.get();

  app.get('/session', async (req) => ({ owner: req.session!.owner }));

  // What the server can truthfully report. Backup state lives on the operator's Mac
  // (outside the containers), so it is reported as not available rather than guessed.
  app.get('/system/status', async () => {
    const { rows } = await db().query<{ last: Date | null; verified: number }>(
      `SELECT (SELECT max(checked_at) FROM app.source_records WHERE provider = 'scento') AS last,
              (SELECT count(*)::int FROM app.fragrances WHERE identity_status = 'verified') AS verified`,
    );
    return {
      scento: { lastCheckedAt: rows[0]?.last?.toISOString() ?? null, verifiedFragrances: rows[0]?.verified ?? 0 },
      backup: { reported: false, lastManualBackupAt: null, lastVerifiedRestoreAt: null },
    };
  });

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

}
