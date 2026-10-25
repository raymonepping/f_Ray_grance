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
  return inTx(pool, async (c) => {
    await c.query(`SELECT set_config('fray.transition_reason', $1, true)`, [e.reason ?? '']);
    const { rows } = await c.query<CollectionEntryRow>(
      `INSERT INTO app.collection_entries (owner_id, fragrance_id, variant_id, state, rating, personal_note, acquired_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [ownerId, e.fragranceId, e.variantId ?? null, e.state, e.rating ?? null, e.personalNote ?? null, e.acquiredOn ?? null],
    );
    return rows[0]!;
  });
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

export async function listEntries(pool: pg.Pool, ownerId: string, state?: CollectionState): Promise<CollectionEntryRow[]> {
  const { rows } = await pool.query<CollectionEntryRow>(
    `SELECT * FROM app.collection_entries WHERE owner_id = $1 AND ($2::text IS NULL OR state = $2)
      ORDER BY created_at, id`,
    [ownerId, state ?? null],
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
