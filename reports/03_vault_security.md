# Phase 03 — Vault Authentication, PostgreSQL Dynamic Credentials and Owner AuthN/AuthZ

**Prompt:** FRAY-CLAUDE-03 (via `prompts/launchers/Claude_START_HERE.md`) · **Agent:** Claude (claude-opus-5-5) · **Date:** 2026-10-25 · **Status:** completed

## Launcher gate

`main`, origin verified; Phase 02 `completed`, commit `a4ed167` ancestor of `origin/main`; 0 unpushed; next eligible 03; lock acquired.

## Scope note (ADR-008)

The prompt's "inspect the existing Vault read-only" step is superseded by ADR-008: Vault is the project-owned `fray-vault` (no other project's Vault was touched). All mounts, policies and roles are F-Ray-grance-only.

## Implemented

| Area | Files |
|---|---|
| Root-token retirement | `make vault-bootstrap` (`scripts/vault.sh bootstrap`): scoped periodic orphan `fray-operator` token (0600 file), proven working, then the initial root token is **revoked**; init file keeps only the unseal key |
| Policies | `infra/vault/policies/{fray-api,fray-migrator,fray-operator}.hcl` |
| Vault configuration | `ansible/roles/vault_config` — hashed audit device (stdout), `database/` + `kv/` (v2) + `approle/`; policies written only when they differ; DB connection bootstrapped with a one-time password then `rotate-root` (only Vault knows the admin password); roles `fray-runtime` (15 m / 4 h, `IN ROLE fray_runtime`) and `fray-migrator` (10 m / 30 m, `IN ROLE fray_migrator`) with PG16+-safe revocation; session HMAC key in `kv/fray/session`; AppRole `fray-api` with token **and** secret-id bound to the `fraygrance` network CIDR. Vault templates kept literal via `!unsafe` |
| Vault Agent | `infra/config/vault-agent.hcl`; Terraform `fray-vault-agent` + `fraygrance_agent_{auth,rendered}` volumes (created `uid=100,gid=1000`); renders `db-runtime.json` and `session.json` (0640) |
| Credential delivery | `ansible/roles/vault_agent_credentials` — role-id/secret-id over stdin into the agent-only volume |
| Live migrations | `ansible/roles/db_migrate` — one-shot job container with a Vault-issued migrator lease, file removed and lease revoked in `always:`; `0001` applied to the live DB |
| API security | `security/password.ts` (Argon2id m=64 MiB t=3 p=1, dummy-hash timing for unknown users), `security/session-key.ts` (HMAC-SHA256 session digests, key from Vault, rotation signs everyone out), `security/plugin.ts` (Origin allow-list + double-submit CSRF on every unsafe method, 401/403/503 semantics, fails closed), `routes/auth.ts` (login with per-username lockout + per-client rate limit; logout revokes server-side; `__Host-` cookies `Secure; SameSite=Strict`, session `HttpOnly`) |
| Owner provisioning | `scripts/owner.sh` + `apps/api/src/cli/owner.ts`: `make owner-create / owner-reset-password / owner-revoke-sessions`; password via no-echo prompt → stdin only |
| Credential rotation | API rebuilds the pool on `28P01/57P01/…` and on credential-file change; verified pool swap |
| Sleep resilience | `make heal` / `make clock-sync` (`scripts/heal.sh`), clock check in `make health`, `make start` runs heal |
| Evidence | `scripts/probes/p03_live_security.sh` (reproducible live probe), `docs/runbook.md` |

## Validation (observed)

| Check | Result |
|---|---|
| `make test` (static, Terraform, Ansible, gitleaks, typecheck, integration) | **PASS** — Vitest 65/65 on disposable PG18 |
| `make up` with Vault configured | data 0 changes; app +agent, +api, +2 volumes; Ansible delivered AppRole creds, agent rendered files, `MIGRATIONS_OK applied 0001`; **HEALTH: PASS** |
| Ansible idempotency | rerun `changed=0` |
| `make drift` | NO_DRIFT data + app |
| Live probe `p03_live_security.sh` | **39/39 PASS** (output below) |

Unit/integration coverage added this phase: identical 401 for wrong password vs unknown user; foreign/missing Origin on login → 403 before credential check; cookie flags (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`); CSRF missing/wrong/cross-site → 403; logout revokes server-side (old cookie 401); anonymous mutation → 401; lockout after N failures even with the correct password → 429; per-client burst → 429; session-key rotation invalidates sessions; idle expiry; DB digest not replayable as a cookie; terminated backend → recovery; oversize body 413; unknown login fields 400; Argon2id PHC parameters.

### Live probe output (2026-10-25)

```text
== 1. Vault policy least privilege (real AppRole login from inside the project network)
  [PASS] AppRole login from inside fraygrance network
  [PASS] fray-api token: database/creds/fray-runtime -> 200
  [PASS] fray-api token: kv/data/fray/session -> 200
  [PASS] fray-api token: database/creds/fray-migrator -> 403
  [PASS] fray-api token: database/config/fray -> 403
  [PASS] fray-api token: sys/mounts -> 403
  [PASS] fray-api token: auth/approle/role/fray-api/secret-id -> 403
  [PASS] fray-api token: kv/data/fray/other -> 403
  [PASS] AppRole login from outside the project CIDR refused (400)
  [PASS] probe secret-id destroyed
== 2. Rendered credentials: runtime login is DML-only
  [PASS] agent-rendered login is a Vault dynamic role (v-approle-fray-run-J…)
  [PASS] runtime login: member of fray_runtime only, no CREATEROLE/SUPERUSER (t)
  [PASS] rendered file mode/owner (640 100:1000)
  [PASS] API mounts rendered volume read-only
  [PASS] API has no access to /vault/auth
== 3. Revocation and rotation (pool rebuild without data change)
  [PASS] revoked all fray-runtime leases
  [PASS] revoked login dropped in PostgreSQL (0)
  [PASS] API not ready while its credentials are revoked (fails closed) (503)
  [PASS] API ready again after agent re-render + pool swap (200)
  [PASS] new dynamic login issued
  [PASS] API rebuilt its pool from rotated credentials (2 -> 3)
  [PASS] no persistent data changed by rotation (1)
== 4. Vault outage
  [PASS] API stays ready on existing lease while Vault is down (200)
  [PASS] Vault restarts sealed (true)
  [PASS] unsealed from operator file
  [PASS] API ready after Vault recovery (200)
== 5. Owner login through the gateway (synthetic owner)
  [PASS] synthetic owner probe-a1e112 created via stdin
  [PASS] anonymous collection (401)
  [PASS] wrong password (401)
  [PASS] login from foreign Origin (403)
  [PASS] login (200)
  [PASS] session cookie HttpOnly
  [PASS] csrf cookie Secure, Path=/
  [PASS] authenticated collection (200)
  [PASS] logout without CSRF header (403)
  [PASS] logout with CSRF header (200)
  [PASS] old cookie after logout (401)
  [PASS] synthetic owner removed
== 6. No secret material in logs (Vault audit entries are HMAC-hashed and therefore allowed)
  [PASS] api, agent, vault and gateway logs contain no credential values
== RESULT pass=39 fail=0
```

## Findings during the phase

1. **Podman VM pause → lease revoked, API stuck (real, environmental).** The Mac idled; the VM paused ~23 min; chrony then stepped the clock by 1398 s. Vault (wall clock) revoked the API's lease on restart, while Vault Agent's monotonic renewal timer had not fired → API held dead credentials (it failed closed with 503). chrony also stayed anchored on a stale source (`makestep` alone did nothing; restarting chronyd fixed it). Mitigation: `make heal` (clock-sync + agent re-render), clock drift is now a `make health` failure, `make start` runs heal. Evidence: chronyd `System clock wrong by 1398.536113 seconds`, Vault `revoked lease … fray-runtime/FJn7…` right after `lease restore complete`, no agent request in the audit log after 07:06:14.
2. **Volume option drift would have replaced the agent volumes.** Podman reads `driver_opts` back with extra `UID/GID` keys → `ignore_changes = [driver_opts]`. A partial apply removed `fray-api` before failing; `make heal`/`make health` reported green because the API was "not provisioned" → both now fail when Vault is configured but the API/agent is missing.
3. Owner CLI printed a raw stack trace when the database was unavailable → clean JSON failure.
4. Probe false negatives fixed (VM-clock-skewed `podman logs --since`, log flooding, HMAC'd audit values counted as secrets). Vault audit entries are HMAC-hashed by design; verified no cleartext credentials in api/agent/vault/gateway logs.

## Safety & persistence

- No root token exists any more; the app never holds a Vault token; runtime login is DML-only (`fray_runtime` member, no CREATEROLE/SUPERUSER); migrator credentials live for one job and are revoked.
- Rotation/revocation and Vault outage changed no persistent data (schema ledger count unchanged); synthetic owners were deleted with the guarded `delete-synthetic` command, which refuses owners with personal data.
- Vault's own data and Raft snapshots are separate from PostgreSQL backups (`make vault-snapshot`, manual).

## Residual risks

- Plain HTTP between containers on the private network (ADR-008 accepted risk).
- After host sleep, recovery needs `make heal` (or `make start`); there is no background watchdog by design (no schedulers).
- `remove_secret_id_file_after_reading=false` keeps the AppRole secret-id in the agent-only volume so the agent survives restarts; it is CIDR-bound and the API cannot read it.
- Secure cookies over `http://localhost` work in Chromium/Firefox; Safari needs the Tailscale HTTPS origin (Phase 10).

## Next phase

**04 — Scento-first search, exact-identity resolver and source-provenance enrichment.**
