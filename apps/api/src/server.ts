import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { RotatingPool } from './db/pool.js';
import { loadMigrations } from './db/migrate.js';
import { SessionKey } from './security/session-key.js';

const config = loadConfig();
const migrations = await loadMigrations(config.migrationsDir);
const expected = migrations.at(-1)?.version ?? 0;
const bootLog = { info: console.log, warn: console.warn } as never;
const pool = new RotatingPool(config.db, bootLog);
const key = new SessionKey(config.session.keyFile);
const app = await buildApp({ config, pool, key, expectedSchemaVersion: expected });
(pool as unknown as { log: unknown }).log = app.log;
await pool.refresh();
pool.start();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await pool.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.http.host, port: config.http.port });
