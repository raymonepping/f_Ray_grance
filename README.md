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
| [`docs/adr/`](docs/adr) | Accepted ADR-001 through ADR-020, including project Vault, direct-main commits, manual backups, the operator’s Tailscale deferral and the accepted add-on phases 11–16 and Phase 10's local-scope completion |

## Locked decisions

- **Database:** PostgreSQL 18 + pgvector. Digest-pinned pgvector 0.8.7 on ARM64, verified during implementation.
- **Frontend:** Nuxt 4 + Vue 3 + TypeScript, Tailwind CSS v4, mobile-first responsive app. No native iOS developer account required.
- **Services:** Node.js 24 LTS / Fastify; local Ollama embeddings; Scento-first read-only enrichment.
- **Security:** local Mac loopback access with independent owner login and route authorization; project-owned HashiCorp Vault with scoped dynamic PostgreSQL credentials via Vault Agent. Remote Tailscale access is deferred by the operator under ADR-009.
- **Operations:** Terraform provisions, Ansible configures, Make controls, Podman runs; no dual resource ownership. **Manual** backup/restore checks only; no backup scheduler.
- **UX:** "Scent Spectrometer" console (ADR-012 superseded the original navy/gold glass), collapsible left sidebar, sticky header, normal-flow footer and accessible mobile bottom bar/drawer.
- **Main workflows:** Collection, Discover, **Compare (2 in v0.1)**, My DNA by season. 4-up comparison reserved for v0.2.
- **Data:** collection history is authoritative and durable; model outputs may be regenerated; no blind reseeding, no default destructive command. `commit_gh` pushes **only `main`** and Git is not a collection backup.

## Current implementation and release status

Phases 00–09 are implemented and pushed to the verified GitHub `main`. The app runs locally at `http://localhost:8470` with owner authentication, exact-identity enrichment, collection/history, two-fragrance Compare, local discovery, four-season preferences and private JSON export/import preview. Phase 09 passed the complete quality gate and 28 browser tests. Evidence and revision-specific results are in [build state](state/BUILD_STATE.json) and [phase reports](reports).

Phase 10 is completed for the accepted **local scope with operator deferrals** under [ADR-018](docs/adr/ADR-018-phase10-local-scope-completion.md). Local security, persistence and recovery have recorded passing evidence, including Phase 15's complete-set recovery revisions. Tailscale/iPhone access, a protected off-device copy and recovery on a second machine remain deferred and unverified; they no longer block phase completion. Real-data import remains disabled. Existing real backups remain legacy sets until the next manually requested complete-set backup. No independent disaster-recovery or remote-access success is claimed.

The v0.1.6 specification plus accepted addenda remains the baseline. Phases 11–16 are completed: Academy/Spectrometer, images, Spectrum, grouped navigation, the evidence-backed revisions (ADR-016) and `make clean-slate` (ADR-017). The contiguous successful-phase marker advances through the highest completed and pushed phase; the historical blocked Phase 10 decision is superseded, not relabelled as an external test success.

## Operating the stack

See the operator runbook [`docs/runbook.md`](docs/runbook.md) for first-time setup (`make up`, `make vault-init`, `make vault-bootstrap`, `make owner-create`), day-to-day commands and `make heal` after Mac sleep. Build progress per phase is in [`reports/`](reports) and [`CHANGELOG.md`](CHANGELOG.md).

## Resuming development

Read the [phase manifest](spec/PHASE_MANIFEST.md), [state contract](prompts/STATE_CONTRACT.md), build state and latest phase report before work. Use the matching [agent launcher](prompts/launchers/Codex_START_HERE.md), keep one writer, and resume the current incomplete phase. Run `make validate-docs`, `make doctor` and the relevant quality gates. Commit through `./scripts/commit_gh` to the verified origin/main. Do not declare a release complete until the actual recovery/security gates have passed.

See [manual recovery and reviewed upgrades](docs/recovery.md) and [seasonal portability](docs/portability.md) for current operational boundaries.
