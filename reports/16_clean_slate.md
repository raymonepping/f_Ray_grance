# Phase 16: Clean slate

Prompt FRAY-CLAUDE-16 ([prompt](../prompts/Claude/16_clean_slate.md), [ADR-017](../docs/adr/ADR-017-clean-slate.md)). Agent Claude (claude-opus-5-5). Date 2026-10-27. Prerequisite verified: Phase 15 completed and pushed (`04607a9`). Registered and checkpointed `in_progress` in `d59c196`.

## State

- During this phase a second agent edited the contract files to complete Phase 10 for its local scope, without taking the single-writer lock. Its decision was also numbered ADR-017, which collided with the clean-slate ADR-017 already on `origin/main`.
- At the operator's instruction both were integrated:
  - that decision became [ADR-018](../docs/adr/ADR-018-phase10-local-scope-completion.md), renumbered only in the lines that agent added;
  - Phase 16's own "Phase 10 stays blocked" wording was reconciled with it;
  - the Phase 10 closeout was recorded in [its report](10_release_gate.md) and the build state.
- Phase 10 is now `completed` with `acceptance_scope: local_scope_with_operator_deferrals`. Its three deferred gates are kept under `deferred_gates`, unverified.
- `last_successful_phase` is the highest contiguous completed phase: 16 with this commit.

## Implemented

- **`scripts/clean-slate.sh`** and **`make clean-slate`**.
  - It classifies all 24 tables in schema `app`.
    - **Kept:** `owners`, `owner_credentials`, `schema_migrations`, `academy_lessons` (seeded by migration 0004).
    - **Emptied:** the other 20, in foreign-key order. That is every owner's personal data plus the whole catalogue: fragrances, brands, variants, source records and claims, fragrance notes, `note_dictionary` (filled by enrichment, not seeded), trait scores and embeddings.
  - It refuses before any change if the tables in the database differ from the classification.
  - It prints all row counts and requires the typed phrase `CLEAN SLATE`.
  - It takes a fresh `make backup` first and aborts if that fails.
  - One transaction, then verification: emptied tables are 0, kept tables unchanged, history trigger re-enabled. Otherwise it reports `CLEAN_SLATE_INCOMPLETE`.
- **Deviation from `make purge`, on purpose.** Instead of `session_replication_role = replica`, which also switches off foreign-key enforcement, the transaction disables only `collection_events_append_only` and re-enables it before `COMMIT`. A wrong deletion order would fail rather than leave orphans.
- **Images.** Records go; files become unreferenced and are collected by a `make backup` taken an hour or more later (ADR-016).
- **Browser suite on an empty catalogue.** Global setup records the catalogue (`clean-slate.sh --mark`) and enriches both identities the specs use (Phantom in Red, Layton) through the normal exact-identity endpoint. Before, only Layton was enriched and Phantom in Red was assumed to exist. Global teardown removes the catalogue rows the run added and nothing references (`--undo`). Every spec takes only those two names from the catalogue; the Boss Bottled Elixir test enriches through the UI itself.
- Runbook section, CHANGELOG entry, Makefile help.

## Validation

| Check | Result |
|---|---|
| `bash scripts/probes/p16_clean_slate.sh` | **11/11 PASS** (cases below) |
| `make test-e2e` (full, with the new setup and teardown) | **56/56 PASS**; teardown `CATALOGUE_UNDO fragrances_removed=0` |
| Live catalogue before and after the suite | Same 9 fragrance IDs, brands, source records, note dictionary and owners. One new active provider claim (`signature_materials` for Phantom in Red): a genuine Scento observation from setup's enrichment of an existing identity, the same refresh Layton always had. On an empty catalogue such rows are added and removed. |
| `make test`, `make validate-docs` | PASS (see final run) |
| `make health` | PASS |

The 11 probe checks:
- the probe ran on an isolated, network-less restore of a private copy of the latest real backup, which had 18 non-empty tables plus synthetic removal-log and image rows;
- a wrong phrase is refused and nothing changes;
- an unclassified table is refused before any change;
- refusals take no backup;
- a run gives `CLEAN_SLATE_OK`, with a complete backup first;
- only the 4 kept tables still have rows;
- account and password-hash rows are unchanged;
- the history trigger is re-enabled;
- undo removes only the unreferenced rows added after the mark (fragrance, claim, record, note, brand) and keeps the pre-mark fragrance and the one in a collection;
- undo without a mark refuses;
- the live DB, the live image volume and the real backup directory are unchanged.

## Not done, on purpose

- The clean slate was **not** run against the live database. The operator runs `make clean-slate` and types `CLEAN SLATE`. It takes a backup first; undo is a restore from that backup (`docs/recovery.md`).

## Limitations

- If the owner enriches a fragrance in Discover while the browser suite is running, and does not add it to the collection, teardown can remove it as a run-added row.
- Image files stay on the volume until a `make backup` taken more than an hour after the clean slate.
