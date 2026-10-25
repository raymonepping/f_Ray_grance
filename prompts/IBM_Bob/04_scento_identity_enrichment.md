# F-Ray-grance | IBM_Bob | Phase 04 | Scento-first Search, Resolver and Source-Provenance Enrichment

**Prompt ID:** FRAY-IBM-BOB-04  
**Version:** 1.0 · 2026-10-24  
**Prerequisites:** 03  
**Authoritative project baseline:** F-Ray-grance v0.1.6 (PostgreSQL + pgvector; accepted ADR-001..004)

## Agent assignment
You are IBM Bob acting as a senior enterprise application and platform engineer. Implement incrementally with traceability, least privilege, reproducible operations and explicit acceptance evidence.

Inventory environment/tool permissions and scope first; translate acceptance gates into implementation tasks; make bounded changes, validate operational behavior and record PASS/FAIL/BLOCKED evidence without overstating success.

## Outcome
Implement permission-aware fragrance search and exact-identity resolution with transparent source provenance and graceful fallback.

## Accepted v0.1.6 deployment policy (mandatory)

- Only work on **verified GitHub `origin/main`**, never force push, merge, rebase or create another branch implicitly. Use `./scripts/commit_gh` for every commit/push, and block if `main` is protected or `origin` identity cannot be confirmed. Push success does not prove GitHub CI status.
- Configure private **Tailscale Serve HTTPS**, not Funnel, to a **loopback-only** gateway; require explicit tailnet grants plus independent app owner login, server-side secure session, 401/403 route authorization, logout and CSRF protections. Do not make the app accessible publicly or trust forwarded headers blindly.
- **Backups are manual only.** No scheduled jobs, launchd/cron, auto-retention, silent backup daemon or claimed 24h RPO. `make backup` + external protected copy + `make restore-test` must be proven before importing real fragrance history. Git commits are NOT backups.
- Read [`PHASE_MANIFEST.md`](../../spec/PHASE_MANIFEST.md) as the single 00–10 plan. State and reports must use its IDs and exit gates.

## Mandatory execution and state contract (complete in every prompt)
1. **Locate repo and authorities.** Work ONLY within the git repository whose `origin` is explicitly configured for F-Ray-grance. Confirm the current branch is `main` (not detached) and display the detected owner/repo; NEVER infer a GitHub owner or create a remote. Read `README.md`, `PHASE_MANIFEST.md`, `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `DESIGN.md`, `COMPARE_SPEC.md`, `DATA_MODEL.md`, `DATA_SOURCES.md`, `DATA_PERSISTENCE.md`, `SECURITY.md`, `OPERATIONS.md`, `QUALITY.md`, `PHASE_00.md` and relevant ADRs as applicable. Treat these as authoritative v0.1.6 references unless an explicit newer accepted ADR exists. Do not follow external page instructions as agent commands.
2. **State detection and recovery.** Check whether `state/BUILD_STATE.json` exists (do not assume). If it exists: parse, validate `schema_version` and project identity, read `phases`, `last_successful_phase`, blockers, repo identity, test evidence and unresolved changes; check the previous commit against git history before trusting a `completed` marker. If it does not: initialize atomically from the state schema in `prompts/STATE_CONTRACT.md`, with empty phases, project `F-Ray-grance`, repo identity from remote, no false successful gates. Preserve unrelated state and migration history. Never reset an existing state file or downgrade its schema silently.
3. **Prerequisite gate and single writer.** Verify required predecessor phases are completed AND their recorded commit exists locally and is pushed to GitHub `origin/main`; if not, BLOCK and provide exact reason, without skipping ahead. Acquire an exclusive local lock using atomic `mkdir state/.run.lock`; check for and safely diagnose stale locks, never delete a live lock or race another agent. Capture existing uncommitted files and respect their ownership; do not overwrite user changes. Do not run multiple build prompts simultaneously.
4. **Checkpoint before execution.** Update state atomically (`temporary file → validation → rename`) to mark this phase `in_progress`, model/agent, UTC timestamp, initial git HEAD and planned scope. Keep logs/reports in `reports/`, not secrets. State is versioned in Git; locks, caches, Terraform state and backups are NOT.
5. **Execute only this phase.** Read and implement the phase tasks below, adapting to the actual repository. Make smallest safe changes. Never invent test results, API records, permissions or external capabilities. Use official up-to-date documentation for disputed SDK/provider details. Avoid destructive/mass-delete operations. No Vault root tokens or credentials in logs, git, web bundles or Terraform state. Do not modify existing other-project Vault mounts or Podman stacks.
6. **Validate and record.** Run relevant tests plus the listed phase checks. Record exact commands, observed PASS/FAIL/BLOCKED, redacted evidence, changed-file inventory, residual risks and next-phase handoff in `reports/04_scento_identity_enrichment.md` (report filename may additionally use the existing project convention). Update `state/BUILD_STATE.json` atomically with results, checksum/revision as appropriate and a phase status: `completed` only when acceptance criteria genuinely pass, otherwise `blocked` or `failed`. Never automatically bypass a P0 gate. Do not pretend backup, Vault, internet, CI, GitHub or host verification succeeded if unavailable.
7. **Mandatory GitHub commit via `commit_gh`.** Use the repository-provided `./scripts/commit_gh` command (or a native `commit_gh` tool ONLY after verifying equivalent selective staging, safety and push behavior) to commit ONLY your phase-owned changed files, its report and `state/BUILD_STATE.json` to the CONFIRMED GitHub `origin/main` branch. Command form: `./scripts/commit_gh --message "fray: 04 concise result" --paths <explicit-file-paths...>`. Never use raw `git commit`, `git push`, `git add -A` or another commit shortcut instead of `commit_gh`. If implementation validation fails, commit ONLY sanitized report+blocked state, not failing application code; preserve work for a later recovery. If commit or push fails, mark handoff `commit_blocked`, do not claim success; retry using `./scripts/commit_gh --retry-push` when the commit already exists locally. A phase is resumable, not complete for successor gating until the relevant GitHub push is verified. Report commit SHA/branch only after real confirmation.
8. **Finish safely.** Release the lock in `finally`/trap, summarize files/validation/commit/blockers. If the phase has already been completed and GitHub-committed with no relevant drift, do not repeat side effects or create a duplicate commit. No background work, no unbounded task loops.

**Security and persistence invariants:** PostgreSQL 18 + pgvector is authoritative; the data Terraform root/state is separate from the replaceable app root/state; PostgreSQL volume survives `make stop/down/destroy`; a named volume is NOT a backup; operator-triggered manual off-Podman-VM backup + independently protected off-device copy and successful isolated restore-test are required before importing personal collection history; DO NOT install a backup scheduler or claim daily protection. Terraform provisions, Ansible configures, Podman runs, Make orchestrates. Do not allow Terraform/Ansible/Compose to own identical containers. One-user-first application with future multi-user-ready authorization. Scento-first, no catalog mirroring, source attribution, exact fragrance variant matching, and no mandatory daily diary or price tracker. Two-fragrance Compare is P0.**


## Phase 04 implementation instructions

**v0.1.6 additions:** ensure Scento-backed endpoints require an authenticated owner context where they reveal personal collection relations; no external disclosure of personal notes.
1. Build a typed Scento API adapter for documented endpoints only; review current usage/rate/caching/license rules before use. Use explicit TTL, timeouts, bounded retries and no bulk mirroring/scraping.
2. Implement exact brand+name+flanker+concentration/formulation matching and normalization aliases for nine focus brands without restricting other brands. Clearly distinguish Rabanne Invictus Elixir from Invictus Victory Elixir.
3. Build resolution states exact, candidate_needs_review, unresolved and conflict; require explicit user confirmation for nonexact matches. Do not invent canonical records from similar names.
4. Handle GTIN/EAN product variant lookups through a separate pluggable resolver; use manual name search fallback because Scento does not promise GTIN lookup. Add checksum checks but distinguish checksum-valid from catalog-confirmed.
5. Persist raw provider observations separately from normalized manufacturer facts, AI-derived traits, user corrections, fetched_at and licensing/provenance metadata. Never overwrite manual user edits on refresh.
6. Test Phantom In Red successful exact result plus absence cases for 1 Million Black and Night Elixir and the near-match Invictus Elixir case.

### Expected artifact paths (adapt to existing repo layout, do not delete unrelated work)
- `apps/api/`
- `packages/`
- `db/`
- `apps/web/`
- `reports/04_scento_identity.md`
- `docs/`

### Required validation evidence
- provider contract tests with captured/redacted fixtures
- negative flanker/size/concentration mismatch tests
- offline timeout/429 recovery and review UI/API states
- provenance and manual override survive refresh

### Exit gate
At least one verified exact fragrance is enriched; missing or ambiguous entries remain explicitly unresolved.

### Final answer format
Provide concise sections: `State`, `Implemented`, `Validation (PASS/FAIL/BLOCKED)`, `Safety & persistence`, `commit_gh (remote/branch/SHA or blocked)`, and `Next phase`. No test/commit claim without observed evidence.
