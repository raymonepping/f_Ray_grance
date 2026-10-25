# ADR-008: Project-owned Vault (`fray-vault`) instead of an existing external cluster

**Status:** Accepted | **Date:** 2026-10-25 | **Baseline:** v0.1.6 | **Supersedes:** the "existing external Vault, do not deploy a second Vault" statements in `spec/ARCHITECTURE.md`, `spec/SECURITY.md` and `spec/OPERATIONS.md`

## Context

The v0.1.6 baseline assumed a separately operated Vault cluster. On this Mac the only Vault instances belong to unrelated lab projects (Arcanium, Secret Theatre, Goldie Locks, vault_pki), are stopped, and must not be coupled to a personal application. The owner decided (2026-10-25) that F-Ray-grance runs **its own** Vault.

## Decision

- F-Ray-grance provisions a single-node Vault container **`fray-vault`** (official `hashicorp/vault` image, pinned version and arm64 digest, OSS — the database secrets engine, AppRole, KV v2 and Vault Agent are all OSS features).
- **Not dev mode.** Integrated Raft storage on a stable, project-scoped named volume owned by the **data** Terraform root (`infra/terraform/data`), so `make destroy` of the app root cannot delete it.
- Listener reachable only on the private project network; published to the host **only on 127.0.0.1** for operator CLI use. Never exposed through the gateway or Tailscale Serve.
- Initialization is an explicit operator step (`make vault-init`). Unseal key(s) and the initial root token are written **only** to an operator-protected file outside the repository and outside the Podman VM (default `~/.config/f-ray-grance/vault-init.json`, mode 0600). They never enter Git, Terraform state, Ansible logs, container arguments or `state/BUILD_STATE.json`.
- Vault starts sealed after a restart; `make vault-unseal` unseals from the operator file. No auto-unseal service in v0.1 (a transit/KMS seal is a future option).
- The root token is used only for bootstrap configuration (`no_log`), then revoked; later privileged changes use `vault operator generate-root` or a scoped operator policy.
- The application never holds a root/admin token. It reaches Vault only through **Vault Agent** (`fray-vault-agent`) with AppRole; the Agent renders short-lived PostgreSQL credentials from the database secrets engine and the session-signing key from KV v2.
- Vault configuration (mounts, policies, roles) is owned by **Ansible**, the container/volume by **Terraform**, consistent with ADR-002. Raft snapshots (`make vault-snapshot`, manual only, ADR-007) are Vault's backup; a PostgreSQL dump does **not** back up Vault.

## Consequences

- All Vault-dependent gates (G00.5, Phase 03) can be exercised end-to-end locally.
- New durable Tier C material: the operator init file and Raft snapshots. Losing the unseal key makes the Vault data unrecoverable; F-Ray-grance collection data in PostgreSQL remains recoverable from its own manual backup, and Vault can be re-initialised and reconfigured by Ansible.
- Plain HTTP on the private Podman network in v0.1 (no host exposure beyond loopback). Residual risk accepted for a single-owner Mac; TLS for the listener is a v0.2 hardening item.
- Phase 00 probe finding carried forward: on PostgreSQL 16+, the Vault connection role needs `createrole_self_grant = 'set, inherit'` and revocation must terminate sessions and `DROP ROLE` (not `REASSIGN OWNED`), otherwise revocation silently fails and the credential stays live.

## Reversal criteria

Revisit if the owner later operates a dedicated, backed-up external Vault for personal services: point Vault Agent at it, migrate policies via Ansible, and retire `fray-vault` through a reviewed data-root change.
