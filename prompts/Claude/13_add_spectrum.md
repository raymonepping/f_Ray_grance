# F-Ray-grance | Claude | Phase 13 | My Spectrum

**Prompt ID:** FRAY-CLAUDE-13
**Version:** 1.0 · 2026-10-26
**Prerequisites:** phase 12 complete and pushed, all prior gates valid
**Project baseline:** F-Ray-grance v0.1.7 plus `SPECTRUM_SPEC.md` (ADR-014)

## Agent assignment
You are Claude, acting as principal full-stack engineer and UX integrator. Add a "My Spectrum" view that shows where the owner's collection sits on a few scent spectrums, based only on fragrances they own. Keep it truthful, explainable and consistent with the existing trait method and design system.

## Outcome
An owner-authenticated, read-only spectrum view. It has two bipolar axes (Fresh ↔ Warm, Dry ↔ Sweet), a trait readout and a family breakdown, computed from owned (optionally sampled) fragrances, with coverage and method shown. This is an implementation phase. Do not reopen earlier phases except for minimal integration changes.

## Accepted deployment policy
- Operate only on verified GitHub `origin/main` and commit **only** via `./scripts/commit_gh`.
- Preserve Tailscale Serve HTTPS, owner AuthN/AuthZ, Vault boundaries and private network exposure.
- Backups are manual only. No schema change is expected; if one becomes necessary, it must be additive, and a manual backup must be taken first.
- Read `PHASE_MANIFEST.md`, `prompts/STATE_CONTRACT.md` and `SPECTRUM_SPEC.md` before implementation. **Phase 13 starts only after Phase 12 has been genuinely completed and pushed.**

## Mandatory execution and state contract (complete in every prompt)
1. **Locate repo and authorities.** Work ONLY within the git repository whose `origin` is explicitly configured for F-Ray-grance. Confirm the current branch is `main`, display the detected owner/repo, and read the relevant authoritative docs before implementation.
2. **State detection and recovery.** Check whether `state/BUILD_STATE.json` exists. If it exists: parse and validate it, read prior phase results, and verify that the previous commits exist locally and are pushed. If it does not: initialize it atomically from `prompts/STATE_CONTRACT.md` without inventing completed phases.
3. **Prerequisite gate and single writer.** Verify Phase 12 is completed and its recorded commit exists locally and is pushed to `origin/main`. Acquire an exclusive local lock via atomic `mkdir state/.run.lock`. Respect user changes and do not overwrite them.
4. **Checkpoint before execution.** Mark Phase 13 `in_progress` atomically with a timestamp, agent identity, initial HEAD and planned scope.
5. **Execute only this phase.** Implement only the tasks below, with the smallest safe changes. Never invent test results or data. No destructive operations.
6. **Validate and record.** Run the relevant tests and create `reports/13_spectrum.md` with exact commands, observed PASS/FAIL/BLOCKED, the changed-file inventory, evidence and residual risks. Update `state/BUILD_STATE.json` atomically (`completed`, or `blocked`/`failed` with the reason).
7. **Mandatory GitHub commit via `commit_gh`.** Use `./scripts/commit_gh --message "fray: 13 add spectrum" --paths <explicit-file-paths...>` to commit only phase-owned changes, the report and the state file to verified `origin/main`. If validation fails, commit only the sanitized report and blocked state, not broken application code. If the commit exists locally but the push failed, retry with `./scripts/commit_gh --retry-push` before continuing.
8. **Finish safely.** Release the lock, summarize files, validation, the commit and any blockers, and do not duplicate work that is already completed.

**Security and persistence invariants:** PostgreSQL remains authoritative; the spectrum is computed on read and is never stored; one-user-first; no new external calls; owner data never leaves the Mac. No public internet exposure beyond Tailscale Serve.

## Phase 13 implementation instructions

### 13.0 Read and reconcile
Read `SPECTRUM_SPEC.md`, `trait-method.md`, the existing trait derivation (fragrance DNA), the collection states and `apps/web/DESIGN.md`. Reuse the existing trait method and effective-profile precedence. Do not create a second trait vocabulary.

### 13.1 Computation (API, pure and tested)
- Pure domain function: in-scope fragrances (id, brand, name, 11 indicative traits with `null` = unknown, effective family) → axes, trait readout, families and coverage, exactly as `SPECTRUM_SPEC.md` defines.
- Scope: `owned` (default) or `owned_and_samples`. Never wishlist, rejected or previously owned. Ratings are never used.
- A fragrance is placed on an axis only when both poles have a known trait. Otherwise it is "not placed".
- Endpoint `GET /api/v1/profile/spectrum?scope=…`, owner-scoped, read-only, with method version and limitation text.

### 13.2 Experience (web)
- "My Spectrum" page in the secondary navigation, plus a link from My DNA.
- It shows the two axes with one tick per fragrance (each linking to its detail), the collection marker, the spread band and coverage, along with the 11-trait readout, the family breakdown, the scope switch, and the method and limitation.
- Empty state when nothing is owned. It must be readable without colour, follow the `DESIGN.md` rules, be WCAG 2.2 AA in both themes, keyboard-accessible and reflow at 320 px.

### 13.3 Validation
- Unit tests: pole means over known traits only; placement rule; collection mean and spread; trait means with `known/total`; family counts including "not listed"; scope filtering; ratings ignored.
- Integration tests: owner scoping (another owner's collection never counts), the scope parameter, and the empty collection.
- E2E: empty state; populated spectrum on desktop and mobile, axe-clean in both themes with no page overflow; ticks link to fragrance detail.

### Required validation evidence
- `make test`, `make validate-docs`, `make test-e2e` and `make health` PASS. The impeccable detector is clean.
- A populated spectrum is observed in the browser for synthetic owned fragrances, with coverage stated.
- Unknown traits are never shown as zero, and the view never claims preference.

### Required deliverables
- `SPECTRUM_SPEC.md` kept current
- the API endpoint, domain function, web page and navigation, and tests
- `reports/13_spectrum.md`
- `state/BUILD_STATE.json` updated atomically
- a successful `./scripts/commit_gh --message "fray: 13 add spectrum" --paths <explicit-phase-owned-paths...>`, or an honest BLOCKED report and state

### Exit gate
The owner can see where their owned collection sits on the defined spectrums, with method, coverage and limits stated, without any invented data or preference claims.

### Final answer format
`State`, `Implemented`, `Validation (PASS/FAIL/BLOCKED)`, `Truth & limits`, `commit_gh (verified remote/main/SHA or blocked)`, `Open issues`, `Next phase / handoff`.
