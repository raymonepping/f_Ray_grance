// One-shot migration runner. Credentials come from a file (Vault-issued migrator
// login, Phase 03), never argv/env. Exit codes: 0 ok, 1 failure.
import pg from 'pg';
import { loadConfig } from '../config.js';
import { readCredentials } from './pool.js';
import { loadMigrations, migrate } from './migrate.js';

const config = loadConfig();
const file = process.env.FRAY_MIGRATOR_CREDENTIALS_FILE ?? '/vault/rendered/db-migrator.json';
let creds;
try {
  ({ creds } = await readCredentials(file));
} catch (err) {
  console.error(JSON.stringify({ status: 'MIGRATIONS_FAILED', error: `migrator credentials unavailable: ${(err as Error).message}` }));
  process.exit(1);
}
const client = new pg.Client({ host: config.db.host, port: config.db.port, database: config.db.database, user: creds.username, password: creds.password, application_name: 'fray-migrate' });
await client.connect();
try {
  const result = await migrate(client, await loadMigrations(config.migrationsDir));
  console.log(JSON.stringify({ status: 'MIGRATIONS_OK', applied: result.applied, skipped: result.skipped.length }));
} catch (err) {
  console.error(JSON.stringify({ status: 'MIGRATIONS_FAILED', error: (err as Error).message }));
  process.exitCode = 1;
} finally {
  await client.end();
}
