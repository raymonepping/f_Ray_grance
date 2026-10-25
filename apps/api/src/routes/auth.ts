// Owner login/logout (no public registration; owners are created by `make owner-create`).
import { Type } from 'typebox';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import rateLimit from '@fastify/rate-limit';
import { ApiError } from '../errors.js';
import { verifyPassword } from '../security/password.js';
import { createSession, revokeSession, CSRF_COOKIE, SESSION_COOKIE } from '../security/sessions.js';
import { requireOwner } from '../security/plugin.js';
import type { SessionKey } from '../security/session-key.js';
import type { RotatingPool } from '../db/pool.js';

export interface AuthDeps {
  pool: RotatingPool;
  key: SessionKey;
  ttlHours: number;
  lockout: { maxFailures: number; windowMinutes: number };
  loginRatePerMinute: number;
}

const cookieBase = { path: '/', secure: true, sameSite: 'strict' as const };

function setSessionCookies(reply: FastifyReply, token: string, csrf: string, expires: Date): void {
  // __Host- prefix: Secure, Path=/, no Domain — bound to the exact HTTPS origin.
  reply.setCookie(SESSION_COOKIE, token, { ...cookieBase, httpOnly: true, expires });
  // Double-submit CSRF token: readable by same-origin script only, echoed in x-csrf-token.
  reply.setCookie(CSRF_COOKIE, csrf, { ...cookieBase, httpOnly: false, expires });
}

function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { ...cookieBase, httpOnly: true });
  reply.clearCookie(CSRF_COOKIE, { ...cookieBase });
}

export async function authRoutes(base: FastifyInstance, deps: AuthDeps): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  await app.register(rateLimit, { global: false });
  const db = () => deps.pool.get();

  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: deps.loginRatePerMinute, timeWindow: '1 minute' } },
      schema: {
        body: Type.Object(
          { username: Type.String({ minLength: 3, maxLength: 64 }), password: Type.String({ minLength: 1, maxLength: 1024 }) },
          { additionalProperties: false },
        ),
      },
    },
    async (req, reply) => {
      const username = req.body.username.toLowerCase();
      const recent = await db().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.login_attempts
          WHERE username = $1 AND NOT succeeded AND attempted_at > now() - make_interval(mins => $2)`,
        [username, deps.lockout.windowMinutes],
      );
      if ((recent.rows[0]?.n ?? 0) >= deps.lockout.maxFailures) {
        throw new ApiError('RATE_LIMITED', 'Too many failed sign-in attempts; try again later');
      }
      const { rows } = await db().query<{ id: string; username: string; display_name: string; password_hash: string }>(
        `SELECT o.id, o.username, o.display_name, c.password_hash
           FROM app.owners o JOIN app.owner_credentials c ON c.owner_id = o.id WHERE o.username = $1`,
        [username],
      );
      const owner = rows[0];
      const ok = await verifyPassword(owner?.password_hash ?? null, req.body.password);
      await db().query('INSERT INTO app.login_attempts (username, succeeded) VALUES ($1, $2)', [username, ok]);
      if (!ok || !owner) {
        req.log.info({ outcome: 'login_failed' }, 'auth');
        throw new ApiError('UNAUTHENTICATED', 'Invalid username or password');
      }
      const s = await createSession(db(), deps.key, owner.id, deps.ttlHours);
      setSessionCookies(reply, s.token, s.csrfToken, s.expiresAt);
      req.log.info({ outcome: 'login_ok' }, 'auth');
      return { owner: { id: owner.id, username: owner.username, displayName: owner.display_name }, expiresAt: s.expiresAt };
    },
  );

  app.post('/auth/logout', { preHandler: requireOwner }, async (req, reply) => {
    await revokeSession(db(), req.session!.tokenHash);
    clearSessionCookies(reply);
    return { status: 'signed_out' };
  });
}
