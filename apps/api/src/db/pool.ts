// Runtime connection pool fed by a credentials FILE (Vault Agent template output:
// {"username": "...", "password": "..."}). When the file changes (lease rotation),
// a new pool is built and verified, then swapped in; the old pool drains and ends.
// Established connections do not change credentials by themselves (spec/SECURITY.md §2).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';

export interface DbCredentials {
  username: string;
  password: string;
}

export interface PoolOptions {
  host: string;
  port: number;
  database: string;
  credentialsFile: string;
  poolMax: number;
  pollMs?: number;
}

export async function readCredentials(file: string): Promise<{ creds: DbCredentials; digest: string }> {
  const text = await readFile(file, 'utf8');
  const parsed = JSON.parse(text) as Partial<DbCredentials>;
  if (typeof parsed.username !== 'string' || typeof parsed.password !== 'string' || !parsed.username || !parsed.password) {
    throw new Error('credentials file must contain non-empty "username" and "password"');
  }
  return { creds: { username: parsed.username, password: parsed.password }, digest: createHash('sha256').update(text).digest('hex') };
}

export class RotatingPool {
  private pool: pg.Pool | null = null;
  private digest = '';
  private timer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  generation = 0;

  constructor(
    private readonly opts: PoolOptions,
    private readonly log: FastifyBaseLogger,
  ) {}

  private build(creds: DbCredentials): pg.Pool {
    const pool = new pg.Pool({
      host: this.opts.host,
      port: this.opts.port,
      database: this.opts.database,
      user: creds.username,
      password: creds.password,
      max: this.opts.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      application_name: 'fray-api',
    });
    // An idle client error (e.g. its role was revoked) must not crash the process.
    pool.on('error', (err) => this.log.warn({ err: err.message }, 'db pool client error'));
    return pool;
  }

  /** Load credentials; swap pools only after the new one answers a query. */
  async refresh(): Promise<boolean> {
    let next: { creds: DbCredentials; digest: string };
    try {
      next = await readCredentials(this.opts.credentialsFile);
    } catch (err) {
      this.lastError = `credentials unavailable: ${(err as Error).message}`;
      return false;
    }
    if (next.digest === this.digest && this.pool) return false;
    const candidate = this.build(next.creds);
    try {
      await candidate.query('SELECT 1');
    } catch (err) {
      await candidate.end().catch(() => undefined);
      this.lastError = `new credentials rejected: ${(err as Error).message}`;
      this.log.warn({ generation: this.generation }, 'db credential refresh failed; keeping current pool');
      return false;
    }
    const old = this.pool;
    this.pool = candidate;
    this.digest = next.digest;
    this.generation += 1;
    this.lastError = null;
    this.log.info({ generation: this.generation }, 'db pool (re)built from rotated credentials');
    if (old) void old.end().catch(() => undefined);
    return true;
  }

  start(): void {
    const pollMs = this.opts.pollMs ?? 5_000;
    this.timer = setInterval(() => void this.refresh(), pollMs);
    this.timer.unref();
  }

  get status(): { ready: boolean; generation: number; error: string | null } {
    return { ready: this.pool !== null, generation: this.generation, error: this.lastError };
  }

  /** Current pool or a typed failure; callers translate to DEPENDENCY_UNAVAILABLE. */
  get(): pg.Pool {
    if (!this.pool) throw new Error(this.lastError ?? 'database pool not initialised');
    return this.pool;
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.pool?.end().catch(() => undefined);
    this.pool = null;
  }
}
