// Opaque server-side sessions (spec/SECURITY.md §3). The browser holds a random
// token; PostgreSQL stores only SHA-256 digests of the token and its CSRF secret.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';

export const SESSION_COOKIE = '__Host-fray_session';

export interface Owner {
  id: string;
  username: string;
  displayName: string;
}

export interface IssuedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

export const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
const token = (): string => randomBytes(32).toString('base64url');

export async function createSession(db: pg.Pool, ownerId: string, ttlHours: number, userAgentTag?: string): Promise<IssuedSession> {
  const t = token();
  const csrf = token();
  const { rows } = await db.query<{ expires_at: Date }>(
    `INSERT INTO app.sessions (token_hash, owner_id, csrf_hash, expires_at, user_agent_tag)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5) RETURNING expires_at`,
    [digest(t), ownerId, digest(csrf), ttlHours, userAgentTag ?? null],
  );
  return { token: t, csrfToken: csrf, expiresAt: rows[0]!.expires_at };
}

export interface ResolvedSession {
  owner: Owner;
  tokenHash: Buffer;
  csrfHash: Buffer;
}

/** Valid = not revoked, not expired, not idle beyond the limit. Touches last_seen_at. */
export async function resolveSession(db: pg.Pool, sessionToken: string, idleMinutes: number): Promise<ResolvedSession | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) return null;
  const hash = digest(sessionToken);
  const { rows } = await db.query<{ id: string; username: string; display_name: string; csrf_hash: Buffer }>(
    `UPDATE app.sessions s SET last_seen_at = now()
       FROM app.owners o
      WHERE s.token_hash = $1 AND o.id = s.owner_id
        AND s.revoked_at IS NULL AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(mins => $2)
     RETURNING o.id, o.username, o.display_name, s.csrf_hash`,
    [hash, idleMinutes],
  );
  const row = rows[0];
  if (!row) return null;
  return { owner: { id: row.id, username: row.username, displayName: row.display_name }, tokenHash: hash, csrfHash: row.csrf_hash };
}

export async function revokeSession(db: pg.Pool, tokenHash: Buffer): Promise<void> {
  await db.query('UPDATE app.sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash]);
}

export function csrfMatches(expectedHash: Buffer, presented: string | undefined): boolean {
  if (!presented || !/^[A-Za-z0-9_-]{43}$/.test(presented)) return false;
  return timingSafeEqual(expectedHash, digest(presented));
}
