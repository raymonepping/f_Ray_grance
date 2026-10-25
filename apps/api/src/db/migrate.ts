// Forward-only, checksummed migrations (spec/DATA_MODEL.md §5-6, DATA_PERSISTENCE.md §7).
// Each file runs in its own transaction as fray_owner (SET ROLE from a migrator
// login), so runtime credentials never need DDL. Applied migrations are immutable:
// a changed checksum is a hard failure, never a silent re-run.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from 'pg';

export interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

// Statements that can destroy authoritative data. A migration containing one must
// carry an explicit, reviewed marker line: "-- fray:allow-destructive <reason>".
// Matches statements, not keywords: "BEFORE TRUNCATE ON" or "ON DELETE RESTRICT" in DDL are fine.
const DESTRUCTIVE_RE = /\bDROP\s+(TABLE|SCHEMA|COLUMN|DATABASE|OWNED)\b|(^|;)\s*(TRUNCATE|DELETE\s+FROM|UPDATE\s+\S+\s+SET)\b/im;
const ALLOW_DESTRUCTIVE_RE = /^--\s*fray:allow-destructive\s+\S+/m;

export async function loadMigrations(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => FILE_RE.test(f)).sort();
  const migrations: Migration[] = [];
  for (const file of files) {
    const match = FILE_RE.exec(file);
    if (!match) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    migrations.push({
      version: Number(match[1]),
      name: match[2] ?? file,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`migration numbering gap at ${m.version}_${m.name}`);
  });
  return migrations;
}

/** Refuse ambiguous destructive operations unless explicitly marked and reviewed. */
export function preflight(migration: Migration): void {
  const code = migration.sql.replace(/--.*$/gm, '');
  if (DESTRUCTIVE_RE.test(code) && !ALLOW_DESTRUCTIVE_RE.test(migration.sql)) {
    throw new Error(
      `migration ${migration.version}_${migration.name} contains a destructive statement without "-- fray:allow-destructive <reason>"`,
    );
  }
}

export async function migrate(client: Client, migrations: Migration[]): Promise<MigrationResult> {
  migrations.forEach(preflight);
  // Everything (including the ledger) is owned by fray_owner, never by the login:
  // Vault-issued migrator logins are revoked with DROP ROLE, which fails if they own objects.
  await client.query('SET ROLE fray_owner');
  await client.query('SET search_path = app, public');
  await client.query(`CREATE TABLE IF NOT EXISTS app.schema_migrations (
    version    integer PRIMARY KEY,
    name       text NOT NULL,
    checksum   char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  // Default privileges would give the runtime role DML here; it may only read the ledger.
  await client.query('REVOKE ALL ON app.schema_migrations FROM fray_runtime');
  await client.query('GRANT SELECT ON app.schema_migrations TO fray_runtime');
  // One migrator at a time.
  await client.query('SELECT pg_advisory_lock(hashtext($1))', ['fray.migrations']);
  try {
    const { rows } = await client.query<{ version: number; checksum: string }>(
      'SELECT version, checksum FROM app.schema_migrations ORDER BY version',
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));
    for (const [version] of applied) {
      if (!migrations.some((m) => m.version === version)) {
        throw new Error(`database has migration ${version} unknown to this build (refusing to run older code)`);
      }
    }
    const result: MigrationResult = { applied: [], skipped: [] };
    for (const m of migrations) {
      const existing = applied.get(m.version);
      const label = `${String(m.version).padStart(4, '0')}_${m.name}`;
      if (existing !== undefined) {
        if (existing !== m.checksum) throw new Error(`checksum mismatch for applied migration ${label}`);
        result.skipped.push(label);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO app.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
          m.version,
          m.name,
          m.checksum,
        ]);
        await client.query('COMMIT');
        result.applied.push(label);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${label} failed: ${(err as Error).message}`, { cause: err });
      }
    }
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['fray.migrations']);
    await client.query('RESET ROLE');
  }
}
