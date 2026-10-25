# Database migrations — safe-forward guide

Migrations live in [`db/migrations/`](../db/migrations) as `NNNN_snake_name.sql` and are applied by
[`apps/api/src/db/migrate.ts`](../apps/api/src/db/migrate.ts). They protect Tier A personal data
(collection, history, seasons, corrections — see `spec/DATA_PERSISTENCE.md`).

## How the runner behaves

| Property | Behaviour |
|---|---|
| Identity | Session runs as `fray_owner` (`SET ROLE` from a migrator login). Nothing is owned by the login, so Vault can revoke it with `DROP ROLE`. |
| Atomicity | Each file runs in its own transaction; a failure rolls the whole file back and stops. |
| Ledger | `app.schema_migrations(version, name, checksum, applied_at)`. Runtime role may only `SELECT` it. |
| Immutability | An applied migration whose file checksum changed is a **hard failure**. Never edit an applied file; add a new one. |
| Ordering | Versions must be contiguous (0001, 0002, …). A database ahead of the build is refused (no running old code on a newer schema). |
| Concurrency | `pg_advisory_lock` — one migrator at a time. |
| Destructive preflight | `DROP TABLE/SCHEMA/COLUMN/DATABASE/OWNED`, statement-level `TRUNCATE`, `DELETE FROM` or `UPDATE … SET` are refused unless the file carries a reviewed marker line: `-- fray:allow-destructive <reason>`. |
| Idempotency | Re-running applies nothing (`skipped`). The API's `/api/health/ready` reports `schema: fail` until the database matches the build. |

## Rules for authors

1. **Expand → migrate → contract**, across separate releases:
   add nullable column / new table → backfill (in its own reviewed migration) → switch reads/writes →
   remove the old structure in a *later*, separately approved release with the destructive marker.
2. Never `TRUNCATE`, re-seed, or cascade-delete authoritative tables. `collection_events` is append-only and
   enforced by triggers; do not disable them.
3. Keep `NULL` (unknown) distinct from `0` (assessed absent) for traits and ratings.
4. Embedding dimension changes are new rows/model ids, never an in-place `ALTER … TYPE vector(N)` over old data.
5. New tables owned by `fray_owner` automatically grant DML to `fray_runtime` (default privileges). If the
   runtime must not write a table, `REVOKE` explicitly in the same migration and add a test.

## Before applying to the real database

1. `make backup` and `make restore-test` (manual, ADR-007) — a downgrade after a forward migration may not be
   possible; the pre-migration backup **is** the rollback path.
2. `make test` (runs every migration from an empty database on disposable PostgreSQL 18 and the invariant suite).
3. Apply with a Vault-issued **migrator** credential (Phase 03), never the runtime credential.

## Rollback

There are no automatic down-migrations. Recovery is:

- *Additive change gone wrong* → ship a new forward migration that corrects it.
- *Data damaged* → restore the pre-migration backup into a disposable database (`make restore-test`), verify,
  then perform the guarded live restore (`make restore`, Phase 10).
