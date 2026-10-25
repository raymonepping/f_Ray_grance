// Central authentication boundary (spec/SECURITY.md §3, ADR-005).
// - Every route under /api/v1 requires an owner, except the explicit public auth routes.
// - Tailscale reachability is never identity; caller-supplied identity headers are ignored.
// - State-changing requests need an allowed Origin AND, when authenticated, a CSRF
//   header matching the session's double-submit token.
import fp from './fp.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../errors.js';
import { csrfMatches, resolveSession, SESSION_COOKIE, type ResolvedSession } from './sessions.js';
import type { SessionKey } from './session-key.js';
import type { RotatingPool } from '../db/pool.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: ResolvedSession | null;
    sessionLookupFailed: boolean;
  }
}

export interface SecurityOptions {
  pool: RotatingPool;
  key: SessionKey;
  idleMinutes: number;
  publicOrigins: string[];
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Routes reachable without a session. Login still requires an allowed Origin.
export const PUBLIC_ROUTES = new Set(['/api/v1/auth/login']);

function requestOrigin(req: FastifyRequest): string | null {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== 'null') return origin;
  const referer = req.headers.referer;
  if (typeof referer === 'string') {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

export const securityPlugin = fp<SecurityOptions>(async (app, opts) => {
  const allowed = new Set(opts.publicOrigins);
  app.decorateRequest('session', null);
  app.decorateRequest('sessionLookupFailed', false);

  app.addHook('onRequest', async (req) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return;
    try {
      req.session = await resolveSession(opts.pool.get(), opts.key, raw, opts.idleMinutes);
    } catch {
      // DB or key unavailable: never fall open. Protected routes answer 503 in requireOwner.
      req.session = null;
      req.sessionLookupFailed = true;
    }
  });

  // Origin + CSRF for every state-changing API request.
  app.addHook('preHandler', async (req) => {
    if (!UNSAFE.has(req.method) || !req.url.startsWith('/api/')) return;
    const origin = requestOrigin(req);
    if (!origin || !allowed.has(origin)) throw new ApiError('CSRF_REJECTED', 'Request origin not allowed');
    if (PUBLIC_ROUTES.has(req.routeOptions.url ?? '')) return;
    if (!req.session) return; // requireOwner answers 401
    const header = req.headers['x-csrf-token'];
    if (!csrfMatches(opts.key, req.session.csrfHash, typeof header === 'string' ? header : undefined)) {
      throw new ApiError('CSRF_REJECTED', 'Missing or invalid CSRF token');
    }
  });
});

export async function requireOwner(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (req.sessionLookupFailed) throw new ApiError('DEPENDENCY_UNAVAILABLE', 'Session store unavailable');
  if (!req.session) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
}

/** For routes addressing a specific owner's resource; 403 when it is someone else's. */
export function assertOwner(req: FastifyRequest, ownerId: string): void {
  if (!req.session) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
  if (req.session.owner.id !== ownerId) throw new ApiError('FORBIDDEN', 'Not permitted for this owner');
}
