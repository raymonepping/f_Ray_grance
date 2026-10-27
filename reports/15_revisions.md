# Phase 15: Evidence-backed revisions

Prompt FRAY-CLAUDE-15 ([prompt](../prompts/Claude/15_revisions.md), [ADR-016](../docs/adr/ADR-016-phase15-revisions.md)), prepared by Codex from the [independent review of prompts 01–14](review_01_14.md). Agent Claude (claude-opus-5-5). Date 2026-10-26. Baseline `2a45407` on `origin/main` (review commit on top of the reviewed `08ee536`). Phase 10 stays **blocked**; `last_successful_phase` stays 09.

## State

- `origin` verified as `github.com/raymonepping/f_Ray_grance`, branch `main`, in sync before work.
- The single-writer lock `state/.run.lock` was taken by atomic mkdir.
- Phase 15 was registered before any application change (R5) and checkpointed `in_progress` in commit `f6ea036`.
- The pre-existing untracked Codex copies of prompts 13 and 14 were preserved and registered, not deleted or ignored.
- Unrelated agent directories and `article/` were left untouched and unstaged.

## Conclusions

- **Local implementation: completed.** R1–R7 are fixed and verified (table below).
- **Release: still blocked.** B1, independent off-device recovery, is deferred by the operator (2026-10-27). Import stays disabled and Tailscale stays deferred (ADR-009).

| Finding | Disposition | Verification |
|---|---|---|
| R1 restore receipt | **Fixed, verified** | One receipt per attempt, written after every stage; `PASS` only when all stages pass. Failures record the stage. Off-device records and status bind the whole recovery set. Probe: 7 failure cases leave FAIL receipts and never PASS. Status ignores receipts from before ADR-016. |
| R2 DB + image consistency | **Fixed, verified** | The app never deletes files. `make backup` collects unreferenced files older than the grace period, under its lock and before the snapshot, then verifies every referenced original (checksum) and derivative (complete WebP) before publishing. Restore extracts into a fresh isolated volume, then checks checksums, decodes with `sharp` and checks owner scoping. Probe results below. |
| R3 legacy backups | **Fixed, verified** | The isolated target is brought forward with checked-in migrations after a ledger checksum check. Newer builds are refused before any side effect, with the matching `app_git_revision`. Schema 3, 4, 5 and 7 fixtures pass. A private copy of the real schema-3 archive `fray-20261025T095344Z.dump` now passes. Future schema, dump corruption and ledger mismatch are refused. |
| R4 exact identity | **Fixed, verified** | `checkExactIdentity` (`apps/api/src/domain/exact-identity.ts`) is used by research page selection, finding validation, web image search and barcode name labels. The agent's `exact_match` is required but not sufficient. 6 new regression tests. |
| R5 docs/prompts/state | **Fixed, verified** | Codex 13/14 registered; Claude 15 registered; validators derive counts (42 stage prompts + 3 launchers); README, phase manifest, state contract, prompts README and Claude launcher updated. An unregistered prompt still fails both validators. |
| R6 Spectrum stale scope | **Fixed, verified** | Request generation plus abort; data and errors apply only to the current scope; loading never shows the previous scope's counts. 3 browser regressions. |
| R7 Spectrum presentation | **Fixed, verified** | Ticks are links outside the `aria-hidden` decoration. Fragrances within one 24 px target are grouped in a disclosure list (pointer, touch, keyboard, Escape returns focus). "· based on one fragrance" appears when one is placed. 4 browser regressions at 1440 and 320 px, both themes, axe and no overflow. |
| B1 independent recovery | **Deferred by operator (2026-10-27)** | The operator decided an off-device copy is not important enough for this personal project. Nothing was attested; Phase 10 stays blocked. |

## What changed

**R4 (identity).** A page title or product name matches only if nothing is left after removing:
- the target's exact name (required, as a contiguous phrase);
- the house and its aliases;
- concentration wording that does not contradict the known concentration;
- sizes;
- a short list of packaging words.

"Elixir" is removed only when it is the known concentration, or when it is part of the name (Boss Bottled Elixir). Titles are judged per segment, so a store suffix after `|` or ` - ` does not count.

This is deliberately conservative. "Hugo Boss Boss Bottled Elixir Parfum Intense" is rejected because of "Intense". Research may therefore find fewer pages; uncertain pages are shown as rejected with the reason.

**Real data check (read-only).** The only research claims in the live database are the four rows of the Sauvage "Eau de Parfum" value, already superseded on 2026-10-26. No active research claim and no stored image is affected, so nothing needs owner review.

**R2 (images).**
- `DELETE /images/:id` removes the record only.
- Re-storing identical bytes refreshes the file time.
- `make purge` and the synthetic-owner purge no longer delete files. Before, they could delete a content-addressed file that another owner still used.
- `make backup` collects unreferenced files instead. The grace period is `FRAY_IMAGE_GC_GRACE_MIN`, default 60.
- The snapshot records its references in the manifest (`image_refs`). `scripts/backup_images.py seal` verifies the archive and binds dump, archive and sidecar checksums as `recovery_set`. If anything is missing, the backup ends `BACKUP_FAIL` and nothing is published.

**R1/R3 (restore).** `scripts/restore-test.sh` runs these stages:

1. checksums (every file the set names);
2. compatibility;
3. restore;
4. fingerprints (on the backup's own schema);
5. upgrade (`scripts/restore_upgrade.py`, mirrors `migrate.ts`, never the live DB);
6. smoke;
7. images (safe members, archive vs references, fresh volume as the API user with 750/640, checksum and decode, `restore_images_scope.sql`).

The receipt is version 2, file `restore-tests/<ts>-<pid>.json`. `make restore` keeps both the quarantine container and its image volume.

## Validation

| Check | Result |
|---|---|
| `make validate-docs` | PASS: 81 frozen docs, 45 prompts, 281 links |
| Negative registry check (temporary `prompts/Codex/15_revisions.md`) | Both validators FAIL as intended; file removed |
| `make test` | PASS (docs, shell, Python, Terraform fmt/validate, Ansible, secrets, gitleaks, typecheck, API 210/210 and web 35/35 on disposable PG18) |
| `bash scripts/probes/p15_recovery_matrix.sh` | **18/18 PASS** (cases below) |
| Real schema-3 archive (private copy, isolated) | PASS: tables match, `UPGRADED from=3 to=7`, smoke PASS, receipt `complete_set: false` (legacy) |
| `make test-e2e` (full) | **56/56 PASS**: 49 existing plus 7 Spectrum revisions |
| Spectrum suites after the final web rebuild | 10/10 PASS |
| `impeccable detect --json app` | `[]` (one off-ramp `10px` I introduced was moved to `11px`) |
| `make images`, `make recreate SERVICE=api` and `SERVICE=web`, `make heal`, `make health` | PASS |
| `make drift` | NO_DRIFT data and app |

The 18 recovery-matrix cases:
- schema 3, 4, 5 (with images) and 7 (with images) restore and PASS;
- future schema 99 refused at compatibility;
- corrupted dump fails at checksums;
- corrupted image tar fails at checksums;
- missing sidecar fails at checksums;
- a sealed tar missing an original, and one missing a derivative, fail at images;
- a ledger checksum mismatch fails at upgrade;
- a file removed between snapshot and archive gives `BACKUP_FAIL` and nothing is published;
- a delete plus refresh during the backup still restores both captured references;
- the collector removes only aged unreferenced files and keeps a young one;
- status: complete set, independent restore not recorded;
- no PASS receipt contains a failed stage;
- the live DB, the live image volume and the real backup directory are unchanged (fingerprinted before and after).

## Recovery and privacy

- All recovery tests used synthetic fixtures, or a private copy of one retained archive, in `$TMPDIR`. Targets were `--network none` containers and volumes, removed afterwards.
- No receipt was written to the real backup directory. No real record was deleted, overwritten or migrated. No paid or live TinyFish call was made.
- The browser regressions use intercepted synthetic Spectrum responses with real catalogue IDs. To keep the sign-in rate limit intact, they sign in once per file.

## Limitations

- Your existing backups are legacy sets (taken before ADR-016). `make backup-status` labels the newest one as such and counts none of the earlier receipts. The next manual `make backup` produces a complete set.
- The collector has a theoretical race: a byte-identical re-upload of a file deleted more than an hour earlier, landing during the collector's single `find` pass. In that case the backup's own verification still refuses to publish an incomplete set.
- Decoding restored images needs the API image (`make images`) on the recovery machine.
- R4 favours precision over recall: legitimate pages with extra marketing words are rejected and shown with the reason.

## Remaining operator item

**B1, deferred by the operator on 2026-10-27.** If it is ever picked up again: provide a protected off-device destination and a separate Mac or VM, then:

1. `make backup`;
2. copy the four files of the set;
3. `make backup-record-copy`;
4. on the separate environment, `make restore-test` with `FRAY_RESTORE_ENV_LABEL` and `FRAY_RESTORE_INDEPENDENT=YES`.

Until then Phase 10 stays blocked and import stays disabled.
