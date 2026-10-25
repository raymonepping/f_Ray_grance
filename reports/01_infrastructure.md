# Phase 01 — Terraform, Ansible, Podman and Durable Stack Control

**Prompt:** FRAY-CLAUDE-01 (via `prompts/launchers/Claude_START_HERE.md`) · **Agent:** Claude (claude-opus-5-5) · **Date:** 2026-10-25 · **Status:** completed

## Launcher gate

Branch `main`, origin `raymonepping/f_Ray_grance`; Phase 00 `completed` and its commit `118062e` is an ancestor of `origin/main`; 0 unpushed commits; lowest non-completed phase = 01; `state/.run.lock` acquired.

## Implemented

| Area | Files | Ownership |
|---|---|---|
| Image pins (arm64 digests) | `infra/versions.mk` | Make (`make images`, staged build contexts, `--format docker`) |
| Protected data boundary | `infra/terraform/data/main.tf` | Terraform, separate state, `prevent_destroy` on 3 volumes |
| Replaceable app boundary | `infra/terraform/app/{main,variables}.tf` | Terraform: network `fraygrance`, `fray-postgres`, `fray-vault`, `fray-ollama`, `fray-web`; `fray-api` and `fray-vault-agent` gated off until Phases 02/03 |
| Service config | `infra/config/{vault.hcl,Caddyfile,vault-agent.hcl}` | Uploaded by Terraform (non-secret) |
| Configuration | `ansible/` (`preflight`, `postgres_base`, `ollama_model`, `vault_status`) | Ansible via `podman exec`; never container lifecycle |
| Operator CLI | `Makefile`, `scripts/{tf,podman_socket,images,bootstrap,vault,health,test,backup,backup-status,restore-test}.sh`, `scripts/backup_manifest.py`, `scripts/sql/` | Make |

**Locations outside Git:** Terraform state `~/.local/state/f-ray-grance/terraform/{data,app}.tfstate` (0700); bootstrap secret `~/.config/f-ray-grance/secrets/pg_superuser`; Vault init `~/.config/f-ray-grance/vault-init.json` (0600); backups `~/F-Ray-grance-backups` (0700).

**Role model (PostgreSQL):** `fray_owner` (NOLOGIN, owns schema `app`), `fray_migrator` (NOLOGIN group, member of owner — for Vault-issued migration logins), `fray_runtime` (NOLOGIN group, DML via default privileges), `fray_backup` (LOGIN, `pg_read_all_data`, local socket only), `fray_vault_admin` (LOGIN CREATEROLE, `createrole_self_grant='set, inherit'`, password to be set and rotated by Vault in Phase 03). Superuser `postgres` has `PASSWORD NULL` → reachable only through `podman exec`.

## Validation (observed)

| Check | Result | Evidence |
|---|---|---|
| `make test` | **PASS** | docs, shell/python syntax, `terraform fmt` ×3, `validate` data+app, Ansible syntax, no tracked secrets/state/backups, no `0.0.0.0` publish, no scheduler, gitleaks |
| `make plan` → `make provision` | **PASS** | data 3 added; app 5 added |
| Idempotency | **PASS** | `make drift` → `NO_DRIFT data`, `NO_DRIFT app`; Ansible run 1 `changed=3`, run 2 `changed=0` |
| `make vault-init` | **PASS** | initialised (1/1 Shamir), key only in operator file 0600, auto-unseal step `UNSEAL_OK`, version 2.1.2 |
| `make health` | **PASS** | 4 containers running; PG 18.6 + vector 0.8.7; PGDATA on `fraygrance_pgdata`; Vault initialised+unsealed; Ollama `nomic-embed-text:v1.5`; gateway 200; gateway bound `127.0.0.1:8470` only; api/agent SKIP (not yet provisioned) |
| stop/start preserves data | **PASS** | synthetic 5-row table fingerprint `5 3d03233f…` identical; Vault restarts sealed, `make start` unseals |
| Container recreation on same volume | **PASS** | `make recreate SERVICE=postgres`: container id `5b26a901ee5b → f9b6c2f47686`, fingerprint identical, `NO_DRIFT` after |
| `make backup` | **PASS** | `fray-20261025T062902Z.dump` (3851 B, sha256 `a5e17eb1…`), manifest with per-table fingerprint; temp-file → verify → manifest written last |
| `make backup-status` | **PASS (honest)** | last verified backup age 0h; off-device copy **NOT RECORDED**; restore test none → then PASS |
| `make restore-test` | **PASS** | disposable `--network none`, no volume; 1 table, 5 rows, fingerprints equal, pgvector 0.8.7; container removed |
| `make destroy` guards | **PASS** | without `VERIFIED_BACKUP=YES` → exit 2; wrong phrase → `Aborted` exit 2 |
| `make destroy` (app root) | **PASS** | 5 destroyed; all 3 data volumes remain |
| Data root destroy | **PASS (refused)** | `plan -destroy` → `Instance cannot be destroyed … prevent_destroy`; `make danger-destroy-data` → DENIED exit 2 |
| Rebuild after destroy | **PASS** | `make up`: data 0 changes, app 5 added, Vault only needed unseal (data intact), Ansible `changed=0`, health PASS, fingerprint identical |
| Cross-project non-interference | **PASS** | the 108 non-`fray-` containers listed before and after the phase are identical |
| No tracked tfstate/secrets/backups | **PASS** | `git ls-files` guard + gitleaks |

Synthetic table `app.p01_synthetic` was dropped after the tests. The synthetic backup in `~/F-Ray-grance-backups` contains no personal data.

## Findings fixed during the phase

- macOS privacy controls deny `podman build` read access to `~/Documents` (`faccessat … operation not permitted`, also outside the agent sandbox) → `images.sh` stages each context with openrsync into a temp dir and clears xattrs.
- `make destroy` used `-input=false` without approval → would always fail after the confirmation phrase; now auto-approves only after phrase + `VERIFIED_BACKUP=YES`.
- Socket confirmation: manual `CONFIRM_PODMAN_SOCKET=YES` replaced by an automatic identity proof (`/version` must report `Podman Engine`).

## Safety & persistence

- Normal targets never remove volumes; `stop/down` stop only `fray-*` containers by name; no Podman machine or unscoped prune commands exist.
- Terraform `prevent_destroy` is defence in depth only; the separate data state + `make destroy` scoping is the primary boundary; the manual backup + restore test is the recovery path.
- No scheduler, cron or launchd entry was created.

## Residual risks / open items

- Off-device backup copy is an operator action (`make backup-record-copy`), not yet recorded.
- `must_run` containers stopped with `make stop` show as Terraform drift until `make start` (documented reconcile behaviour).
- Vault listener is plain HTTP on the private network (ADR-008 accepted risk).
- G00.10 Tailscale still BLOCKED on operator install (needed in Phase 10).

## Next phase

**02 — PostgreSQL schema, migrations and Node API foundations.**
