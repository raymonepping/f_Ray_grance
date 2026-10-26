# F-Ray-grance | Claude | Phase 14 | Sidebar order and dividers

**Prompt ID:** FRAY-CLAUDE-14
**Version:** 1.0 · 2026-10-26
**Prerequisites:** phase 13 complete and pushed, all prior gates valid
**Project baseline:** F-Ray-grance v0.1.7 plus ADR-015

## Agent assignment
You are Claude, acting as UX integrator and front-end engineer. Reorder the navigation into purpose groups with dividers, as ADR-015 defines, on every navigation surface, without changing routes or behaviour.

## Outcome
The sidebar (expanded and rail), mobile drawer and mobile bottom navigation render from one grouped navigation source:
- Collection · Samples
- Discover · Compare
- My DNA · My Spectrum
- Academy
- Settings in the bottom utility area

Groups are separated by dividers and carry accessible names. This is an implementation phase; do not reopen earlier phases.

## Accepted deployment policy
- Operate only on verified GitHub `origin/main` and commit **only** via `./scripts/commit_gh`.
- Preserve Tailscale Serve HTTPS, owner AuthN/AuthZ, Vault boundaries and private network exposure.
- Backups are manual only. No schema or data change is expected.
- Read `PHASE_MANIFEST.md`, `prompts/STATE_CONTRACT.md`, `docs/adr/ADR-015-sidebar-order.md`, `spec/DESIGN.md` (IA) and `apps/web/DESIGN.md` (visual rules) before implementation. **Phase 14 starts only after Phase 13 has been genuinely completed and pushed.**

## Mandatory execution and state contract (complete in every prompt)
1. **Locate repo and authorities.** Work ONLY within the git repository whose `origin` is explicitly configured for F-Ray-grance. Confirm the current branch is `main` and display the detected owner/repo.
2. **State detection and recovery.** Check whether `state/BUILD_STATE.json` exists. If it exists: parse and validate it, and verify that the previous phase commits exist locally and are pushed. If it does not: initialize it atomically from `prompts/STATE_CONTRACT.md` without inventing completed phases.
3. **Prerequisite gate and single writer.** Verify Phase 13 is completed and its commit is on `origin/main`. Acquire an exclusive local lock via atomic `mkdir state/.run.lock`. Respect user changes.
4. **Checkpoint before execution.** Mark Phase 14 `in_progress` atomically with a timestamp, agent identity, initial HEAD and planned scope.
5. **Execute only this phase.** Smallest safe changes. Never invent test results. No destructive operations.
6. **Validate and record.** Run the relevant tests and create `reports/14_reorder_sidebar.md` with commands, PASS/FAIL/BLOCKED, the changed-file inventory and evidence. Update `state/BUILD_STATE.json` atomically (`completed`, or `blocked`/`failed` with the reason).
7. **Mandatory GitHub commit via `commit_gh`.** Use `./scripts/commit_gh --message "fray: 14 reorder sidebar" --paths <explicit-file-paths...>`. If validation fails, commit only the sanitized report and blocked state. If the commit exists locally but the push failed, retry with `./scripts/commit_gh --retry-push` before continuing.
8. **Finish safely.** Release the lock and summarize.

## Phase 14 implementation instructions
- Extend the single navigation source with ordered groups (`collection`, `explore`, `profile`, `learn`, `utility`), with accessible names and no visible eyebrow labels.
- Sidebar: groups separated by hairline dividers in both expanded and rail modes. Settings and the connection status sit in the bottom utility area. Active-state treatment is unchanged.
- Mobile drawer: the same groups and dividers. Mobile bottom navigation: unchanged (Collection, Discover, Compare, My DNA).
- Keyboard order follows the visual order. Each group is a labelled list; dividers are decorative.

### Required validation evidence
- Unit test: the navigation source has the agreed order and groups, primary routes stay in spec order, and every item is in exactly one group.
- E2E: sidebar groups and order at desktop, the rail at tablet width, and drawer groups on mobile, axe-clean in both themes with no overflow. Existing shell tests still pass.
- `make test`, `make validate-docs`, `make test-e2e` and `make health` PASS. The impeccable detector is clean.

### Required deliverables
- the grouped navigation source and the updated sidebar, rail and drawer
- tests
- `reports/14_reorder_sidebar.md`
- `state/BUILD_STATE.json` updated atomically
- a successful `./scripts/commit_gh --message "fray: 14 reorder sidebar" --paths <explicit-phase-owned-paths...>`, or an honest BLOCKED report

### Exit gate
Navigation is grouped logically with dividers on every surface, renders from one source, and is accessible.

### Final answer format
`State`, `Implemented`, `Validation (PASS/FAIL/BLOCKED)`, `commit_gh (verified remote/main/SHA or blocked)`, `Open issues`.
