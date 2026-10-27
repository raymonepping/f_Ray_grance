# F-Ray-grance | Agent State Contract

This contract accompanies every self-contained build prompt. Each prompt embeds a complete workflow; do not rely on reading this file alone to satisfy the state/commit requirements.

## Canonical tracked file
`state/BUILD_STATE.json` is tracked in Git and is the single source of truth for orchestration across Codex, Claude and IBM Bob. Do NOT store passwords, Vault tokens, connection URIs, actual personal fragrance notes, or raw command output in this file.

Recommended initial JSON (illustrative only; the agent must first check if state exists):

```json
{
  "schema_version": 1,
  "project": "F-Ray-grance",
  "repository": {
    "origin": "<detected-and-verified-GitHub-origin>",
    "branch": "main"
  },
  "last_successful_phase": null,
  "phases": {},
  "accepted_adrs": ["ADR-001", "ADR-002", "ADR-003", "ADR-004", "ADR-005", "ADR-006", "ADR-007"],
  "unresolved_blockers": [],
  "updated_at_utc": null
}
```

For each `phases["NN"]` store `status` (`in_progress`/`completed`/`blocked`/`failed`), `agent`, `prompt_id`, `started_at_utc`, `finished_at_utc`, `baseline_head`, `report_path`, `tests`, `artifacts`, `notes`, `blockers`. The phase's successful Git commit should contain the `completed` state. Derive SHA from git history rather than embedding the commit's own SHA in that same commit. Only treat a predecessor phase as completed after checking it is in the verified pushed history. If a previous attempt ended after a local commit but before push, use `./scripts/commit_gh --retry-push` and verify GitHub before continuing.

Atomic updates: write a temporary JSON beside the state, syntax-validate, fsync if possible, rename. Acquire atomic `mkdir state/.run.lock` before state mutation. A stale lock is a blocker until operator-safe recovery is documented. Do not have parallel writers. `.gitignore` must ignore lock folders and temporary files, but NOT `state/BUILD_STATE.json`.

On failure, record `blocked` or `failed`, emit redacted report, and commit only state and report if safely possible. If GitHub is unavailable, leave an explicit local pending-commit state and do not report remote success.

## Branch and validation semantics

- **Only GitHub `origin/main` is permitted**, verified with the operator before state changes. Refuse non-`main` branches or guessed repositories. Never automate branch switches, merges or force-pushes.
- The recorded phase `completed` status is **local acceptance**, subject to the commit actually being present in pushed main history. Record CI status as `not_configured`, `not_checked`, `pending`, `passed` or `failed` only when observed; do not equate push success with CI success. No PR is required.
- If a blocked or failed phase has not pushed, stay on the same phase and preserve existing personal data. Never invent successful test results or force-advance for convenience.
- Git holds state and code only; **manual** backups are stored outside Git/Podman VM and restore tested independently.

## Advancement contract
Phases 00 → 01 → ... → 10 run in order. Multiple agents may work on different phases across time, but only one agent may modify the repository at once. A successor must read and validate the predecessor's state, commit and gate evidence. Any accepted ADR that changes behavior must be documented and committed before implementation continues.

## Phase 11 local-development exception

ADR-010 accepts Phase 11 and explicit operator-authorized local development while Phase 10 recovery remains blocked. Record that authorization and actual local results in phase 11. Keep Phase 10 and its blockers unchanged. `last_successful_phase` is the highest contiguous completed phase, so it remains 09 until Phase 10 genuinely completes. Codex/Claude Phase 11 prompts are accepted; IBM Bob's suite remains 00–10.

## Phase 12 local-development exception

ADR-011 accepts Phase 12 (perfume images) on the same terms as Phase 11: it requires Phase 11 completed and pushed, records its own local results under phase 12, and leaves Phase 10, its blockers and `last_successful_phase` unchanged. Codex/Claude Phase 12 prompts are accepted; IBM Bob's suite remains 00–10.

## Phase 13 local-development exception

ADR-014 accepts Phase 13 (My Spectrum) for Claude on the same terms. It requires Phase 12 completed and pushed, and records its own local results under phase 13. It leaves Phase 10, its blockers and `last_successful_phase` unchanged.

## Phase 14 local-development exception

ADR-015 accepts Phase 14 (sidebar order and dividers) for Claude on the same terms. It requires Phase 13 completed and pushed, and leaves Phase 10 and `last_successful_phase` unchanged.

## Phase 15 local-development exception

ADR-016 accepts Phase 15 (evidence-backed revisions from `reports/review_01_14.md`) for Claude on the same terms. It requires Phase 14 completed and pushed, and records its own local results under phase 15. It leaves Phase 10, its blockers and `last_successful_phase` unchanged. Codex prompts 13 and 14 are accepted alternatives to the Claude prompts.

## Phase 16 local-development exception

ADR-017 accepts Phase 16 (clean slate) for Claude on the same terms. It requires Phase 15 completed and pushed, and records its own local results under phase 16. Phase 10's status follows ADR-018 (completed for local scope, with operator deferrals). The agent never runs the clean slate against the live database; the operator does.

## Superseding Phase 10 local completion — ADR-018

The operator explicitly revised Phase 10 acceptance on 2026-10-27. ADR-018 overrides earlier “Phase 10 stays blocked / marker stays 09” clauses above: local security, lifecycle and isolated recovery are the required scope; remote access, off-device protection and a second-machine restore remain recorded operator deferrals, not passed checks or blockers to this scope. Mark Phase 10 completed once its local gates are evidenced and allow the highest contiguous completed/pushed phase to advance (15, then 16 once Phase 16 is pushed). Preserve historical results and deferral reasons. Do not re-request the deferred work or enable real-data import. See `docs/adr/ADR-018-phase10-local-scope-completion.md`.
