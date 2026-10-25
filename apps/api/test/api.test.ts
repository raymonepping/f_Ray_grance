// HTTP contract tests via fastify.inject (no network listener).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, revokeSession, digest, SESSION_COOKIE } from '../src/security/sessions.js';
import { createEntry } from '../src/repo/collection.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { RotatingPool } from '../src/db/pool.js';
import { credentialsFile, runtimePool, seedOwner, silentLog, testConfig, testPg, uniq } from './helpers.js';

let app: FastifyInstance;
let rp: RotatingPool;
let cookieA: string;
let ownerA: string;
let ownerB: string;
let entryB: string;
let fragranceId: string;

beforeAll(async () => {
  rp = await runtimePool();
  app = await buildApp({ config: testConfig(), pool: rp, expectedSchemaVersion: 1, logger: false });
  const db = rp.get();
  ownerA = await seedOwner(db);
  ownerB = await seedOwner(db);
  const brand = await upsertBrand(db, uniq('Rabanne'));
  fragranceId = await createFragrance(db, { brandId: brand, name: 'Phantom in Red', concentration: 'parfum', identityStatus: 'verified' });
  entryB = (await createEntry(db, ownerB, { fragranceId, state: 'owned', personalNote: 'private to B' })).id;
  await createEntry(db, ownerA, { fragranceId, state: 'sampled' });
  cookieA = `${SESSION_COOKIE}=${(await createSession(db, ownerA, 1)).token}`;
});
afterAll(async () => {
  await app.close();
  await rp.close();
});

describe('health', () => {
  it('live is always 200', async () => {
    const r = await app.inject('/api/health/live');
    expect(r.statusCode).toBe(200);
  });
  it('ready is 200 when DB reachable and schema current', async () => {
    const r = await app.inject('/api/health/ready');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ready', checks: { database: 'ok', schema: 'ok' } });
  });
  it('ready is 503 when the schema version does not match this build', async () => {
    const other = await buildApp({ config: testConfig(), pool: rp, expectedSchemaVersion: 99, logger: false });
    const r = await other.inject('/api/health/ready');
    await other.close();
    expect(r.statusCode).toBe(503);
    expect(r.json().checks).toEqual({ database: 'ok', schema: 'fail' });
  });
  it('ready is 503 when credentials are unavailable', async () => {
    const { host, port } = testPg();
    const pool = new RotatingPool({ host, port, database: 'fray', credentialsFile: '/nonexistent/db.json', poolMax: 1 }, silentLog);
    expect(await pool.refresh()).toBe(false);
    const other = await buildApp({ config: testConfig(), pool, expectedSchemaVersion: 1, logger: false });
    const r = await other.inject('/api/health/ready');
    await other.close();
    expect(r.statusCode).toBe(503);
  });
});

describe('protected namespace /api/v1', () => {
  it.each(['/api/v1/session', '/api/v1/fragrances', `/api/v1/fragrances/00000000-0000-4000-8000-000000000000`, '/api/v1/collection'])(
    'anonymous %s -> 401 envelope',
    async (url) => {
      const r = await app.inject(url);
      expect(r.statusCode).toBe(401);
      const body = r.json();
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(body.error.requestId).toBe(r.headers['x-request-id']);
    },
  );

  it('ignores caller-supplied identity headers and garbage cookies', async () => {
    const r = await app.inject({
      url: '/api/v1/collection',
      headers: { 'x-owner-id': ownerA, 'x-forwarded-user': 'owner', 'tailscale-user-login': 'me@example.com', cookie: `${SESSION_COOKIE}=not-a-token` },
    });
    expect(r.statusCode).toBe(401);
  });

  it('authorised owner sees only their own collection', async () => {
    const r = await app.inject({ url: '/api/v1/collection', headers: { cookie: cookieA } });
    expect(r.statusCode).toBe(200);
    const items = r.json().items as { owner_id: string; personal_note: string | null }[];
    expect(items.length).toBe(1);
    expect(items.every((i) => i.owner_id === ownerA)).toBe(true);
    expect(JSON.stringify(items)).not.toContain('private to B');
  });

  it("another owner's history is indistinguishable from missing (404, no leak)", async () => {
    const r = await app.inject({ url: `/api/v1/collection/${entryB}/history`, headers: { cookie: cookieA } });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('NOT_FOUND');
  });

  it('revoked and expired sessions are rejected', async () => {
    const db = rp.get();
    const s = await createSession(db, ownerA, 1);
    await revokeSession(db, digest(s.token));
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie: `${SESSION_COOKIE}=${s.token}` } })).statusCode).toBe(401);
    const s2 = await createSession(db, ownerA, 1);
    await db.query(`UPDATE app.sessions SET expires_at = created_at + interval '1 second', last_seen_at = created_at WHERE token_hash = $1`, [digest(s2.token)]);
    await db.query(`UPDATE app.sessions SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE token_hash = $1`, [digest(s2.token)]);
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie: `${SESSION_COOKIE}=${s2.token}` } })).statusCode).toBe(401);
  });

  it('returns the session owner and a fragrance by id', async () => {
    const me = await app.inject({ url: '/api/v1/session', headers: { cookie: cookieA } });
    expect(me.json().owner.id).toBe(ownerA);
    const f = await app.inject({ url: `/api/v1/fragrances/${fragranceId}`, headers: { cookie: cookieA } });
    expect(f.statusCode).toBe(200);
    expect(f.json()).toMatchObject({ canonical_name: 'Phantom in Red', concentration: 'parfum', identity_status: 'verified' });
  });
});

describe('strict validation and envelopes', () => {
  it('rejects out-of-range and unknown query parameters with VALIDATION_FAILED', async () => {
    for (const url of ['/api/v1/fragrances?limit=1000', '/api/v1/fragrances?bogus=1', '/api/v1/collection?state=borrowed', '/api/v1/fragrances/not-a-uuid']) {
      const r = await app.inject({ url, headers: { cookie: cookieA } });
      expect(r.statusCode, url).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_FAILED');
    }
  });
  it('unknown routes return the 404 envelope', async () => {
    const r = await app.inject('/api/v2/anything');
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('NOT_FOUND');
  });
  it('echoes a well-formed x-request-id and replaces a malformed one', async () => {
    const good = await app.inject({ url: '/api/health/live', headers: { 'x-request-id': 'abcdef12-trace' } });
    expect(good.headers['x-request-id']).toBe('abcdef12-trace');
    const bad = await app.inject({ url: '/api/health/live', headers: { 'x-request-id': '<script>' } });
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('credential rotation', () => {
  it('swaps to new credentials and keeps the old pool when new ones fail', async () => {
    const file = credentialsFile('t_runtime');
    const { host, port } = testPg();
    const pool = new RotatingPool({ host, port, database: 'fray', credentialsFile: file, poolMax: 2 }, silentLog);
    expect(await pool.refresh()).toBe(true);
    expect(pool.generation).toBe(1);
    writeFileSync(file, JSON.stringify({ username: 't_runtime2', password: 'unused-trust-auth' }));
    expect(await pool.refresh()).toBe(true);
    expect((await pool.get().query('SELECT current_user AS u')).rows[0].u).toBe('t_runtime2');
    writeFileSync(file, JSON.stringify({ username: 'no_such_role', password: 'x' }));
    expect(await pool.refresh()).toBe(false);
    expect(pool.status.error).toMatch(/rejected/);
    expect((await pool.get().query('SELECT current_user AS u')).rows[0].u).toBe('t_runtime2');
    await pool.close();
  });
});
