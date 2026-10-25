# Phase 02 — PostgreSQL Schema, Migrations and API Foundations

**Prompt:** FRAY-CLAUDE-02 (via `prompts/launchers/Claude_START_HERE.md`) · **Agent:** Claude (claude-opus-5-5) · **Date:** 2026-10-25 · **Status:** completed

## Launcher gate

`main`, origin verified; Phase 01 `completed`, commit `7928328` ancestor of `origin/main`; 0 unpushed; next eligible 02; lock acquired.

## Implemented

| Area | Files |
|---|---|
| Toolchain | `scripts/toolchain.sh` — project-local Node **24.21.0** (nodejs.org, SHASUMS256-verified, no Homebrew libs); Make puts it first on `PATH`; `engine-strict` rejects other Node majors |
| Workspace | `package.json` (npm workspaces), `.npmrc` (`save-exact`, `engine-strict`), `tsconfig.base.json` (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), `package-lock.json`; esbuild install script explicitly denied |
| Schema | `db/migrations/0001_canonical_schema.sql` — owners/credentials/sessions/login_attempts; brands; fragrances (exact identity, `UNIQUE NULLS NOT DISTINCT`); product_variants (GTIN-14 check-digit function, one *verified* mapping per GTIN); source_records/claims (provenance, origin-scoped); note_dictionary/fragrance_notes; fragrance_trait_scores (NULL ≠ 0, versioned method); fragrance_embeddings (`vector(768)`, model/revision/input hash); collection_entries (owner-scoped, rating ≠ ownership); collection_events (**trigger-written, append-only**); seasonal_preferences, season_fragrances (user vs provider editorial) |
| Migrator | `apps/api/src/db/migrate.ts`, `migrate-cli.ts` — forward-only, per-file transaction as `fray_owner`, checksum ledger, gap and "DB ahead of build" refusal, advisory lock, destructive-statement preflight with reviewed marker |
| API | `apps/api/src/{config,errors,app,server}.ts` — validated non-secret config (rejects `FRAY_*PASSWORD/SECRET/TOKEN` env), versioned error envelope, request-ID echo/replace, cookie/auth header log redaction, 64 KiB body limit, trusted-proxy pinning, `/api/health/live` + `/api/health/ready` (DB + schema version) |
| DB access | `db/pool.ts` — `RotatingPool` reads Vault-Agent-style credential **file**, verifies new pool before swap, keeps old pool on bad credentials; `repo/catalog.ts`, `repo/collection.ts` (every personal query `owner_id`-scoped) |
| Security module | `security/sessions.ts` (opaque tokens, only SHA-256 digests stored, idle + absolute expiry, revocation, CSRF digest compare), `security/plugin.ts` (central `requireOwner`, `assertOwner`; caller identity headers ignored); all of `/api/v1/*` protected |
| Container | `apps/api/Containerfile` (Node 24 pinned digest, multi-stage, non-root `node`, HEALTHCHECK) |
| Tests | `apps/api/test/{domain,migrate,schema,api}.test.ts`; `scripts/test-db.sh` (disposable PG18+pgvector applying the **production Ansible role SQL**); wired into `make test` |
| Docs | `docs/migrations.md` — safe-forward guide, rollback = pre-migration backup |

API namespace note: personal/catalog routes are versioned under `/api/v1/…`; health stays at `/api/health/*` as in `spec/PRODUCT_SPEC.md` §5.

## Validation (observed)

| Check | Result |
|---|---|
| `make test` (static + Terraform + Ansible + gitleaks + typecheck + integration) | **PASS** |
| Vitest, disposable PostgreSQL 18.6 + pgvector 0.8.7 | **53/53 passed**, rerun 53/53 |
| Migration from empty DB, second run no-op, nothing owned by login | PASS |
| Checksum tamper, DB-ahead-of-build, numbering gap, atomic rollback of failing file | PASS (all refused / rolled back) |
| Destructive preflight (DROP/TRUNCATE/DELETE unmarked → refused; marked → allowed; keywords inside DDL ignored) | PASS |
| Flanker separation: *Invictus Elixir* ≠ *Invictus Victory Elixir*; case/accent duplicate rejected; concentration splits identity | PASS |
| GTIN: bad check digit rejected, leading zeros kept, verified needs source, **concurrent verified race → exactly one wins**, unverified candidates coexist | PASS |
| Traits: NULL requires `unknown`, 0 allowed when sourced, out-of-range/unknown trait rejected | PASS |
| History: 3 transitions → 3 events with reasons; non-state update adds none; UPDATE/DELETE/TRUNCATE of events refused; entry with history cannot be deleted | PASS |
| Owned ≠ liked, repeat purchases separate, cross-owner reads/transitions return nothing | PASS |
| Runtime role: CREATE (app/public), DROP, ALTER … DISABLE TRIGGER, CREATE EXTENSION, CREATE ROLE, DELETE ledger → all `42501` | PASS |
| API: anonymous `/api/v1/*` → 401 envelope with matching `x-request-id`; spoofed `x-owner-id`/`tailscale-user-login` ignored; revoked/expired session 401; other owner's history 404 (no leak); validation 400; unknown route 404 | PASS |
| Ready: 200 when current; 503 on schema mismatch; 503 when credentials missing | PASS |
| Credential rotation: swap to new login, keep old pool on rejected credentials | PASS |
| Built image smoke (disposable DB): migrate #1 applied 0001, #2 skipped; live 200; ready 200; anon 401; container `healthy`; 0 secret mentions in logs | PASS |
| `make drift` after image build | NO_DRIFT data + app (API provisioning gated until Vault Agent exists) |

## Findings fixed during the phase

- **Ledger exposure:** default privileges granted `fray_runtime` DML on `app.schema_migrations`; migrator now revokes and grants SELECT only (test added).
- **Ownership trap:** a ledger created by the migrator *login* would block Vault's `DROP ROLE` revocation; whole session now runs as `fray_owner` (test asserts no app table owned by anyone else).
- **Host toolchain:** Vitest 5 does not support Node 25. Installing Homebrew `node@24` upgraded shared `simdjson` and broke the operator's default Node 25 (dyld). Reverted (`brew uninstall node@24`, opt link restored, default node verified v25.2.1) and replaced with a self-contained nodejs.org build under `~/.local/share/f-ray-grance/toolchain`.
- Podman cannot bind-mount paths under `~/Documents` (macOS privacy); tests and smoke runs use loopback ports and `~/.config` mounts only.

## Safety & persistence

- No migration was applied to the live `fray` database in this phase: live migrations need a Vault-issued migrator credential (Phase 03). Authoritative data untouched; all tests used disposable, synthetic databases that were removed.
- No secrets in repo, env, argv or logs; credentials only via files.

## Residual risks / next

- Login, logout, Argon2id hashing, CSRF enforcement on mutations, rate limiting and Vault-issued credentials are Phase 03.
- Next: **03 — Vault authentication and PostgreSQL dynamic credentials.**
