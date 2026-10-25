// Liveness (process up) vs readiness (database reachable with current credentials
// AND schema at the version this build expects). Dependency details stay coarse.
import type { FastifyInstance } from 'fastify';
import type { RotatingPool } from '../db/pool.js';
import type { SessionKey } from '../security/session-key.js';

export interface HealthDeps {
  pool: RotatingPool;
  key: SessionKey;
  expectedSchemaVersion: number;
}

export async function healthRoutes(app: FastifyInstance, deps: HealthDeps): Promise<void> {
  app.get('/api/health/live', async () => ({ status: 'live' }));

  app.get('/api/health/ready', async (_req, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = { database: 'fail', schema: 'fail', session_key: deps.key.ready ? 'ok' : 'fail' };
    try {
      const { rows } = await deps.pool.get().query<{ v: number | null }>(
        "SELECT (SELECT max(version) FROM app.schema_migrations) AS v",
      );
      checks.database = 'ok';
      checks.schema = rows[0]?.v === deps.expectedSchemaVersion ? 'ok' : 'fail';
    } catch {
      // keep 'fail'
    }
    const ready = Object.values(checks).every((c) => c === 'ok');
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  });
}
