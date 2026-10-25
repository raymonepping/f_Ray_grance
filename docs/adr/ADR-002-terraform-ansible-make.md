# ADR-002: Terraform + Ansible + Make + Podman

**Status:** Accepted architectural intent; Podman API provider compatibility remains a Phase 00 gate  
**Date:** 2026-10-24

## Context
Previous projects benefited from an ergonomic Makefile and strict split between provisioning and configuration. F-Ray-grance targets a local macOS/Apple Silicon Podman environment and already has an independently operated HashiCorp Vault cluster.

## Decision
- **Terraform:** provider-backed provisioning and deletion of *F-Ray-grance-owned* containers, networks and volumes, subject to proving `kreuzwerker/docker` compatibility with Podman. Isolate state to this project. Terraform must not bootstrap sensitive application credentials in variables or state.
- **Ansible:** idempotent service configuration, PostgreSQL schema and pgvector, Vault policies/database roles, settings and readiness validations. Do not manage Terraform-owned container resources.
- **Make:** thin, discoverable single-point orchestration with `doctor`, `plan`, `provision`, `configure`, `up`, `stop`, `start`, `status`, `logs`, `health`, `backup` and guarded `destroy`.
- **Podman:** canonical local container runtime; Docker-compatible socket requires explicit verification.

## Guardrails
No Docker Compose or Podman Compose for resources owned by Terraform. No secret value in Terraform state, Ansible output, Make arguments, files committed to Git, or browser bundles. No accidental deletion of PostgreSQL volumes, other containers or the separately operated Vault cluster. Local machine provisioning occurs as an explicit host preflight, not falsely claimed as Terraform-managed.

## Validation
Disposable network/volume/container smoke test using `infra/terraform/phase00`, then verify Terraform plan stability, apply/destroy, and inspect on Podman directly. If this gate fails, propose an explicit ADR revision before writing live infrastructure.

## Alternative considered
Use Podman Compose directly for all containers. Rejected for current intent because the user explicitly prefers Terraform provision lifecycle and this would weaken the agreed tool-responsibility boundary.

## References
- https://registry.terraform.io/providers/kreuzwerker/docker/latest/docs
- https://podman-desktop.io/docs/migrating-from-docker/managing-docker-compatibility
- https://docs.ansible.com/projects/ansible/latest/collections/containers/podman/
