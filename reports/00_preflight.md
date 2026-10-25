# Phase 00 — Preflight, State Recovery and Foundation Validation

**Prompt:** FRAY-CLAUDE-00 · **Agent:** Claude (claude-opus-5-5) · **Date:** 2026-10-25 (UTC) · **Status:** completed (with open gates carried forward, listed below)

## State

- `state/BUILD_STATE.json` did not exist → initialised with zero claimed completion (`scripts/state.py init`), then Phase 00 marked `in_progress`.
- Repository: `https://github.com/raymonepping/f_Ray_grance.git`, branch `main`, not protected (GitHub API 404 "Branch not protected"). Baseline commit `bc5b4fa` (v0.1.6 docs, spec/ layout) pushed via `./scripts/commit_gh` before this phase.
- Lock: `state/.run.lock` acquired with atomic `mkdir`; released at end of phase.

## Environment

| Item | Observed |
|---|---|
| Host | macOS, `arm64` |
| Podman | client 6.1.4, engine 5.7.1 (API 1.41), machine `podman-machine-default` (applehv, 12 CPU, 48 GiB, running) |
| Podman API socket | `unix:///var/folders/…/podman/podman-machine-default-api.sock` — `/version` reports components `Podman Engine, Conmon, OCI Runtime (crun)`. `/var/run/docker.sock` is a symlink to the Podman machine socket; no Docker Desktop installed. |
| Terraform | 1.14.2, provider `kreuzwerker/docker` 4.6.0 |
| Ansible | core 2.21.3 |
| Vault CLI | 2.1.0+ent (host) |
| Node / npm | v25.2.1 / 11.6.2 on host (containers will run Node 24 LTS as specified); pnpm not installed → npm workspaces |
| GNU Make | 3.81 |
| psql | 18.1 |
| Tailscale | **not installed** |
| Ollama | not installed on host — runs as container per architecture |
| VM clock | host and VM UTC identical at check time |

## Gate matrix

| Gate | Status | Evidence |
|---|---|---|
| G00.0 docs/agent consistency | **PASS** | `make validate-docs`: 59 frozen docs hash-verified (spec/, prompts/, docs/adr/), 36 prompts, 237 local links; prompt validator PASS. Tooling adapted to `spec/` layout; link rewrite of 50 links. |
| G00.1 host tools + socket identity | **PASS** (notes) | `make doctor` exit 0 with verified Podman socket; bad socket → exit 2. Notes: Tailscale missing (affects G00.10/Phase 10), host Node 25 ≠ target Node 24 (containers pin 24). |
| G00.2 Terraform ↔ Podman disposable probe | **PASS** | `smoke-init/plan/up` → 4 resources; probe visible in Podman with label `io.fraygrance.project=fraygrance` and volume mount. **Finding:** initial config drifted on every plan (Podman reports custom `network_mode` as `bridge`, and IPAM as `{driver=host-local}`) → forced replacement. Fixed with `networks_advanced` + `ipam_options = { driver = "host-local" }`; fresh create then re-plan `-detailed-exitcode` = 0. `smoke-down` destroyed 4; 0 leftovers. tfstate git-ignored. |
| G00.3 PG18 + pgvector ARM64 | **PASS** | `docker.io/pgvector/pgvector:0.8.7-pg18-trixie` @ `sha256:14d8a514128e8a98150fa391e522e05a8bf70e17bf1a69448fdb7a436c2187c6`, Architecture `arm64`. `SELECT version()` → PostgreSQL 18.6 aarch64; `extversion` → 0.8.7; `data_directory` → `/var/lib/postgresql/18/docker`; image VOLUME `/var/lib/postgresql`. Cosine ordering correct. Container removed and recreated on same named volume → rows preserved (3/3). |
| G00.4 Ansible disposable run | **OPEN → Phase 01** | No roles exist yet; syntax/idempotency is executed when Phase 01 creates them. |
| G00.5 Vault DB dynamic credentials | **PASS (disposable probe)** | `hashicorp/vault:2.1.2` arm64 @ `sha256:7d8aca84…`, dev-mode, disposable network. Issue (TTL 120s), DML OK, DDL in app/public denied, CREATE EXTENSION denied, CREATE ROLE denied, renew OK, `rotate-root` OK. **Finding:** PG18 + Vault default-style revocation (`REASSIGN OWNED`) failed with `permission denied to reassign objects` and Vault kept retrying while the credential stayed live. Fixed: `ALTER ROLE <vault-admin> SET createrole_self_grant = 'set, inherit'` + revocation `pg_terminate_backend … ; DROP ROLE` → role removed, login refused. Residual: an issued credential keeps working during a Vault outage until `VALID UNTIL`. Probe kept at `scripts/probes/p00_vault_db_probe.sh`. Per **ADR-008** the production Vault is project-owned `fray-vault`. |
| G00.6 Scento provider + strict resolver | **PASS (provider)** | `GET /api/perfume/v1/search?q=…&kind=perfume` (HTTP 200, ~0.15–0.47 s): *Phantom In Red* → exact `Rabanne | Phantom in Red` (slug `phantom-in-red-rabanne`); profile returns concentration `parfum`, family Green Leaf / Amber & Resin, top/heart/base pyramid, wears seasons, attribution `cite`. *Invictus Elixir* → top hit is the **distinct** `Invictus Victory Elixir` (must be rejected). *1 Million Black*, *1 Million Night Elixir* → no exact record. Terms §22 re-read 2026-10-25: free, keyless, read-only; no overloading, no limit workarounds, no wholesale copying, no implied house endorsement. OpenAPI 3.1 lists 14 GET paths; no documented rate limit → client self-limits. Resolver implementation is Phase 04. |
| G00.7 Ollama embedding model | **PASS** | `ollama/ollama:0.40.2` arm64 @ `sha256:fd3acc21…` (disposable). `nomic-embed-text:v1.5` (blob `sha256-970aa74c0a90ef7482477cf803618e776e173c007bf957f635f1015bfcfef0e6`, 274 MB), architecture nomic-bert, **768 dims**, context 2048. Same text twice → identical vector hash (`54bf440603c11e91`, cos 1.000000); ~106 ms/embedding CPU. Cosine values are semantic text similarity only. |
| G00.8 Nuxt shell proof | **OPEN → Phase 05** | Not built in Phase 00. |
| G00.9 manual backup/restore off-VM | **OPEN → Phase 01/10** | Strategy recorded below; `make backup`/`restore-test` still fail closed. No scheduler exists (`crontab`/launchd not touched). |
| G00.10 Tailscale Serve + login design | **BLOCKED (operator)** | Tailscale is not installed on the Mac. Design is fixed by ADR-005: gateway on `127.0.0.1:8470`, `tailscale serve` HTTPS → that port, Funnel never enabled, owner login + 401/403/CSRF in Fastify. Operator must install Tailscale, enable MagicDNS + HTTPS, and restrict grants before Phase 10. |
| G00.11 direct-to-main handoff | **PASS** | origin is GitHub `raymonepping/f_Ray_grance`, branch `main`, no branch protection; `./scripts/commit_gh` pushed baseline `bc5b4fa`. Finding: `git diff --check` rejected Markdown hard line breaks → `.gitattributes` exempts `*.md` from trailing-space checks. Finding: the local pre-commit hook (`sanity_check --fix`) reformats staged `.py/.sh/.js/.tf` *after* staging → run the formatter before staging. |

## Approved delivery sequence and ownership boundary

- Images: built/pulled by Make via `podman build --format docker` (keeps HEALTHCHECK) or pinned pulls; Terraform references them by digest/tag.
- **Terraform data root** (`infra/terraform/data`): `fraygrance_pgdata`, `fraygrance_vault_data`, `fraygrance_ollama_models` volumes — `prevent_destroy`, separate state.
- **Terraform app root** (`infra/terraform/app`): network `fraygrance`, containers `fray-postgres`, `fray-vault`, `fray-vault-agent`, `fray-ollama`, `fray-api`, `fray-web` (gateway, published **only** on `127.0.0.1:8470`). Uses `networks_advanced` + declared IPAM to stay drift-free.
- **Ansible**: Vault init check/policies/engines/AppRole, PostgreSQL roles + migrations, Ollama model readiness. Never container lifecycle.
- **Make**: the only operator interface; destructive data actions remain `danger-*` and deny by default.

## Manual backup / restore strategy (not yet executed)

`make backup` → `pg_dump -Fc` via a backup role into `~/F-Ray-grance-backups/` (mode 0700, outside repo and Podman VM) with temp-file + checksum + manifest, atomically marked complete; operator copies to protected off-device media and records it (`make backup-status`). `make restore-test` restores into a disposable PG18+pgvector container and compares Tier A counts and fingerprints. Vault Raft snapshot is separate (`make vault-snapshot`). No cron/launchd/CI schedule.

## Changed files

`.gitattributes`, `scripts/doctor.sh`, `scripts/state.py`, `scripts/probes/p00_vault_db_probe.sh`, `scripts/validate_release.py`, `scripts/validate_prompts.py` (formatter output), `infra/terraform/phase00/main.tf`, `infra/terraform/phase00/.terraform.lock.hcl`, `docs/adr/ADR-008-project-owned-vault.md`, `spec/MANIFEST.json`, `state/BUILD_STATE.json`, `reports/00_preflight.md`.

## Residual risks

- Vault outage leaves already-issued DB credentials valid until expiry (by design); keep TTLs short.
- Tailscale/iPhone path unverified until operator installs Tailscale (Phase 10).
- Host Node 25 differs from container Node 24; CI-equivalent tests must run in Node 24 containers for release evidence.
- Untracked operator tooling directories (`.agents/`, `.claude/`, `.codex/`, `.impeccable/`) appeared during this session; not touched or committed by the agent.

## Next phase

**01 — Terraform, Ansible, Podman and durable stack control.**
