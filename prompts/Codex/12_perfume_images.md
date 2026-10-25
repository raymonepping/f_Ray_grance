# F-Ray-grance | Codex | Phase 12 | Perfume Images

**Prompt ID:** FRAY-CODEX-12
**Version:** 1.0 · 2026-10-25  
**Prerequisites:** phase 11 complete and pushed, all prior gates valid  
**Project baseline:** F-Ray-grance v0.1.7 plus `PERFUME_IMAGE_SPEC.md`

## Agent assignment
You are Codex acting as implementation-focused full-stack engineer. First inspect the current repository structure and tests, then implement the minimum coherent set of backend, storage, API and UI changes needed for perfume images. Prioritize typed contracts, incremental changes and passing validations.

## Outcome
Build a safe, source-attributed perfume image subsystem so the app can display bottle images for owned fragrances and variants across collection, detail, compare and Academy surfaces. This is an implementation phase, not a design-only exercise. Do not reopen earlier approved phases except for minimal integration changes required by Phase 12.

## Accepted deployment policy
- Operate only on verified GitHub `origin/main` and commit **only** via `./scripts/commit_gh`.
- Preserve Tailscale Serve HTTPS, owner AuthN/AuthZ, Vault boundaries and private network exposure.
- Backups are manual only. Data volumes are independent of disposable application resources; image binaries must live outside Git and outside disposable containers.
- Read `PHASE_MANIFEST.md`, `prompts/STATE_CONTRACT.md` and `PERFUME_IMAGE_SPEC.md` before implementation; **Phase 12 starts only after Phase 11 has been genuinely completed and pushed**.

## Mandatory execution and state contract (complete in every prompt)
1. **Locate repo and authorities.** Work ONLY within the git repository whose `origin` is explicitly configured for F-Ray-grance. Confirm current branch is `main`, display detected owner/repo, and read relevant authoritative docs before implementation.
2. **State detection and recovery.** Check whether `state/BUILD_STATE.json` exists. If it exists: parse and validate it, read prior phase results and verify the previous commits exist locally and are pushed. If it does not: initialize atomically from `prompts/STATE_CONTRACT.md` without inventing completed phases.
3. **Prerequisite gate and single writer.** Verify Phase 11 is completed and its recorded commit exists locally and is pushed to `origin/main`. Acquire exclusive local lock via atomic `mkdir state/.run.lock`. Respect user changes and do not overwrite them.
4. **Checkpoint before execution.** Mark Phase 12 `in_progress` atomically with timestamp, agent identity, initial HEAD and planned scope.
5. **Execute only this phase.** Implement only the tasks below. Use smallest safe changes. Never invent test results, provider capabilities or license/terms assurances. No destructive operations.
6. **Validate and record.** Run relevant tests and create `reports/12_perfume_images.md` with exact commands, observed PASS/FAIL/BLOCKED, changed-file inventory, evidence and residual risks. Update `state/BUILD_STATE.json` atomically.
7. **Mandatory GitHub commit via `commit_gh`.** Use `./scripts/commit_gh --message "fray: 12 perfume images" --paths <explicit-file-paths...>` to commit only phase-owned changes, the report and the state file to verified `origin/main`. If validation fails, commit only sanitized report + blocked state, not broken application code. If the commit exists locally but the push failed, retry with `./scripts/commit_gh --retry-push` before continuing.
8. **Finish safely.** Release the lock, summarize files/validation/commit/blockers and do not duplicate work if already completed.

**Security and persistence invariants:** PostgreSQL + pgvector remains authoritative for metadata; image binaries are never committed to Git; a persistent asset directory/volume is not itself a backup; manual off-VM backup/restore procedures remain required before real collection history is trusted; Terraform provisions, Ansible configures, Podman runs, Make orchestrates. No public internet exposure beyond Tailscale Serve. One-user-first application. No catalog mirroring or arbitrary scraping.


## Phase 12 implementation instructions

### 12.0 Read and reconcile existing project state
1. Inspect existing fragrance, variant, collection, compare and Academy surfaces to identify where images should render without creating duplicate card components or disconnected asset stores.
2. Read `PERFUME_IMAGE_SPEC.md`, `DATA_MODEL.md`, `DATA_PERSISTENCE.md`, `DATA_SOURCES.md`, `DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`, `QUALITY.md` and `PHASE_MANIFEST.md`. Treat them as authoritative unless a newer accepted ADR exists.
3. Re-check current Scento API/docs and any already-approved image source notes at execution time. If Scento does **not** document image URLs, do not invent them. You may support Scento page-derived extraction only if implemented as a bounded, terms-aware adapter with safe fallbacks and explicit reporting.

### 12.1 Image sourcing architecture
- Reuse the Phase 04 provider adapter pattern. Implement an **image source chain** rather than one-off logic.
- Source precedence must be: owner upload -> approved remote provider -> Scento-derived candidate if supported -> manual external URL.
- Introduce a typed server-side image adapter interface. It should return normalized metadata plus a downloadable binary stream or validated remote reference.
- Do not implement arbitrary web search or crawler behavior. Only allow configured/approved domains.
- Preserve attribution and verification metadata for every image asset.

### 12.2 Persistence and file handling
- Add additive PostgreSQL migrations for image metadata and primary-image selection.
- Store binary files in a persistent assets directory/volume outside Git and outside disposable app containers. Metadata stays in PostgreSQL.
- Generate a bounded optimized derivative for UI use, but keep source integrity/verification data.
- Do not store large binaries in PostgreSQL unless there is an existing accepted project pattern explicitly doing so.
- Update backup/restore documentation and operator checks so image metadata and persistent asset storage are included in manual recovery procedures.

### 12.3 Secure ingestion and validation
- Remote fetch must be server-side only with SSRF protections, domain allowlist, size limits, MIME sniffing, file signature checks and timeout handling.
- Reject HTML or redirects to unapproved domains.
- Deduplicate by checksum where practical.
- Never overwrite an owner-selected primary image without explicit user action.
- Mark failed imports with a durable status and clear admin diagnostics.

### 12.4 Application UX integration
- Add a consistent fragrance image component with placeholder, lazy loading and stable aspect ratio.
- Render images in at least: collection cards, fragrance detail, Compare cards/selectors and Academy references where a fragrance appears.
- Add owner actions to upload image, attach remote approved image, set primary, remove image and inspect attribution.
- Design for missing-image resilience: no broken layouts, no dead image icons.
- Keep visual behavior consistent with DESIGN.md and current glassmorphism rules.

### 12.5 Validation and release evidence
- Unit tests for metadata normalization, source precedence, checksum dedupe and primary-image logic.
- Integration tests for upload, remote fetch success/failure, primary selection, authorization, delete flow and persistence.
- E2E tests for collection/detail/compare rendering with and without images on desktop and mobile.
- Verify no image binaries are committed to Git and that remote fetch does not accept disallowed origins.
- Record exact observed image source behavior, including whether Scento provided a usable image path or required fallback handling.

### Required validation evidence
- A fragrance can display a verified primary image from at least one approved source.
- Owner-uploaded image can override another source and remain primary.
- Missing or invalid remote image degrades gracefully and records a failed status.
- Compare and Academy surfaces render correctly with and without fragrance images.
- Manual backup/restore documentation explicitly includes image asset storage.
- No unrestricted crawling, no binaries in Git, no broken authorization.

### Required deliverables
- `PERFUME_IMAGE_SPEC.md` kept current
- additive API/backend/frontend changes in the repository's existing layout
- additive migrations and tests
- `reports/12_perfume_images.md`
- `state/BUILD_STATE.json` updated atomically
- successful `./scripts/commit_gh --message "fray: 12 perfume images" --paths <explicit-phase-owned-paths...>` or an honest BLOCKED report/state

### Exit gate
A usable owner-authenticated perfume image subsystem exists with source attribution, persistent storage and responsive rendering across the app, while preserving safety, provenance and backup boundaries.

### Final answer format
`State`, `Implemented`, `Image source verification`, `Validation (PASS/FAIL/BLOCKED)`, `Security & persistence`, `commit_gh (verified remote/main/SHA or blocked)`, `Open issues`, `Next phase / handoff`.
