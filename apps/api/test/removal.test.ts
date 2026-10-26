// Owner-requested permanent removal of a collection entry: previewed, confirmed, logged; history
// stays append-only for every other path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { createEntry, transitionEntry } from '../src/repo/collection.js';
import type { RotatingPool } from '../src/db/pool.js';
import { EXPECTED_SCHEMA_VERSION, runtimePool, seedOwner, sessionKey, testConfig, uniq } from './helpers.js';

describe('collection entry removal', () => {
  let app: FastifyInstance;
  let rp: RotatingPool;
  const { key } = sessionKey();
  let owner: string;
  let other: string;
  let H: Record<string, string>;
  let O: Record<string, string>;
  let frag: string;
  const headersFor = async (o: string) => {
    const s = await createSession(rp.get(), key, o, 1);
    return { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: 'http://localhost:8470', 'x-csrf-token': s.csrfToken };
  };

  beforeAll(async () => {
    rp = await runtimePool();
    app = await buildApp({ config: testConfig(), pool: rp, key, expectedSchemaVersion: EXPECTED_SCHEMA_VERSION, logger: false });
    owner = await seedOwner(rp.get());
    other = await seedOwner(rp.get());
    H = await headersFor(owner);
    O = await headersFor(other);
    const brand = await upsertBrand(rp.get(), uniq('Removal House'));
    frag = await createFragrance(rp.get(), { brandId: brand, name: uniq('Mistake'), concentration: 'parfum', identityStatus: 'verified' });
  });
  afterAll(async () => {
    await app.close();
    await rp.close();
  });

  it('previews, requires confirmation, refuses other owners, then removes entry + history and logs counts only', async () => {
    const e = await createEntry(rp.get(), owner, { fragranceId: frag, state: 'sampled', rating: 4, personalNote: 'private words' });
    await transitionEntry(rp.get(), owner, e.id, 'owned', 'bought it');
    const keep = await createEntry(rp.get(), owner, { fragranceId: frag, state: 'wishlist' }); // another bottle stays
    const ex = (await rp.get().query("INSERT INTO app.training_exercises (owner_id, entry_id, title) VALUES ($1, $2, 'blotter') RETURNING id", [owner, e.id])).rows[0].id;

    const preview = await app.inject({ method: 'GET', url: `/api/v1/collection/${e.id}/removal-preview`, headers: H });
    expect(preview.json()).toEqual({ state: 'owned', events: 2, hasRating: true, hasNote: true, practice: 1 });
    expect((await app.inject({ method: 'GET', url: `/api/v1/collection/${e.id}/removal-preview`, headers: O })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/collection/${e.id}`, headers: H, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/collection/${e.id}`, headers: O, payload: { confirm: 'REMOVE' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/collection/${e.id}`, headers: { cookie: H.cookie!, origin: H.origin! }, payload: { confirm: 'REMOVE' } })).statusCode).toBe(403); // CSRF

    const del = await app.inject({ method: 'DELETE', url: `/api/v1/collection/${e.id}`, headers: H, payload: { confirm: 'REMOVE' } });
    expect(del.json()).toEqual({ removed: true, summary: { state: 'owned', events: 2, hasRating: true, hasNote: true, practice: 1 } });
    const q = (sql: string, args: unknown[]) => rp.get().query(sql, args).then((r) => r.rows);
    expect(await q('SELECT 1 FROM app.collection_entries WHERE id = $1', [e.id])).toEqual([]);
    expect(await q('SELECT 1 FROM app.collection_events WHERE entry_id = $1', [e.id])).toEqual([]);
    expect(await q('SELECT entry_id FROM app.training_exercises WHERE id = $1', [ex])).toEqual([{ entry_id: null }]); // kept as generic practice
    expect((await q('SELECT 1 FROM app.collection_entries WHERE id = $1', [keep.id])).length).toBe(1);
    const log = await q('SELECT kind, fragrance_id, subject_id, summary FROM app.deletion_log WHERE owner_id = $1', [owner]);
    expect(log).toEqual([{ kind: 'collection_entry', fragrance_id: frag, subject_id: e.id, summary: { state: 'owned', events: 2, hasRating: true, hasNote: true, practice: 1 } }]);
    expect(JSON.stringify(log)).not.toContain('private words');
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/collection/${e.id}`, headers: H, payload: { confirm: 'REMOVE' } })).statusCode).toBe(404);
  });

  it('history stays append-only for the runtime login, even if it sets the exemption itself', async () => {
    const e = await createEntry(rp.get(), owner, { fragranceId: frag, state: 'owned' });
    await expect(rp.get().query('DELETE FROM app.collection_events WHERE entry_id = $1', [e.id])).rejects.toThrow(/append-only/);
    const c = await rp.get().connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('fray.removing_entry', $1, true)", [e.id]);
      await expect(c.query('DELETE FROM app.collection_events WHERE entry_id = $1', [e.id])).rejects.toThrow(/append-only/);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
    await expect(rp.get().query("INSERT INTO app.deletion_log (owner_id, kind, subject_id, summary) VALUES ($1, 'collection_entry', $1, '{}')", [owner])).rejects.toThrow(/permission denied/);
    expect((await rp.get().query('SELECT count(*)::int AS n FROM app.collection_events WHERE entry_id = $1', [e.id])).rows[0].n).toBe(1);
  });
});
