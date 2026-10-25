# Phase 09 — Seasonal choices and portability (BLOCKED)

Prompt FRAY-CODEX-09. Agent Codex. Date 2026-10-25. Predecessor Phase 08 `5fad65fe952f15748ffb4be3c2c6f1ba8240a5d5` was verified on GitHub main before work began.

## Implemented locally, not deployed or accepted

- Expand-only migration 0003: four-dimensional seasonal choices, stable UUID identities for collection events, attribution of new manual corrections to their owner. Existing records and append-only history retained. Import appends through the normal entry/history trigger without disabling protections.
- Owner-scoped four-season API/UI (Love / Neutral / Avoid / Unsure; absence remains Not rated), explicit fragrance affinities, collection context and season-aware collection/Compare/Discover filters. Unsaved seasonal drafts remain in memory while switching seasons; saves require server acknowledgement.
- Versioned JSON export includes canonical identities, package records, permitted source observations/claims, manual corrections, personal entries/notes, complete event history and seasonal choices. Export excludes credentials, sessions, vectors and other-owner annotations.
- Strict validation, read-only import preview, target/file digest, explicit confirmation, serializable additive apply, conflict detection and idempotency. Existing history/preferences/corrections are never overwritten. Production import remains disabled until independent recovery is verified; disposable tests explicitly enable import for synthetic fixtures.
- Independent-database roundtrip tests verify stable IDs, event UUIDs, annotations, manual corrections and seasons. Added browser coverage for four-season saving, downloaded export and read-only preview; browser coverage has not yet run against a deployed Phase 09 build.
- Migration-dependent tests derive the expected schema revision from the migration inventory. TypeBox tuple-inference issues were corrected with explicit enum schemas.

## Observed validation

Latest `make test`: **FAIL overall**, solely on documentation/prompt validation. Workspace typechecks, API/UI unit/integration tests, Terraform/Ansible validation, shell/Python checks and secret checks passed. The disposable PostgreSQL tests include the new independent-database portability roundtrip and invalid/conflicting-file no-mutation checks.

The chained live backup/build/provision/migration/browser steps did **not** run because the quality gate failed first. Live app remains the accepted Phase 08 deployment; no migration 0003 or real import was applied.

## External-change blocker

While Codex held the Phase 09 writer lock, two new untracked files appeared:

- `prompts/Claude/11_scent_academy_and_tutor.md`
- `prompts/Codex/11_scent_academy_and_tutor.md`

`validate_release.py` rejects them as frozen documents missing from `spec/MANIFEST.json`. Existing phase/state/prompt validators still describe 00–10. Phase 11 refers to a Scent Academy addendum/spec that is not currently in the accepted baseline. These files were not created, modified, moved, deleted, staged or committed by Codex.

The operator replied that they will pause the other writer. Resume only after exclusive ownership is confirmed and the draft Phase 11 documents are either safely kept outside the frozen baseline by the operator or deliberately integrated with the relevant specification/phase/state/validator changes. Do not rehash incomplete external scope or hide a failing documentation gate.

## Safe handoff

Per the phase prompt's failure contract, commit only this redacted report and blocked `state/BUILD_STATE.json` through `commit_gh`; preserve all application work locally for resumption. Do not advance `last_successful_phase` beyond 08 or declare Phase 09 complete. Unrelated untracked agent configuration and the new Phase 11 drafts remain untouched.

Tailscale is deferred by explicit operator instruction (ADR-009). Independently protected off-device backup and a restore outside the original Podman VM still need an operator-selected destination/environment for Phase 10. No network-policy workaround, real personal-data onboarding, destructive operation or broad staging occurred.
