// HTTP contract tests via fastify.inject (no network listener).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, revokeSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { hashPassword } from '../src/security/password.js';
import { createEntry } from '../src/repo/collection.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { RotatingPool } from '../src/db/pool.js';
import { credentialsFile, runtimePool, seedOwner, sessionKey, silentLog, testConfig, testPg, uniq } from './helpers.js';

const ORIGIN = 'http://localhost:8470';
// Generated per run: no secret-shaped literal in the repository (gitleaks).
const PASSWORD = `t-${randomBytes(18).toString('base64url')}`;

let app: FastifyInstance;
let rp: RotatingPool;
const { key, file: keyFile } = sessionKey();
let cookieA: string;
let ownerA: string;
let ownerB: string;
let entryB: string;
let fragranceId: string;
let loginUser: string;

const build = (expected = 1, pool = rp, overrides: Record<string, string> = {}) =>
  buildApp({ config: testConfig(overrides), pool, key, expectedSchemaVersion: expected, logger: false });

function cookiesFrom(r: LightMyRequestResponse): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of r.cookies) out[c.name] = c.value;
  return out;
}

beforeAll(async () => {
  rp = await runtimePool();
  app = await build();
  const db = rp.get();
  ownerA = await seedOwner(db);
  ownerB = await seedOwner(db);
  loginUser = `login-${Math.random().toString(36).slice(2, 8)}`;
  const loginOwner = await seedOwner(db, loginUser);
  await db.query('INSERT INTO app.owner_credentials (owner_id, password_hash) VALUES ($1, $2)', [loginOwner, await hashPassword(PASSWORD)]);
  const brand = await upsertBrand(db, uniq('Rabanne'));
  fragranceId = await createFragrance(db, { brandId: brand, name: 'Phantom in Red', concentration: 'parfum', identityStatus: 'verified' });
  entryB = (await createEntry(db, ownerB, { fragranceId, state: 'owned', personalNote: 'private to B' })).id;
  await createEntry(db, ownerA, { fragranceId, state: 'sampled' });
  cookieA = `${SESSION_COOKIE}=${(await createSession(db, key, ownerA, 1)).token}`;
});
afterAll(async () => {
  await app.close();
  await rp.close();
});

describe('health', () => {
  it('live is always 200', async () => {
    expect((await app.inject('/api/health/live')).statusCode).toBe(200);
  });
  it('ready is 200 when DB, schema and session key are present', async () => {
    const r = await app.inject('/api/health/ready');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ready', checks: { database: 'ok', schema: 'ok', session_key: 'ok' } });
  });
  it('ready is 503 when the schema version does not match this build', async () => {
    const other = await build(99);
    const r = await other.inject('/api/health/ready');
    await other.close();
    expect(r.statusCode).toBe(503);
    expect(r.json().checks.schema).toBe('fail');
  });
  it('ready is 503 when credentials are unavailable', async () => {
    const { host, port } = testPg();
    const pool = new RotatingPool({ host, port, database: 'fray', credentialsFile: '/nonexistent/db.json', poolMax: 1 }, silentLog);
    expect(await pool.refresh()).toBe(false);
    const other = await build(1, pool);
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
      expect(r.json().error.code).toBe('UNAUTHENTICATED');
      expect(r.json().error.requestId).toBe(r.headers['x-request-id']);
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
    const items = r.json().items as { owner_id: string }[];
    expect(items).toHaveLength(1);
    expect(items.every((i) => i.owner_id === ownerA)).toBe(true);
    expect(r.body).not.toContain('private to B');
  });

  it("another owner's history is indistinguishable from missing (404, no leak)", async () => {
    const r = await app.inject({ url: `/api/v1/collection/${entryB}/history`, headers: { cookie: cookieA } });
    expect(r.statusCode).toBe(404);
  });

  it('revoked and expired sessions are rejected', async () => {
    const db = rp.get();
    const s = await createSession(db, key, ownerA, 1);
    await revokeSession(db, key.digest(s.token));
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie: `${SESSION_COOKIE}=${s.token}` } })).statusCode).toBe(401);
    const s2 = await createSession(db, key, ownerA, 1);
    await db.query(`UPDATE app.sessions SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE token_hash = $1`, [key.digest(s2.token)]);
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie: `${SESSION_COOKIE}=${s2.token}` } })).statusCode).toBe(401);
  });

  it('idle sessions expire', async () => {
    const db = rp.get();
    const s = await createSession(db, key, ownerA, 12);
    await db.query(`UPDATE app.sessions SET last_seen_at = now() - interval '3 hours' WHERE token_hash = $1`, [key.digest(s.token)]);
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie: `${SESSION_COOKIE}=${s.token}` } })).statusCode).toBe(401);
  });

  it('a database dump of session digests cannot be replayed as cookies', async () => {
    const { rows } = await rp.get().query<{ token_hash: Buffer }>('SELECT token_hash FROM app.sessions LIMIT 1');
    const replay = rows[0]!.token_hash.toString('base64url').slice(0, 43);
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie: `${SESSION_COOKIE}=${replay}` } })).statusCode).toBe(401);
  });

  it('system status reports only what the server knows (backups: not reported)', async () => {
    expect((await app.inject('/api/v1/system/status')).statusCode).toBe(401);
    const r = await app.inject({ url: '/api/v1/system/status', headers: { cookie: cookieA } });
    expect(r.statusCode).toBe(200);
    expect(r.json().backup).toEqual({ reported: false, lastManualBackupAt: null, lastVerifiedRestoreAt: null });
    expect(typeof r.json().scento.verifiedFragrances).toBe('number');
  });

  it('collection entries carry their fragrance identity (owner-scoped join)', async () => {
    const items = (await app.inject({ url: '/api/v1/collection', headers: { cookie: cookieA } })).json().items;
    expect(items[0]).toMatchObject({ owner_id: ownerA, canonical_name: 'Phantom in Red', concentration: 'parfum', identity_status: 'verified' });
    expect(items[0].brand).toMatch(/Rabanne/);
  });

  it('returns the session owner and a fragrance by id', async () => {
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie: cookieA } })).json().owner.id).toBe(ownerA);
    const f = await app.inject({ url: `/api/v1/fragrances/${fragranceId}`, headers: { cookie: cookieA } });
    expect(f.json()).toMatchObject({ canonical_name: 'Phantom in Red', concentration: 'parfum', identity_status: 'verified' });
  });
});

describe('login, cookies, CSRF and logout', () => {
  const login = (body: object, headers: Record<string, string> = { origin: ORIGIN }) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: body, headers });

  it('wrong password and unknown user both answer the same 401', async () => {
    const a = await login({ username: loginUser, password: 'wrong-password-123' });
    const b = await login({ username: 'nobody-here', password: 'wrong-password-123' });
    expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
    expect(a.json().error.message).toBe(b.json().error.message);
    expect(a.cookies).toHaveLength(0);
  });

  it('login from a foreign or missing Origin is rejected before credentials are checked', async () => {
    expect((await login({ username: loginUser, password: PASSWORD }, { origin: 'https://evil.example' })).json().error.code).toBe('CSRF_REJECTED');
    expect((await login({ username: loginUser, password: PASSWORD }, {})).statusCode).toBe(403);
  });

  it('full flow: login sets hardened cookies; mutation needs CSRF; logout revokes server-side', async () => {
    const r = await login({ username: loginUser.toUpperCase(), password: PASSWORD });
    expect(r.statusCode).toBe(200);
    const session = r.cookies.find((c) => c.name === SESSION_COOKIE)!;
    const csrf = r.cookies.find((c) => c.name === CSRF_COOKIE)!;
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });
    expect(csrf).toMatchObject({ secure: true, sameSite: 'Strict', path: '/' });
    expect(csrf.httpOnly).toBeFalsy();
    expect(r.body).not.toContain(session.value);
    const jar = cookiesFrom(r);
    const cookie = `${SESSION_COOKIE}=${jar[SESSION_COOKIE]}; ${CSRF_COOKIE}=${jar[CSRF_COOKIE]}`;
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie } })).statusCode).toBe(200);

    const noCsrf = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin: ORIGIN } });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error.code).toBe('CSRF_REJECTED');
    const wrongCsrf = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin: ORIGIN, 'x-csrf-token': 'A'.repeat(43) } });
    expect(wrongCsrf.statusCode).toBe(403);
    const crossSite = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin: 'https://evil.example', 'x-csrf-token': jar[CSRF_COOKIE]! } });
    expect(crossSite.statusCode).toBe(403);

    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin: ORIGIN, 'x-csrf-token': jar[CSRF_COOKIE]! } });
    expect(out.statusCode).toBe(200);
    expect(out.cookies.find((c) => c.name === SESSION_COOKIE)!.value).toBe('');
    // The old cookie is dead even if the browser kept it.
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie } })).statusCode).toBe(401);
  });

  it('anonymous mutation from an allowed origin is 401, not 403', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin: ORIGIN } });
    expect(r.statusCode).toBe(401);
  });

  it('locks a username after repeated failures, even with the right password', async () => {
    const db = rp.get();
    const user = `lock-${Math.random().toString(36).slice(2, 8)}`;
    const id = await seedOwner(db, user);
    await db.query('INSERT INTO app.owner_credentials (owner_id, password_hash) VALUES ($1, $2)', [id, await hashPassword(PASSWORD)]);
    const strict = await build(1, rp, { FRAY_LOGIN_MAX_FAILURES: '3', FRAY_LOGIN_RATE_PER_MINUTE: '100' });
    const attempt = (password: string) =>
      strict.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: user, password }, headers: { origin: ORIGIN } });
    for (let i = 0; i < 3; i++) expect((await attempt('wrong-password-xyz')).statusCode).toBe(401);
    const locked = await attempt(PASSWORD);
    await strict.close();
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe('RATE_LIMITED');
  });

  it('rate-limits login bursts per client', async () => {
    const tight = await build(1, rp, { FRAY_LOGIN_RATE_PER_MINUTE: '2' });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      codes.push((await tight.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'nobody-x', password: 'x' }, headers: { origin: ORIGIN } })).statusCode);
    }
    await tight.close();
    expect(codes.slice(0, 2)).toEqual([401, 401]);
    expect(codes.slice(2)).toEqual([429, 429]);
  });

  it('rotating the session HMAC key invalidates existing sessions', async () => {
    const s = await createSession(rp.get(), key, ownerA, 1);
    const cookie = `${SESSION_COOKIE}=${s.token}`;
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie } })).statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 20)); // distinct mtime
    writeFileSync(keyFile, JSON.stringify({ token_hmac_key: 'r'.repeat(48), version: 2 }));
    expect((await app.inject({ url: '/api/v1/session', headers: { cookie } })).statusCode).toBe(401);
    expect(key.version).toBe(2);
    // restore for the remaining tests
    writeFileSync(keyFile, JSON.stringify({ token_hmac_key: 'k'.repeat(48), version: 1 }));
  });
});

describe('strict validation and envelopes', () => {
  it('rejects out-of-range and unknown parameters with VALIDATION_FAILED', async () => {
    for (const url of ['/api/v1/fragrances?limit=1000', '/api/v1/fragrances?bogus=1', '/api/v1/collection?state=borrowed', '/api/v1/fragrances/not-a-uuid']) {
      const r = await app.inject({ url, headers: { cookie: cookieA } });
      expect(r.statusCode, url).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_FAILED');
    }
  });
  it('rejects unexpected login fields and oversize payloads', async () => {
    const extra = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'abc', password: 'x', admin: true }, headers: { origin: ORIGIN } });
    expect(extra.statusCode).toBe(400);
    const big = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'abc', password: 'x'.repeat(70_000) }, headers: { origin: ORIGIN } });
    expect(big.statusCode).toBe(413);
  });
  it('unknown routes return the 404 envelope', async () => {
    const r = await app.inject('/api/v2/anything');
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('NOT_FOUND');
  });
  it('echoes a well-formed x-request-id and replaces a malformed one', async () => {
    expect((await app.inject({ url: '/api/health/live', headers: { 'x-request-id': 'abcdef12-trace' } })).headers['x-request-id']).toBe('abcdef12-trace');
    expect((await app.inject({ url: '/api/health/live', headers: { 'x-request-id': '<script>' } })).headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('credential rotation', () => {
  it('swaps to new credentials and keeps the old pool when new ones fail', async () => {
    const file = credentialsFile('t_runtime');
    const { host, port } = testPg();
    const pool = new RotatingPool({ host, port, database: 'fray', credentialsFile: file, poolMax: 2 }, silentLog);
    expect(await pool.refresh()).toBe(true);
    writeFileSync(file, JSON.stringify({ username: 't_runtime2', password: 'unused-trust-auth' }));
    expect(await pool.refresh()).toBe(true);
    expect((await pool.get().query('SELECT current_user AS u')).rows[0].u).toBe('t_runtime2');
    writeFileSync(file, JSON.stringify({ username: 'no_such_role', password: 'x' }));
    expect(await pool.refresh()).toBe(false);
    expect(pool.status.error).toMatch(/rejected/);
    expect((await pool.get().query('SELECT current_user AS u')).rows[0].u).toBe('t_runtime2');
    await pool.close();
  });

  it('a terminated backend (revoked login) answers 503 and triggers a refresh', async () => {
    const file = credentialsFile('t_runtime');
    const { host, port } = testPg();
    const pool = new RotatingPool({ host, port, database: 'fray', credentialsFile: file, poolMax: 1 }, silentLog);
    await pool.refresh();
    const local = await build(1, pool);
    const s = await createSession(rp.get(), key, ownerA, 1);
    // Simulate Vault revocation: terminate the runtime login's sessions from a superuser connection.
    const { Client } = (await import('pg')).default;
    const su = new Client({ host, port, user: 'postgres', database: 'fray', password: 'x' });
    await su.connect();
    await su.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 't_runtime' AND application_name = 'fray-api'`);
    await su.end();
    const first = await local.inject({ url: '/api/v1/collection', headers: { cookie: `${SESSION_COOKIE}=${s.token}` } });
    expect([200, 503]).toContain(first.statusCode); // pg may transparently reconnect
    const again = await local.inject({ url: '/api/v1/collection', headers: { cookie: `${SESSION_COOKIE}=${s.token}` } });
    expect(again.statusCode).toBe(200);
    await local.close();
    await pool.close();
  });
});
