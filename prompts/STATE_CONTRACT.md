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
