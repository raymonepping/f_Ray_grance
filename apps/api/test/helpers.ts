// Shared integration-test helpers. Requires FRAY_TEST_PG (scripts/test-db.sh start);
// DB tests fail rather than silently skip when it is missing.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { RotatingPool } from '../src/db/pool.js';
import { loadConfig, type Config } from '../src/config.js';

export const MIGRATIONS_DIR = new URL('../../../db/migrations', import.meta.url).pathname;

export function testPg(): { host: string; port: number } {
  const v = process.env.FRAY_TEST_PG;
  if (!v) throw new Error('FRAY_TEST_PG is not set: run scripts/test-db.sh start (make test does this)');
  const [host, port] = v.split(':');
  return { host: host!, port: Number(port) };
}

export function client(user: string, database = 'fray'): pg.Client {
  const { host, port } = testPg();
  return new pg.Client({ host, port, user, database, password: 'unused-trust-auth' });
}

export function credentialsFile(username: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fray-creds-'));
  const file = path.join(dir, 'db.json');
  writeFileSync(file, JSON.stringify({ username, password: 'unused-trust-auth' }), { mode: 0o600 });
  return file;
}

export const silentLog = { info() {}, warn() {}, error() {}, debug() {} } as never;

export async function runtimePool(username = 't_runtime'): Promise<RotatingPool> {
  const { host, port } = testPg();
  const pool = new RotatingPool({ host, port, database: 'fray', credentialsFile: credentialsFile(username), poolMax: 4 }, silentLog);
  await pool.refresh();
  return pool;
}

export function testConfig(overrides: Record<string, string> = {}): Config {
  const { host, port } = testPg();
  return loadConfig({ FRAY_DB_HOST: host, FRAY_DB_PORT: String(port), FRAY_MIGRATIONS_DIR: MIGRATIONS_DIR, ...overrides });
}

export const uniq = (prefix: string): string => `${prefix} ${Math.random().toString(36).slice(2, 8)}`;

/** Owner + optional session created directly (login lands in Phase 03). */
export async function seedOwner(db: pg.Pool, username = `owner-${Math.random().toString(36).slice(2, 8)}`): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO app.owners (username, display_name) VALUES ($1, $2) RETURNING id',
    [username, 'Synthetic Owner'],
  );
  return rows[0]!.id;
}
