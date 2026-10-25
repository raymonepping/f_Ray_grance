# F-Ray-grance | v0.1.6 authoritative documentation bundle

**Updated:** 2026-10-24 | **Stage:** Complete implementation *specification*, NOT a deployed application

> **Don't just track your fragrances. Understand your rotation.**

F-Ray-grance is a personal, self-hosted fragrance-intelligence PWA: organize present/past/sampled fragrances, automatically enrich exact perfume identities, visualize source-backed Fragrance DNA, compare two scents, and capture seasonal preferences without requiring a wearing diary.

## Source-of-truth document map

All authoritative specification documents live in [`spec/`](spec); `spec/MANIFEST.json` hash-locks them together with `prompts/` and `docs/adr/` (`make validate-docs`). Where a prompt or spec says `PHASE_MANIFEST.md`, `DESIGN.md`, etc., read `spec/<name>`.

| Document | Authority |
|---|---|
| [`PRODUCT_SPEC.md`](spec/PRODUCT_SPEC.md) | Product vision, constraints, v0.1 release scope and acceptance priorities |
| [`DESIGN.md`](spec/DESIGN.md) | Visual language, accessible glassmorphism, left sidebar, sticky header, footer, mobile shell and UI components |
| [`COMPARE_SPEC.md`](spec/COMPARE_SPEC.md) | Normative two-fragrance compare behavior, scent pyramid, trait bars, sources, UX and API |
| [`ARCHITECTURE.md`](spec/ARCHITECTURE.md) | Service topology, Terraform/Ansible/Podman/Make ownership, tech stack and security boundaries |
| [`DATA_MODEL.md`](spec/DATA_MODEL.md) | Canonical identity, GTIN variants, schema, historic collection state and embedding integrity |
| [`DATA_SOURCES.md`](spec/DATA_SOURCES.md) | Scento API usage and exact-match enrichment contract, attribution and fallback |
| [`SECURITY.md`](spec/SECURITY.md) | Vault integration, database credential lifecycle, auth, external-source threat model |
| [`DATA_PERSISTENCE.md`](spec/DATA_PERSISTENCE.md) | Durable data boundaries, off-VM/off-device backups, disaster recovery and restoration |
| [`OPERATIONS.md`](spec/OPERATIONS.md) | Make commands, Terraform/Ansible responsibilities, Podman runtime and day-two operations |
| [`QUALITY.md`](spec/QUALITY.md) | Unit, integration, E2E, accessibility, durability and release evidence gates |
| [`PHASE_00.md`](spec/PHASE_00.md) | Phase 00 environment validation |
| [`PHASE_MANIFEST.md`](spec/PHASE_MANIFEST.md) | **Authoritative 00–10 sequence** for all agents and release stages |
| [`RELEASE_NOTES.md`](RELEASE_NOTES.md) | v0.1.6 accepted changes, verification limits and start guide |
| [`docs/adr/`](docs/adr) | Accepted ADR-001 through ADR-007, including private Tailscale access, direct-main commits and manual backups |

## Locked decisions

- **Database:** PostgreSQL 18 + pgvector. Target pgvector 0.8.7, with tested image/digest selection pending Phase 00.
- **Frontend:** Nuxt 4 + Vue 3 + TypeScript, Tailwind CSS v4, mobile-first responsive app. No native iOS developer account required.
- **Services:** Node.js 24 LTS / Fastify; local Ollama embeddings; Scento-first read-only enrichment.
- **Security:** private Tailscale Serve HTTPS on iPhone/Mac, explicit tailnet grants, independent owner login and route authZ; externally deployed HashiCorp Vault with scoped dynamic PostgreSQL credentials via Vault Agent where validated.
- **Operations:** Terraform provisions, Ansible configures, Make controls, Podman runs; no dual resource ownership. **Manual** backup/restore checks only; no backup scheduler.
- **UX:** Dark-navy / warm-gold premium glass shell, collapsible left sidebar, sticky header, normal-flow footer and accessible mobile bottom bar/drawer.
- **Main workflows:** Collection, Discover, **Compare (2 in v0.1)**, My DNA by season. 4-up comparison reserved for v0.2.
- **Data:** collection history is authoritative and durable; model outputs may be regenerated; no blind reseeding, no default destructive command. `commit_gh` pushes **only `main`** and Git is not a collection backup.

## Current verified and unverified facts

**Verified via official documentation:** PostgreSQL 18 supports logical dumps; pgvector supports cosine distance and exact/approximate search; Vault supports PostgreSQL dynamic credentials and Vault Agent auto-auth; Scento exposes a keyless read-only API with restrictions against wholesale catalog replication; the PostgreSQL 18 official container changes volume path to `/var/lib/postgresql`.

**Require local validation:** Terraform Docker-provider ↔ Podman socket compatibility; pgvector 0.8.7 ARM64 image/build selection; Nuxt/Node package lock; actual Vault reachability/auth; barcode resolver availability; Scento exact record coverage; operator-selected backup/off-device destination and restore testing; Tailscale HTTPS/private grants and iPhone access; iPhone Safari/PWA behavior.

## Operating scaffold status

The bundled `Makefile`, `scripts/doctor.sh` and `infra/terraform/phase00` are **incomplete Phase 00 starting code**, not tested production provisioning. `make up`, `make backup`, `make restore`, and application infrastructure cannot be considered operational until implemented and verified. Deliberately unavailable targets fail closed. Do not import irreplaceable personal data yet.

## Version freeze and runtime status

**v0.1.6 is a documentation/agent-prompt baseline**, not an installed service or proof of remote access, live authentication, backup recovery or GitHub push. Only Phase 00 execution can establish runtime evidence. All direct-to-main agent commits require a separately configured and verified GitHub `origin` pointing to the intended F-Ray-grance repository.

## Starting workflow

1. Read `RELEASE_NOTES.md`, `PHASE_MANIFEST.md`, `PRODUCT_SPEC.md`, `DESIGN.md`, `COMPARE_SPEC.md` and `ARCHITECTURE.md`.
2. Run `make validate-docs`, `make help` and then `make doctor` once installed tools are present; examine outputs manually.
3. Execute `PHASE_00.md`, record evidence and confirm critical durability/security gates.
4. Implement first vertical slice: search exact Phantom In Red → verify → enrich → save → DNA → add to collection → compare against a second verified fragrance.
5. Do not declare v0.1 done before `QUALITY.md` acceptance and a successful off-VM restore drill.
