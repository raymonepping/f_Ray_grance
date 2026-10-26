# F-Ray-grance | Claude Prompt 15 | Evidence-backed revisions

**Prompt ID:** FRAY-CLAUDE-15  
**Prepared:** 2026-10-26  
**Status:** Accepted for Claude under [ADR-016](../../docs/adr/ADR-016-phase15-revisions.md) and the [phase manifest](../../spec/PHASE_MANIFEST.md) Phase 15 addendum (PHASE_MANIFEST.md). Prepared by Codex; this file does not by itself mean Phase 15 has run.  
**Prerequisites:** Read the [independent review](../../reports/review_01_14.md), current state and accepted ADRs; verify the actual repository HEAD and origin before acting. Review baseline: `08ee5364c49f121128e708d4af48657f3ea1d5cf` on `origin/main`.

## Assignment and outcome

Act as the implementation engineer for the existing F-Ray-grance app. Resolve R1–R7 below in small, independently testable changes. Reuse existing Fastify/Nuxt/Podman/Terraform/Ansible patterns. Preserve implemented phases 01–14 and personal data. This is a revision pass, not a redesign, new model rollout or repeated implementation of earlier phases.

The review observed **49/49 browser tests PASS**, API/web tests and typechecks PASS, health PASS and both Terraform roots NO_DRIFT. `make test` nevertheless **FAILS overall** because of documentation registration. Targeted negative tests independently reproduced failures that passing happy-path tests miss. Use the review's concrete evidence, not a blanket assumption that prior completion markers prove current correctness.

## Mandatory state, authorization and delivery contract

1. Confirm the configured GitHub `origin` is the intended F-Ray-grance repository, current branch is `main`, and prior work is pushed. Do not guess/create remotes, switch branches, force push or bypass protections.
2. **Check whether** `state/BUILD_STATE.json` exists. **If it exists**, validate and preserve phases, review records and blockers. **If it does not**, initialize atomically from `prompts/STATE_CONTRACT.md` without fabricating prior results.
3. Acquire `state/.run.lock` by atomic mkdir. Diagnose stale/live locks safely; preserve unrelated work. No parallel repository writers. Keep the single writer contract.
4. Before changing application behavior, reconcile and explicitly register this implementation phase in the accepted phase/state/prompt contracts; the review did not silently register it. Record Phase 15 `in_progress`, UTC time, actual baseline SHA and planned R1–R7 scope. Commit accepted execution-contract changes through `commit_gh` if the existing contract requires them before implementation.
5. Preserve the user-created, currently untracked Codex prompt copies and unrelated agent/article files. Review ownership before staging. Apply only deliberate documentation decisions under R5; do not suppress a validation gate to obtain green output.
6. Keep local development and release acceptance separate: Phase 10 remains `blocked` until B1 is actually verified, import remains disabled, Tailscale Serve HTTPS remains deferred by the operator under ADR-009. Do not enable Funnel, change enterprise DNS/VPN policy, expose services, auto-download a tutor model or invent operator attestations. `last_successful_phase` stays the highest contiguous completed phase.
7. Update state atomically (temporary file, validate, fsync, rename), store only sanitized results, and create `reports/15_revisions.md` with each finding's disposition and actual verification. Use `completed` only for verified implementation acceptance, otherwise `blocked`/`failed` with the exact remaining condition. Distinguish completed local fixes from a blocked full release.
8. Commit and push only explicit reviewed paths through `./scripts/commit_gh --message "fray: 15 revisions" --paths <files...>`. Never use raw git commit/push or broad staging. If already committed but not pushed, use `./scripts/commit_gh --retry-push`. If implementation checks fail, commit only sanitized report/state; preserve failing code locally for recovery. Report GitHub CI only when observed; release the lock in finally.

Backups are manual only. Terraform provisions, Ansible configures, Podman runs and Make orchestrates. Keep data/asset volumes protected, private owner authorization, CSRF and exact fragrance identity. No real record deletion, overwrite, reseeding, blanket source-claim invalidation or destructive migration is authorized by this revision prompt. Use synthetic fixtures and isolated restore targets.

## R1 — P1: make the entire restore result authoritative

**Files:** `scripts/restore-test.sh`, `scripts/backup_manifest.py`, `scripts/backup-status.sh`, recovery documentation/tests.

The DB comparison currently saves a PASS receipt before images are verified. A corrupt tar or missing referenced image makes the command fail while status can still find that PASS.

- Publish one atomic overall success receipt only after database, extension, schema, asset integrity and required restore/smoke stages succeed. Save a failure outcome for an attempted restore that fails at a later stage; keep distinct component results if useful.
- Bind the receipt to the complete recovery set, including image manifest/archive checksums. Backup-status/off-device attestation must validate all required artifacts for that set, not only the SQL dump. Legacy receipts must not silently certify newly required stores.
- No independent-recovery success may survive failed asset checks. Do not overwrite historical evidence deceptively: preserve or explicitly supersede earlier incomplete receipts.

**Required validation evidence:** corrupt image tar; correctly checksummed tar missing an original or derivative; missing image sidecar; corrupted dump; valid complete set. Every failure returns nonzero, is not reported as a successful complete restore by status, and cannot satisfy independent recovery. A successful complete set yields exactly one coherent success result.

## R2 — P1: consistent database-plus-images recovery

**Files:** `scripts/backup.sh`, `scripts/backup_snapshot.py`, image mutation/store code, `scripts/restore-test.sh`, `scripts/restore.sh`, recovery docs.

“Archive images after the dump, therefore a superset” is invalid when the app deletes files between the database snapshot and tar. Current image checks only inspect archive membership and do not prove a fresh asset store can serve recovered files.

- Choose and document a cross-store consistency protocol: shared locking/maintenance coordination or immutable retention/deferred garbage collection tied to backup lifetime. Cover deletion, refresh and ingestion; do not merely reorder dump/tar operations or add a sleep.
- Verify that every image referenced by the captured database has a matching original and derivative before publishing the completed backup manifest. Validate content/integrity rather than filenames alone.
- Restore the asset archive to a fresh isolated store/volume, with path traversal/link safety and correct permissions. Exercise the recovered metadata and owner-scoped image read path. Keep the authoritative volumes unchanged; remove only synthetic test resources.
- Include DB/asset association and hashes in the complete-set manifest/status/copy procedure. Fail clearly on incomplete sets; document trusted legacy no-image backups.

**Required validation evidence:** deterministic backup during synthetic delete/refresh/upload; valid set always restores all captured references or fails before being advertised complete; bytes/checksums and derivative decoding match in a fresh destination; another owner's image is inaccessible; existing data survives. Include an actual isolated image extraction/read check, not just tar listing.

## R3 — P1: restore retained pre-Academy/pre-image backups safely

**Files:** `scripts/restore-test.sh`, `scripts/sql/restore_smoke.sql`, compatibility metadata/runbooks.

The current preflight accepts schema 1 through latest, then unconditionally accesses schema-4/5 tables. A known valid schema-3 backup fails on `app.academy_progress`. Static references to an absent image table are not made safe by a CASE expression.

- Align preflight and supported recovery paths. Make checks version-aware and/or migrate only a freshly restored isolated target through a documented compatible upgrade path before current smoke tests. Verify the source snapshot before changing it, with separate post-migration checks where appropriate.
- Keep a workable recovery path for retained supported checkpoints; if an archive truly needs its matching application revision, detect and explain that before side effects and provide the exact supported steps. Do not claim a version is supported and fail later on missing tables.
- Never alter checksums of applied migrations or migrate the live database as part of a compatibility test.

**Required validation evidence:** valid schema-3 checkpoint, schema-4 checkpoint, schema-5/image checkpoint, latest schema, unsupported future version and checksum corruption. Supported paths complete; unsupported cases refuse early with a useful route to recovery. No original backup or live data changes.

## R4 — P1: exact identity across research and image lookup

**Files:** `apps/api/src/domain/research.ts`, `apps/api/src/routes/v1/research.ts`, `apps/api/src/images/lookup.ts`, related adapters/UI/tests.

`namesExactly('Dior Sauvage Very Cool Spray', 'Sauvage')` currently returns true, and a fixture with `exact_match: true` generates year/pyramid proposals for target Sauvage EDT. A phrase match plus an agent boolean is not exact identity.

- Pass the complete trusted identity (brand, exact name/flanker, concentration and other known variant qualifiers) through page selection and result validation. Reuse the canonical resolver/normalization vocabulary; do not make a second inconsistent identity system.
- Reject contradictory brand/flanker/concentration/formulation independently of the agent's claim. Be conservative about extra product qualifiers; uncertain evidence remains a labelled review candidate, not verified-target facts.
- Apply the same rule to web image candidates and barcode mismatch labelling. Keep owner-started lookup, explicit acceptance, attribution, bounded budgets and no private fields in external requests.
- Preserve source history. Do not delete or mass-rewrite real existing research claims; identify any impacted real records for owner review separately.

**Required validation evidence:** Sauvage vs Sauvage Very Cool Spray; Sauvage EDT vs EDP/Elixir; same name under different brands; Invictus flankers; Boss Bottled Elixir where “Elixir” belongs to the proper name; exact legitimate target; missing/ambiguous evidence; spoofed `exact_match: true`. Wrong variants cannot become accepted fact proposals or falsely exact images. Existing exact Scento/resolver tests remain green, and no paid/live research calls are necessary for regression fixtures.

## R5 — P2: coherent docs, accepted prompts and state

**Files:** `scripts/prompt_catalog.py`, both validators, `spec/MANIFEST.json`, phase/state/launcher docs, README and deliberately accepted prompt files.

- Resolve the two pre-existing untracked Codex 13/14 copies deliberately. Their content matches Claude's accepted phases apart from the agent identity; preserve them and register/hash/commit accepted copies consistently rather than deleting or ignoring them. Review the operator's actual current files before staging.
- Register Phase 15 only when actually executing it; ensure state validation supports the accepted phase without marking it completed prematurely. Preserve outstanding Phase 10 gates and prior reports.
- Update root README, which incorrectly calls Phase 11 a draft with an absent spec, and align phase summaries/launchers with accepted 11–14 and this revision scope.
- Derive validator prompt totals from the accepted inventory instead of hardcoded old counts. Rehash only reviewed documentation, with every required file present in a clean checkout.

**Required validation evidence:** `make validate-docs` and full `make test` PASS in the working checkout and a clean tracked checkout; unknown/unregistered prompt additions still fail; no user files disappear; no unstaged hook-only edits remain after the final commit. Preserve historical FAIL/BLOCKED evidence accurately.

## R6 — P2: prevent stale Spectrum scope results

**File:** `apps/web/app/pages/spectrum/index.vue`.

- Cancel superseded requests or use a request-generation check. Apply data, errors and loading completion only to the still-current scope. Ensure rapid toggling or a late failure cannot display results from the wrong collection scope.
- Keep failed-request UX truthful and the current selected scope visible; do not hide errors by retaining misleading counts.

**Required validation evidence:** synthetic delayed `owned_and_samples` response followed by a faster `owned` response. The final Owned selection must show the owned-only data; repeat with reversed errors, rapid multiple toggles and navigation/unmount. Existing owner-scoped API/means/null-handling tests remain green.

## R7 — P2: finish the explicit Spectrum presentation requirements

**Files:** `apps/web/app/components/spectrum/SpectrumAxis.vue`, Spectrum page/tests and the accepted Spectrum spec/report.

- Make plotted fragrance ticks identify and open the corresponding detail, with keyboard and touch operation. Keep the sorted text list as the accessible alternative. Do not put focusable controls inside an aria-hidden subtree.
- Handle overlapping/equal-position ticks without making fragrances unreachable; provide a clear disambiguation/list interaction when positions coincide.
- State “based on one fragrance” for a marker with exactly one placed fragrance. Keep zero known coverage and unknown traits honest; retain the method/limitation and ownership-is-not-preference rule.

**Required validation evidence:** one, zero, several and equal-position fixtures; pointer and keyboard navigation to the right detail; 320 px and desktop, dark/light, no overflow and no serious/critical axe violations. Test the plotted interaction itself, not only links in the separate list.

## B1 — Existing operator-dependent release gates

After the engineering fixes, use an operator-approved protected off-device destination and a separate Mac/VM outside the original Podman VM to verify the complete database-plus-image recovery set. Record actual copied hashes, recovered records/assets, environment and results. If destination/access is absent, finish all independent engineering work, record B1 as BLOCKED, and ask only for the specific missing destination/environment. No fabricated attestation, release-ready claim, enabled import or reinstated Tailscale setup.

The tutor's optional model configuration is not a mandatory revision: honest fallback is implemented. Likewise, do not treat approved ADR-012 visual changes or intentional exclusion of image binaries from JSON portability as defects.

## Final acceptance and handoff

Run the relevant regression tests for each finding, then full `make test`, `make validate-docs`, `make health`, `make drift`, and the existing browser suite plus the added regressions. Use synthetic owners and private temporary backups; protect/clean up their assets. Record reproducible negative recovery evidence. Do not repeat destructive lifecycle drills on real personal data or stop unrelated services merely for this prompt.

In `reports/15_revisions.md`, provide a table for R1–R7 and B1: fixed/verified, pending operator, failed, or deliberately deferred with justification. Include commands, observed results, changed files, limitations and pushed revision. Local implementation success and overall release readiness must be separate conclusions. Report concise facts: **State; revisions; validation; recovery/privacy; verified commit_gh origin/main/SHA; remaining operator items.**
