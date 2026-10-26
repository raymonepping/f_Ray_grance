// Fastify application factory (no listen) — used by server.ts and by tests via inject().
import { randomUUID } from 'node:crypto';
import { buildSources, type ImageSources } from './images/sources.js';
import { AssetStore } from './images/store.js';
import { TinyFishClient } from './providers/tinyfish.js';
import type { ImageLookupDeps } from './routes/v1/images.js';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import addFormats from 'ajv-formats';
import { ApiError, DB_RECONNECTING, envelope, statusFor } from './errors.js';
import { securityPlugin } from './security/plugin.js';
import { healthRoutes } from './routes/health.js';
import { v1Routes } from './routes/v1/index.js';
import { authRoutes } from './routes/auth.js';
import type { SessionKey } from './security/session-key.js';
import { ScentoClient } from './providers/scento.js';
import { OllamaClient } from './providers/ollama.js';
import type { Config } from './config.js';
import type { RotatingPool } from './db/pool.js';

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export interface AppDeps {
  config: Config;
  pool: RotatingPool;
  key: SessionKey;
  expectedSchemaVersion: number;
  scento?: ScentoClient;
  ollama?: OllamaClient;
  imageSources?: ImageSources;
  assetStore?: AssetStore;
  tinyfish?: TinyFishClient;
  imageLookup?: Partial<ImageLookupDeps>;
  logger?: boolean | object;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const options: FastifyServerOptions = {
    logger: deps.logger ?? {
      level: deps.config.logLevel,
      // Never log cookies, auth material or bodies (bodies may hold personal notes).
      redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'], remove: true },
    },
    // Forwarded headers are honoured only from the configured gateway (fray-web).
    trustProxy: deps.config.trustedProxies.length > 0 ? deps.config.trustedProxies : false,
    bodyLimit: 64 * 1024,
    requestIdHeader: false,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    },
    ajv: {
      customOptions: { removeAdditional: false, coerceTypes: 'array', useDefaults: true } as Record<string, unknown>,
      plugins: [addFormats as never],
    },
  };
  const app = Fastify(options);

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.status).send(envelope(err.code, err.message, req.id, err.details));
    }
    const e = err as { validation?: unknown; statusCode?: number; code?: string; message?: string };
    if (e.validation) {
      return reply.code(400).send(envelope('VALIDATION_FAILED', 'Request did not match the schema', req.id, e.validation));
    }
    if (e.statusCode === 429) {
      return reply.code(429).header('retry-after', '60').send(envelope('RATE_LIMITED', 'Too many requests', req.id));
    }
    if (e.statusCode === 400 && typeof e.code === 'string' && e.code.startsWith('FST_ERR_')) {
      return reply.code(400).send(envelope('VALIDATION_FAILED', 'Malformed request body', req.id));
    }
    if (e.statusCode === 415 || e.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply.code(415).send(envelope('VALIDATION_FAILED', 'Unsupported content type', req.id));
    }
    if (e.statusCode === 413 || e.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send(envelope('VALIDATION_FAILED', 'Payload too large', req.id));
    }
    // Revoked/rotated login or terminated backend: rebuild the pool now, answer 503 meanwhile.
    if (e.code && ['28P01', '28000', '57P01', '57P02', '57P03', '08006'].includes(e.code)) {
      void deps.pool.refresh();
      req.log.warn({ pgcode: e.code }, 'database credentials rejected or connection terminated');
      return reply.code(503).send(envelope('DEPENDENCY_UNAVAILABLE', DB_RECONNECTING, req.id, { source: 'database' }));
    }
    if (typeof e.message === 'string' && /pool not initialised|credentials|ECONNREFUSED|terminating connection|password authentication/i.test(e.message)) {
      void deps.pool.refresh();
      req.log.warn({ err: e.message }, 'dependency unavailable');
      return reply.code(503).send(envelope('DEPENDENCY_UNAVAILABLE', DB_RECONNECTING, req.id, { source: 'database' }));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(statusFor('INTERNAL')).send(envelope('INTERNAL', 'Internal error', req.id));
  });

  app.setNotFoundHandler((req, reply) => reply.code(404).send(envelope('NOT_FOUND', 'Route not found', req.id)));

  await app.register(cookie);
  await app.register(securityPlugin, {
    pool: deps.pool,
    key: deps.key,
    idleMinutes: deps.config.session.idleMinutes,
    publicOrigins: deps.config.publicOrigins,
  });
  await app.register(healthRoutes, { pool: deps.pool, key: deps.key, expectedSchemaVersion: deps.expectedSchemaVersion });
  await app.register(authRoutes, {
    prefix: '/api/v1',
    pool: deps.pool,
    key: deps.key,
    ttlHours: deps.config.session.ttlHours,
    lockout: deps.config.lockout,
    loginRatePerMinute: deps.config.loginRatePerMinute,
  });
  await app.register(v1Routes, { prefix: '/api/v1', pool: deps.pool, scento: deps.scento ?? new ScentoClient(), ollama: deps.ollama ?? new OllamaClient(fetch, 'http://fray-ollama:11434', deps.config.tutorModel), importEnabled: deps.config.importEnabled, imageSources: deps.imageSources ?? buildSources(deps.config.images), assetStore: deps.assetStore ?? new AssetStore(deps.config.images.dir), tinyfish: deps.tinyfish ?? new TinyFishClient(deps.config.tinyfishKeyFile), imageLookup: deps.imageLookup ?? {} });
  return app;
}
