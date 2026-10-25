// Central authentication boundary. Every route under /api/v1 requires an owner;
// Tailscale reachability is never treated as identity (ADR-005). Caller-supplied
// identity headers are ignored entirely.
import fp from './fp.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../errors.js';
import { resolveSession, SESSION_COOKIE, type ResolvedSession } from './sessions.js';
import type { RotatingPool } from '../db/pool.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: ResolvedSession | null;
  }
}

export interface SecurityOptions {
  pool: RotatingPool;
  idleMinutes: number;
}

export const securityPlugin = fp<SecurityOptions>(async (app, opts) => {
  app.decorateRequest('session', null);
  app.addHook('onRequest', async (req) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return;
    try {
      req.session = await resolveSession(opts.pool.get(), raw, opts.idleMinutes);
    } catch {
      // Database unavailable: treat as unauthenticated for public routes; protected
      // routes fail closed in requireOwner with a dependency error, never open.
      req.session = null;
      (req as FastifyRequest & { sessionLookupFailed?: boolean }).sessionLookupFailed = true;
    }
  });
});

export async function requireOwner(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if ((req as FastifyRequest & { sessionLookupFailed?: boolean }).sessionLookupFailed) {
    throw new ApiError('DEPENDENCY_UNAVAILABLE', 'Session store unavailable');
  }
  if (!req.session) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
}

/** For routes addressing a specific owner's resource; 403 when it is someone else's. */
export function assertOwner(req: FastifyRequest, ownerId: string): void {
  if (!req.session) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
  if (req.session.owner.id !== ownerId) throw new ApiError('FORBIDDEN', 'Not permitted for this owner');
}
