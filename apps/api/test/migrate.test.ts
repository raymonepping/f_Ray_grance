import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { client, MIGRATIONS_DIR } from './helpers.js';
import { loadMigrations, migrate, preflight } from '../src/db/migrate.js';

// A fresh database per run proves "migration from an empty database".
const DB = `fray_mig_${process.pid}`;

describe('migrations (disposable PostgreSQL 18)', () => {
  beforeAll(async () => {
    const su = client('postgres', 'postgres');
    await su.connect();
    await su.query(`CREATE DATABASE ${DB} OWNER fray_owner`);
    await su.end();
    const db = client('postgres', DB);
    await db.connect();
    await db.query(readFileSync(new URL('../../../ansible/roles/postgres_base/files/database.sql', import.meta.url), 'utf8').replace('\\set ON_ERROR_STOP on', ''));
    await db.query(`GRANT CONNECT ON DATABASE ${DB} TO t_migrator`);
    await db.end();
  });
  afterAll(async () => {
    const su = client('postgres', 'postgres');
    await su.connect();
    await su.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await su.end();
  });

  it('applies from empty, then is a no-op on the second run', async () => {
    const m = await loadMigrations(MIGRATIONS_DIR);
    const c = client('t_migrator', DB);
    await c.connect();
    const first = await migrate(c, m);
    const second = await migrate(c, m);
    const owner = await c.query(`SELECT tableowner FROM pg_tables WHERE schemaname='app' AND tablename='schema_migrations'`);
    const tables = await c.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='app' AND tableowner <> 'fray_owner'`);
    await c.end();
    expect(first.applied).toEqual(['0001_canonical_schema']);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['0001_canonical_schema']);
    // Nothing may be owned by the (revocable) migrator login.
    expect(owner.rows[0].tableowner).toBe('fray_owner');
    expect(tables.rows[0].n).toBe(0);
  });

  it('refuses an applied migration whose checksum changed', async () => {
    const m = await loadMigrations(MIGRATIONS_DIR);
    const tampered = m.map((x) => ({ ...x, checksum: 'f'.repeat(64) }));
    const c = client('t_migrator', DB);
    await c.connect();
    await expect(migrate(c, tampered)).rejects.toThrow(/checksum mismatch/);
    await c.end();
  });

  it('refuses a database that is ahead of this build', async () => {
    const c = client('t_migrator', DB);
    await c.connect();
    await expect(migrate(c, [])).rejects.toThrow(/unknown to this build/);
    await c.end();
  });

  it('preflight rejects unmarked destructive statements, allows reviewed ones', () => {
    const base = { version: 2, name: 'x', checksum: '0'.repeat(64) };
    expect(() => preflight({ ...base, sql: 'DROP TABLE app.collection_entries;' })).toThrow(/destructive/);
    expect(() => preflight({ ...base, sql: 'TRUNCATE app.collection_events;' })).toThrow(/destructive/);
    expect(() => preflight({ ...base, sql: 'DELETE FROM app.owners;' })).toThrow(/destructive/);
    expect(() => preflight({ ...base, sql: '-- note: we never DROP TABLE here\nSELECT 1;' })).not.toThrow();
    expect(() => preflight({ ...base, sql: '-- fray:allow-destructive retire-temp-table\nDROP TABLE app.tmp;' })).not.toThrow();
  });

  it('detects numbering gaps', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fray-mig-'));
    writeFileSync(path.join(dir, '0001_a.sql'), 'SELECT 1;');
    writeFileSync(path.join(dir, '0003_c.sql'), 'SELECT 1;');
    await expect(loadMigrations(dir)).rejects.toThrow(/gap/);
  });

  it('rolls back a failing migration atomically', async () => {
    const c = client('t_migrator', DB);
    await c.connect();
    const m = await loadMigrations(MIGRATIONS_DIR);
    const bad = [...m, { version: 2, name: 'broken', sql: 'CREATE TABLE app.half_done(x int); SELECT * FROM app.nope;', checksum: '1'.repeat(64) }];
    await expect(migrate(c, bad)).rejects.toThrow(/0002_broken failed/);
    const { rows } = await c.query(`SELECT to_regclass('app.half_done') AS t, (SELECT max(version) FROM app.schema_migrations) AS v`);
    await c.end();
    expect(rows[0].t).toBeNull();
    expect(rows[0].v).toBe(1);
  });
});
