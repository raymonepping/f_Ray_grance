// Personal collection data access. EVERY query is scoped by owner_id; history is
// appended by the database trigger (collection_entries_history), never by callers.
import type pg from 'pg';
import type { CollectionState } from '../domain/identity.js';

export interface CollectionEntryRow {
  id: string;
  owner_id: string;
  fragrance_id: string;
  variant_id: string | null;
  state: CollectionState;
  rating: number | null;
  personal_note: string | null;
  acquired_on: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CollectionEventRow {
  id: string;
  from_state: CollectionState | null;
  to_state: CollectionState;
  occurred_at: Date;
  user_reason: string | null;
}

export interface NewEntry {
  clientRequestId?: string | null;
  fragranceId: string;
  variantId?: string | null;
  state: CollectionState;
  rating?: number | null;
  personalNote?: string | null;
  acquiredOn?: string | null;
  reason?: string | null;
}

async function inTx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

export async function createEntry(pool: pg.Pool, ownerId: string, e: NewEntry): Promise<CollectionEntryRow> {
  return (await createEntryIdempotent(pool, ownerId, e)).entry;
}

/** Idempotent when clientRequestId is given: a retry returns the original entry (created=false). */
export async function createEntryIdempotent(pool: pg.Pool, ownerId: string, e: NewEntry): Promise<{ entry: CollectionEntryRow; created: boolean }> {
  return inTx(pool, async (c) => {
    if (e.clientRequestId) {
      const prior = await c.query<CollectionEntryRow>(`SELECT * FROM app.collection_entries WHERE owner_id = $1 AND client_request_id = $2`, [ownerId, e.clientRequestId]);
      if (prior.rows[0]) return { entry: prior.rows[0], created: false };
    }
    await c.query(`SELECT set_config('fray.transition_reason', $1, true)`, [e.reason ?? '']);
    const { rows } = await c.query<CollectionEntryRow>(
      `INSERT INTO app.collection_entries (owner_id, fragrance_id, variant_id, state, rating, personal_note, acquired_on, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (owner_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [ownerId, e.fragranceId, e.variantId ?? null, e.state, e.rating ?? null, e.personalNote ?? null, e.acquiredOn ?? null, e.clientRequestId ?? null],
    );
    if (rows[0]) return { entry: rows[0], created: true };
    // Lost a concurrent race on the same request id: return the winner.
    const won = await c.query<CollectionEntryRow>(`SELECT * FROM app.collection_entries WHERE owner_id = $1 AND client_request_id = $2`, [ownerId, e.clientRequestId]);
    return { entry: won.rows[0]!, created: false };
  });
}

export interface EntryPatch {
  state?: CollectionState;
  reason?: string | null;
  rating?: number | null;
  personalNote?: string | null;
  acquiredOn?: string | null;
  variantId?: string | null;
}

/** Owner-scoped update. A state change appends history via the trigger in the same transaction. */
export async function updateEntry(pool: pg.Pool, ownerId: string, entryId: string, p: EntryPatch): Promise<CollectionEntryRow | null> {
  return inTx(pool, async (c) => {
    await c.query(`SELECT set_config('fray.transition_reason', $1, true)`, [p.reason ?? '']);
    const sets: string[] = [];
    const vals: unknown[] = [ownerId, entryId];
    const add = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (p.state !== undefined) add('state', p.state);
    if (p.rating !== undefined) add('rating', p.rating);
    if (p.personalNote !== undefined) add('personal_note', p.personalNote);
    if (p.acquiredOn !== undefined) add('acquired_on', p.acquiredOn);
    if (p.variantId !== undefined) add('variant_id', p.variantId);
    if (sets.length === 0) {
      const cur = await c.query<CollectionEntryRow>(`SELECT * FROM app.collection_entries WHERE id = $2 AND owner_id = $1`, vals);
      return cur.rows[0] ?? null;
    }
    const { rows } = await c.query<CollectionEntryRow>(
      `UPDATE app.collection_entries SET ${sets.join(', ')} WHERE id = $2 AND owner_id = $1 RETURNING *`,
      vals,
    );
    return rows[0] ?? null;
  });
}

export async function getEntry(pool: pg.Pool, ownerId: string, entryId: string): Promise<CollectionListRow | null> {
  const { rows } = await pool.query<CollectionListRow>(
    `SELECT e.*, b.canonical_name AS brand, f.canonical_name, f.concentration, f.identity_status
       FROM app.collection_entries e JOIN app.fragrances f ON f.id = e.fragrance_id JOIN app.brands b ON b.id = f.brand_id
      WHERE e.id = $1 AND e.owner_id = $2`,
    [entryId, ownerId],
  );
  return rows[0] ?? null;
}

/** All of this owner's entries for one fragrance (any status, any package size). */
export async function entriesForFragrance(pool: pg.Pool, ownerId: string, fragranceId: string): Promise<CollectionEntryRow[]> {
  const { rows } = await pool.query<CollectionEntryRow>(
    `SELECT * FROM app.collection_entries WHERE owner_id = $1 AND fragrance_id = $2 ORDER BY created_at, id`,
    [ownerId, fragranceId],
  );
  return rows;
}

/** State transition: updates the entry; the trigger appends the event in the same transaction. */
export async function transitionEntry(
  pool: pg.Pool,
  ownerId: string,
  entryId: string,
  to: CollectionState,
  reason?: string | null,
): Promise<CollectionEntryRow | null> {
  return inTx(pool, async (c) => {
    await c.query(`SELECT set_config('fray.transition_reason', $1, true)`, [reason ?? '']);
    const { rows } = await c.query<CollectionEntryRow>(
      `UPDATE app.collection_entries SET state = $3 WHERE id = $2 AND owner_id = $1 RETURNING *`,
      [ownerId, entryId, to],
    );
    return rows[0] ?? null;
  });
}

export interface CollectionListRow extends CollectionEntryRow {
  brand: string;
  canonical_name: string;
  concentration: string | null;
  identity_status: string;
}

export type CollectionSort = 'recent' | 'name' | 'brand' | 'rating';
const ORDER: Record<CollectionSort, string> = {
  recent: 'e.updated_at DESC, e.id',
  name: 'f.normalized_name, b.normalized_name, e.id',
  brand: 'b.normalized_name, f.normalized_name, e.id',
  rating: 'e.rating DESC NULLS LAST, f.normalized_name, e.id',
};

export async function listEntries(
  pool: pg.Pool,
  ownerId: string,
  state?: CollectionState,
  opts: { q?: string; sort?: CollectionSort } = {},
): Promise<CollectionListRow[]> {
  const { rows } = await pool.query<CollectionListRow>(
    `SELECT e.*, b.canonical_name AS brand, f.canonical_name, f.concentration, f.identity_status
       FROM app.collection_entries e
       JOIN app.fragrances f ON f.id = e.fragrance_id
       JOIN app.brands b ON b.id = f.brand_id
      WHERE e.owner_id = $1 AND ($2::text IS NULL OR e.state = $2)
        AND ($3::text IS NULL
             OR f.normalized_name LIKE '%' || app.normalize_identity($3) || '%'
             OR b.normalized_name LIKE '%' || app.normalize_identity($3) || '%'
             OR (length(regexp_replace($3, '[^0-9]', '', 'g')) >= 8
                 AND EXISTS (SELECT 1 FROM app.product_variants v WHERE v.fragrance_id = f.id
                               AND v.gtin14 = lpad(regexp_replace($3, '[^0-9]', '', 'g'), 14, '0'))))
      ORDER BY ${ORDER[opts.sort ?? 'recent']}`,
    [ownerId, state ?? null, opts.q?.trim() || null],
  );
  return rows;
}

/** Returns null when the entry does not exist OR belongs to another owner (no existence leak). */
export async function entryHistory(pool: pg.Pool, ownerId: string, entryId: string): Promise<CollectionEventRow[] | null> {
  const owned = await pool.query('SELECT 1 FROM app.collection_entries WHERE id = $1 AND owner_id = $2', [entryId, ownerId]);
  if (owned.rowCount === 0) return null;
  const { rows } = await pool.query<CollectionEventRow>(
    `SELECT id::text, from_state, to_state, occurred_at, user_reason FROM app.collection_events WHERE entry_id = $1 ORDER BY id`,
    [entryId],
  );
  return rows;
}
