// Apply migrations once to the disposable test database, as a migrator login.
import { client, MIGRATIONS_DIR } from './helpers.js';
import { loadMigrations, migrate } from '../src/db/migrate.js';

export default async function setup(): Promise<void> {
  const c = client('t_migrator');
  await c.connect();
  try {
    await migrate(c, await loadMigrations(MIGRATIONS_DIR));
  } finally {
    await c.end();
  }
}
