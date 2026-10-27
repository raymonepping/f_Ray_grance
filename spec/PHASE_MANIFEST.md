# F-Ray-grance | PHASE_MANIFEST.md

**Version:** v0.1.6 | **Status:** Accepted single source of truth for implementation sequencing

This manifest is authoritative for phase IDs, dependencies and required delivery boundaries across `PRODUCT_SPEC.md`, `PHASE_00.md`, `prompts/README.md`, and all Codex / Claude / IBM Bob prompts. Phases are **00 through 10**, executed sequentially, with **one repository writer at a time**. The earlier five-block (00–04) roadmap is superseded and MUST NOT be used as execution state.

| Phase | Focus | Required exit outcome |
|---|---|---|
| 00 | Host and runtime preflight | Versions, Podman socket, Terraform disposable probe, TLS/tailnet and Vault prerequisites documented without falsely claiming running integration |
| 01 | Terraform / Ansible / Podman / Make and persistence boundary | Reproducible resource ownership, separate data/app state, non-destructive lifecycle, operator-invoked backup scaffolding |
| 02 | PostgreSQL / pgvector schema and Node API | Repeatable migrations, authenticated API foundation, synthetic CRUD fixtures |
| 03 | Vault credentials and API authentication/authorization | Least-privilege dynamic PostgreSQL leases, pool rotation, owner login/session/logout, protected API routes |
| 04 | Scento-first search, exact-identity resolution and source provenance | Known exact match and safe unresolved variant; no automatic near-match substitution |
| 05 | Nuxt design system, glassmorphism and responsive app shell | Desktop sidebar / header / footer, mobile nav, protected UI/login states |
| 06 | Collection, historic ownership and testers | Durable owner-scoped CRUD, historical events, permissions enforced |
| 07 | Structured Fragrance DNA and two-way Compare | Sourced pyramids, normalized traits, responsive aligned comparison, deterministic tests |
| 08 | Ollama embeddings and pgvector discovery | Versioned vectors, meaningful comparison metrics, explainable fallback |
| 09 | Seasonal DNA and portability | Four seasons, owned/previously owned differentiation, manual export/import validation |
| 10 | Local security, persistence and isolated recovery (ADR-018) | Passing local gates and recorded operator deferrals; remote access, off-device copy and second-machine recovery are outside scope |

## Rules

- A successor phase requires its predecessor's redacted report, verified status and corresponding pushed `main` commit. A blocked phase does not advance.
- Phase 00 may record a correctly diagnosed and explicit **BLOCKED** gate if a live external environment is unavailable. It MUST NOT fabricate validation to move to Phase 01.
- Network access via **Tailscale Serve, HTTPS and application-level authentication/authorization** is required for remote iPhone use. Existing Vault and Podman resources from unrelated projects are out of scope.
- **Manual-only backups.** Commands and restoration procedures must work before real collection data is imported, but there is no scheduler, daily job, or invented 24-hour recovery point objective.
- `main` is the **only target branch** for `commit_gh`. No automatic force-push, branch switching, merging, rebasing or CI bypass. Git holds code, sanitized state and reports, **never database backups**.
- v0.1 comparison remains exactly **two fragrances**; no price tracker, spray logging, public sign-up, or mandatory daily journal.

See accepted ADR-005, ADR-006 and ADR-007 for decision rationale and reversal criteria.

## Accepted Phase 11 addendum — ADR-010

Phase 11: Scent Academy and optional local tutor, defined in [SCENT_ACADEMY_SPEC.md](SCENT_ACADEMY_SPEC.md). The operator explicitly authorized local development after reviewing Phase 10's outstanding recovery gates. This exception extends the execution plan to 11 for Codex/Claude while preserving Phase 10's blocked release status, import guard and ADR-009 remote-access deferral. Do not interpret development advancement as release acceptance. All other sequencing rules remain unchanged.

## Accepted Phase 12 addendum — ADR-011

Phase 12: source-attributed perfume images, defined in [PERFUME_IMAGE_SPEC.md](PERFUME_IMAGE_SPEC.md), for Codex and Claude, after Phase 11 is completed and pushed. Accepted by explicit operator instruction under [ADR-011](../docs/adr/ADR-011-phase12-perfume-images.md) on the same local-development terms as ADR-010: Phase 10 remains blocked, import remains disabled, remote access remains deferred, and no release acceptance is implied.

## Phase 13 addendum (ADR-014)

**Phase 13: My Spectrum** (Claude). An owner-scoped, read-only view of where the owned collection sits on two scent spectrums (Fresh ↔ Warm, Dry ↔ Sweet), plus a trait readout and a family breakdown, as specified in [SPECTRUM_SPEC.md](SPECTRUM_SPEC.md). Prompt: `prompts/Claude/13_add_spectrum.md`. It requires Phase 12. No schema change.

## Phase 14 addendum (ADR-015)

**Phase 14: Sidebar order and dividers** (Claude). Navigation is grouped by purpose, with dividers on every surface: Collection and Samples; Discover and Compare; My DNA and My Spectrum; Academy; Settings in the utility area. The primary routes and the mobile bottom navigation are unchanged. Prompt: `prompts/Claude/14_reorder_sidebar.md`. It requires Phase 13.

## Phase 15 addendum (ADR-016)

**Phase 15: Evidence-backed revisions** (Claude). Resolves findings R1–R7 of the [independent review](../reports/review_01_14.md): one authoritative restore receipt for the complete database-plus-images set, a consistent database/image backup, restore of older-schema backups, exact identity in web research and image lookup, a coherent prompt registry, and the Spectrum race and presentation items. Prompt: `prompts/Claude/15_revisions.md`. It requires Phase 14. B1 (independent off-device recovery) remains an operator gate; Phase 10 stays blocked. The Codex copies of prompts 13 and 14 are accepted alternatives to the Claude prompts.

## Phase 16 addendum (ADR-017)

**Phase 16: Clean slate** (Claude). `make clean-slate` empties every application table except owner accounts, passwords, the migration ledger and the seeded lesson list, after a printed summary, the typed phrase `CLEAN SLATE` and a fresh backup. Every table must be classified as kept or emptied. The browser suite removes the catalogue rows it adds. Prompt: `prompts/Claude/16_clean_slate.md`. It requires Phase 15.

## Current Phase 10 completion policy — ADR-018 (2026-10-27)

[ADR-018](../docs/adr/ADR-018-phase10-local-scope-completion.md) supersedes earlier instructions in this document and addenda to keep Phase 10 blocked solely for external recovery/access. The operator accepts local-scope completion: verify the local gates, keep G00.10/DR-OFFDEVICE/DR-INDEPENDENT `deferred_by_operator`, and mark Phase 10 completed with `local_scope_with_operator_deferrals`. Deferred checks are not PASS and must not be requested again unless reopened. Real-data import remains disabled. The contiguous successful-phase marker may advance through completed and pushed successors; prior historical blocked evidence remains intact.
