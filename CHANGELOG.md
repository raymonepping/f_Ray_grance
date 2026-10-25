# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Build phases follow [`spec/PHASE_MANIFEST.md`](spec/PHASE_MANIFEST.md); evidence lives in [`reports/`](reports).

## [Unreleased]

### Added

- **Phase 03 — Vault and owner security.** `make vault-bootstrap` (scoped `fray-operator` token, initial root token revoked); Ansible-managed Vault audit device, `database/`, `kv/`, AppRole and least-privilege policies; Vault Agent rendering 15-minute PostgreSQL leases and a session HMAC key for the API; live migrations with a single-use migrator lease; owner login/logout with Argon2id, `__Host-` Secure/HttpOnly/SameSite=Strict cookies, Origin allow-list, double-submit CSRF, lockout and rate limiting; `make owner-create/owner-reset-password/owner-revoke-sessions`; `make heal`/`make clock-sync` for Podman VM pauses; live security probe (39 checks) and `docs/runbook.md`.
- **Phase 02 — schema and API foundations.** Migration `0001_canonical_schema` (exact fragrance identity, GTIN-14 variants, provenance claims, NULL-not-zero traits, `vector(768)` embeddings, owner-scoped collection with trigger-written append-only history, four-season preferences); checksummed forward-only migrator with destructive-statement preflight; Fastify API with validated config, error envelope, request IDs, live/ready health, central owner guard on `/api/v1`, opaque hashed sessions and a rotating credential-file DB pool; 53 integration tests on disposable PostgreSQL 18; `docs/migrations.md`.
- Project-local Node 24.21.0 toolchain (`make toolchain`, `make deps`) and `apps/api/Containerfile`.
- **Phase 01 — infrastructure and persistence.** Terraform data root (`fraygrance_pgdata`, `fraygrance_vault_data`, `fraygrance_ollama_models`, `prevent_destroy`) and app root (`fraygrance` network, `fray-postgres`, `fray-vault`, `fray-ollama`, `fray-web` gateway on `127.0.0.1:8470`) with state under `~/.local/state/f-ray-grance/terraform`, outside Git.
- Ansible `site.yml` with `preflight`, `postgres_base` (database `fray`, least-privilege role model, `vector`, schema `app`), `ollama_model` and `vault_status` roles; second run is `changed=0`.
- Make targets `images`, `bootstrap`, `drift`, `recreate`, `vault-init`, `vault-unseal`, `vault-status`, `vault-snapshot`, `backup`, `backup-status`, `backup-record-copy`, `restore-test`; working `health` and `test` gates.
- Manual backup (`pg_dump -Fc` as `fray_backup`, checksum + manifest with per-table fingerprints) and isolated restore rehearsal into a network-less disposable PostgreSQL.
- **Phase 00 — preflight.** `state/BUILD_STATE.json` and atomic `scripts/state.py`; Phase 00 gate report; Vault database-engine probe (`scripts/probes/`); ADR-008 project-owned `fray-vault`.

### Changed

- Spec documents live in `spec/`; validators, manifest hashing (frozen docs only) and 50 relative links adapted.
- `make doctor` and all Terraform targets prove the socket identifies as *Podman Engine* (replaces the manual `CONFIRM_PODMAN_SOCKET=YES`).
- `make destroy` auto-approves Terraform only after the typed confirmation phrase and `VERIFIED_BACKUP=YES`.
- `.terraform.lock.hcl` is committed (overrides the global ignore) so provider pins are reproducible.

### Removed

- `infra/terraform/foundation/` placeholder, superseded by `infra/terraform/data` and `infra/terraform/app`.

### Fixed

- Podman VM pause (Mac sleep) let Vault revoke the API's lease while Vault Agent had not renewed: `make heal` re-syncs the VM clock and re-renders credentials; `make health` fails on clock drift.
- Agent volume `driver_opts` read back with extra `UID/GID` keys forced replacement: `ignore_changes`.
- `make heal`/`make health` no longer report green when the API is expected but missing.
- Runtime role could modify `app.schema_migrations` through default privileges; now SELECT-only.
- Migration ledger owned by the migrator login would block Vault `DROP ROLE` revocation; migrations run as `fray_owner`.
- Terraform drift on Podman: custom `network_mode` reads back as `bridge` and IPAM as `host-local`; use `networks_advanced` and declare `ipam_options`.
- Vault dynamic-credential revocation on PostgreSQL 16+: `createrole_self_grant = 'set, inherit'` and terminate-then-`DROP ROLE` revocation.
- `podman build` denied access to `~/Documents` by macOS privacy controls: build contexts are staged to a clean temp copy.
- `git diff --check` rejected Markdown hard line breaks: `.gitattributes` exempts `*.md`.

### Security

- No Vault root token remains after bootstrap; the API holds no Vault token; AppRole secret-id and token bound to the private project CIDR.
- Session digests are HMAC-SHA256 with a Vault-held key: a database dump cannot be replayed as a cookie.
- PostgreSQL superuser has no network password (local socket via `podman exec` only); bootstrap secret is a host file outside Git and Terraform state.
- Vault unseal key and initial root token only in `~/.config/f-ray-grance/vault-init.json` (0600); unseal via request body on stdin, never argv.
- No host port bound to `0.0.0.0`; gateway and Vault operator port are loopback-only.
