# F-Ray-grance | Claude | Phase 16 | Clean slate

**Prompt ID:** FRAY-CLAUDE-16
**Version:** 1.0 · 2026-10-27
**Prerequisites:** phase 15 complete and pushed, all prior gates valid
**Project baseline:** F-Ray-grance v0.1.7 plus ADR-017

## Agent assignment
You are Claude, acting as data-lifecycle and operations engineer. Add an operator command that empties **everything recorded** in the database, so the owner can start from scratch: all personal data of every owner **and** the shared fragrance catalogue. This is the operator request of 2026-10-27, accepted as ADR-017.

## Outcome
`make clean-slate` empties every application table except four:
- owner accounts (`owners`) and their passwords (`owner_credentials`);
- the migration ledger (`schema_migrations`);
- the reference lesson list seeded by migration 0004 (`academy_lessons`).

Afterwards the owner signs in with the same password to an empty app: no collection, history, seasons, Academy progress, practice, images, removal log, sessions or login counters, and no fragrances, brands, variants, source observations, claims, notes, note dictionary, trait scores or embeddings.

The schema, Vault, Terraform/Podman resources and the image volume itself are untouched. Image **files** become unreferenced and are collected by the next `make backup` (ADR-016). The existing `make purge` (personal data of one or all owners, catalogue kept) stays as it is. This is an implementation phase; do not reopen earlier phases.

## Accepted deployment policy
- Operate only on verified GitHub `origin/main` and commit **only** via `./scripts/commit_gh`.
- Preserve Tailscale Serve HTTPS (deferred by the operator, ADR-009), owner AuthN/AuthZ, Vault boundaries and private network exposure.
- Backups are manual only. The command itself takes a fresh `make backup` first and aborts if that fails; no scheduler.
- Read `PHASE_MANIFEST.md`, `prompts/STATE_CONTRACT.md`, `docs/adr/ADR-017-clean-slate.md`, `spec/DATA_PERSISTENCE.md`, `docs/runbook.md` (`make purge`) and `scripts/purge-owner-data.sh` before implementation. **Phase 16 starts only after Phase 15 has been genuinely completed and pushed.**

## Mandatory execution and state contract (complete in every prompt)
1. **Locate repo and authorities.** Work ONLY within the git repository whose `origin` is explicitly configured for F-Ray-grance. Confirm the current branch is `main` and display the detected owner/repo.
2. **State detection and recovery.** Check whether `state/BUILD_STATE.json` exists. If it exists: parse and validate it, and verify that the previous phase commits exist locally and are pushed. If it does not: initialize it atomically from `prompts/STATE_CONTRACT.md` without inventing completed phases.
3. **Prerequisite gate and single writer.** Verify Phase 15 is completed and its commit is on `origin/main`. Acquire an exclusive local lock via atomic `mkdir state/.run.lock`. Respect user changes.
4. **Checkpoint before execution.** Register Phase 16 in the accepted phase/prompt/state contracts, then mark it `in_progress` atomically with a timestamp, agent identity, initial HEAD and planned scope.
5. **Execute only this phase.** Smallest safe changes. Never invent test results. **Do not run the clean slate against the live database**: the operator runs `make clean-slate` and types the confirmation. All validation uses isolated, network-less copies or synthetic fixtures.
6. **Validate and record.** Run the relevant tests and create `reports/16_clean_slate.md` with commands, PASS/FAIL/BLOCKED, the changed-file inventory and evidence. Update `state/BUILD_STATE.json` atomically (`completed`, or `blocked`/`failed` with the reason). Phase 10's status follows ADR-018; `last_successful_phase` is the highest contiguous completed and pushed phase.
7. **Mandatory GitHub commit via `commit_gh`.** Use `./scripts/commit_gh --message "fray: 16 clean slate" --paths <explicit-file-paths...>`. If validation fails, commit only the sanitized report and blocked state. If the commit exists locally but the push failed, retry with `./scripts/commit_gh --retry-push` before continuing.
8. **Finish safely.** Release the lock and summarize.

## Phase 16 implementation instructions
- **Explicit classification.** The script names every application table as either *kept* or *emptied*. Before anything else it compares that list with the tables that actually exist in schema `app`, and refuses if a table is unclassified, so a future migration can never be skipped silently or emptied by accident.
- **Safety, like `make purge`.** Print the row count of every table that will be emptied and of every kept table. Require typing `CLEAN SLATE` (`CONFIRM=` for scripted drills, still matched). Take a fresh `make backup` first and abort with nothing emptied if it fails.
- **One transaction.** Delete children before parents in foreign-key order. Suspend the append-only history triggers for that transaction only (`SET LOCAL session_replication_role = replica`, as `make purge` does). Afterwards verify that every emptied table has 0 rows and every kept table has its previous count; otherwise report `CLEAN_SLATE_INCOMPLETE` and exit non-zero.
- **Browser suite stays clean.** Today the E2E suite relies on catalogue rows that happen to exist (Phantom in Red) and leaves the identities it enriches behind. After a clean slate it would fail, and every run would refill the catalogue. Make global setup record the catalogue before the run and enrich every identity the suite needs through the normal exact-identity path. Make global teardown remove exactly the catalogue rows the run added, only when nothing else references them.
- Make target `clean-slate`, runbook section, CHANGELOG entry.

### Required validation evidence
- On an isolated, network-less restore of a private copy of the latest real backup (removed afterwards):
  - a wrong confirmation phrase empties nothing;
  - an unclassified table makes the command refuse before any change;
  - a successful run leaves every emptied table at 0 and every kept table unchanged;
  - the owner can still authenticate (credential row intact);
  - a backup was taken first.
- Test-catalogue undo: rows added after the mark and unreferenced are removed; rows referenced by an owner's collection, and rows that existed before the mark, are kept.
- The live database, live image volume and real backup directory are fingerprinted before and after, and are unchanged.
- `make test`, `make validate-docs`, the full `make test-e2e` (which must leave the catalogue as it found it) and `make health` PASS.

### Required deliverables
- `scripts/clean-slate.sh`, the `make clean-slate` target and the E2E setup/teardown changes
- a reproducible probe
- `reports/16_clean_slate.md`
- `state/BUILD_STATE.json` updated atomically
- a successful `./scripts/commit_gh --message "fray: 16 clean slate" --paths <explicit-phase-owned-paths...>`, or an honest BLOCKED report

### Exit gate
The operator can empty everything recorded with one guarded command, keeping only the account, the schema and the reference content. Every table is classified, and the test suite no longer leaves catalogue data behind.

### Final answer format
`State`, `Implemented`, `Validation (PASS/FAIL/BLOCKED)`, `commit_gh (verified remote/main/SHA or blocked)`, `Open issues`.
