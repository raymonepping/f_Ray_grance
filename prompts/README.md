# F-Ray-grance | Build Prompt Suite v1.0

**Purpose:** Use Codex, Claude or IBM Bob to incrementally build F-Ray-grance from the canonical v0.1.6 specification. Each agent has 11 stage-specific, independently executable prompts. A stage can be run by any one agent. Do not run the variants for the same stage three times and do not parallelize stages.

## Quick-launch option
Use one master launcher instead of manually selecting a phase: `prompts/launchers/Codex_START_HERE.md`, `prompts/launchers/Claude_START_HERE.md`, or `prompts/launchers/IBM_Bob_START_HERE.md`. Each selects **one** next eligible phase using the same state and commit gates.

## How to use
1. Extract this archive into your intended **F-Ray-grance Git repository** (copy the contents of the `F-Ray-grance/` folder into the repository root). Confirm `git remote -v` points to YOUR intended GitHub repository; the prompts never guess it or create a repo.
2. Keep the pre-existing v0.1.6 design, operations and product files in place. If files in your repository are more recent, compare and reconcile rather than blindly overwriting them.
3. Ensure `scripts/commit_gh` is executable (`chmod +x scripts/commit_gh`). Review the helper before use: it stages only explicitly supplied paths, commits and pushes to GitHub `origin`, and refuses non-GitHub remotes or staged unrelated files. A native `commit_gh` tool is also supported only if the same safeguards are verified.
4. Pick **one** agent for Phase 00, paste `prompts/<Agent>/00_preflight_and_state.md` into that agent in the correct repository context and let it execute. On completion, verify the `commit_gh` push and `state/BUILD_STATE.json` before running Phase 01.
5. For future phases, use any of the three agents. Because they read the same tracked state, one can resume another's work. If a phase is blocked, resolve the blocker and rerun that same phase, not the next one.

## Phase order
| Phase | Topic | Primary exit criterion |
|---|---|---|
| 00 | Preflight, State Recovery and Foundation Validation | State initialized or resumed |
| 01 | Terraform, Ansible, Podman and Durable Stack Control | Infrastructure works or is clearly blocked, protected data-state boundary exists and no destructive normal Make target is present. |
| 02 | PostgreSQL Schema, Migrations and API Foundations | Schema and API foundations run with synthetic fixtures and pass contract tests |
| 03 | Vault Authentication and PostgreSQL Dynamic Credentials | Vault integration verified without touching other projects, or documented as blocked |
| 04 | Scento-first Search, Resolver and Source-Provenance Enrichment | At least one verified exact fragrance is enriched |
| 05 | Nuxt Design System, Glassmorphism and Application Shell | The navigation shell is a working UI, not a clickable mockup |
| 06 | Personal Collection, Historical Ownership and Samples | Collection and samples are fully functional for synthetic fixtures, with historical accuracy and authorization checks. |
| 07 | Scent DNA Normalization and Two-Fragrance Compare | Two real canonical fragrances compare with clear, source-aware notes and trait bars even if Ollama is offline. |
| 08 | Ollama Embeddings, pgvector and Diversifying Discovery | Discovery queries are explainable, versioned, and do not depend on always-on local AI. |
| 09 | Four Seasonal Preference Profiles, Export and Data Portability | All seasonal profiles and a safe portable export work against synthetic data. |
| 10 | Persistence Restoration, E2E Security and Release Validation | Verified release report and recovery evidence committed, or explicit BLOCKED status with safe environment left intact. |

## Prompt optimization
- Each prompt contains its own safety, state lifecycle, prerequisite gating, implementation scope, acceptance evidence and `commit_gh` invocation. It can be pasted individually.
- Codex prompts emphasize minimal patches and test-driven implementation.
- Claude prompts emphasize architecture invariants, dependency reasoning and bounded delivery.
- IBM Bob prompts emphasize enterprise-grade operational traceability, testing and evidence.
- No prompt assumes it can access a privileged local Vault credential or a running GitHub repo; blockers are explicitly recorded.
- Root v0.1.6 documentation and `PHASE_MANIFEST.md` are the authoritative starting point. The prompts do not silently alter product scope (no daily wear journal, no price engine, exact two-fragrance Compare first).

**Accepted v0.1.6 hardening:** Agents push directly to the verified GitHub `main` through `commit_gh` only, and must not assume branch protection can be bypassed. Tailscale Serve HTTPS is the private entrypoint, with independent owner authentication/authorization. No launchd/cron/scheduled backups; only manual `make backup`, independent copy, `make restore-test` and truthful last-manual-backup status. [`PHASE_MANIFEST.md`](../spec/PHASE_MANIFEST.md) is the authoritative phase sequence.

## Mandatory commitment to data durability
- PostgreSQL 18 + pgvector stores authoritative personal data.
- `infra/terraform/data` persists independently from replaceable `infra/terraform/app`.
- `stop`, `down`, normal `destroy` and rebuilds must not delete the collection.
- Backups outside the Podman VM and independently protected off-device copies plus restore drill precede real personal-data import.
- Commit only sanitized code, reports and tracked orchestration state. Never commit actual backups or secret material.

## Important `commit_gh` behavior
`./scripts/commit_gh --message "fray: 00 preflight" --paths state/BUILD_STATE.json reports/00_preflight.md` is an example. Use actual changed files, avoid directories with unrelated modifications, and inspect all staged changes. The helper uses the existing authenticated GitHub `origin`; it does **not** create a repo, resolve merge conflicts or bypass branch protections. `--retry-push` is for a committed-but-not-pushed local HEAD. Where branch protection forbids direct pushes to `main`, leave the phase blocked until the operator adjusts the policy or explicitly chooses a compliant workflow. Never circumvent protection.

## Deferred future drafts

The Claude and Codex `11_scent_academy_and_tutor.md` files are preserved future drafts, hash-verified alongside the accepted documentation. They are explicitly registered in `scripts/prompt_catalog.py`; unknown additional phase files still fail validation. They do not extend the accepted Phase 00–10 sequence or the build-state schema. The referenced `SCENT_ACADEMY_SPEC.md` and Phase 11 addendum are not yet present. Accept that specification and update the phase/state/validation contracts before executing Phase 11, after Phase 10 genuinely completes. Tailscale remains deferred by the operator under ADR-009.
