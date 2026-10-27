# ADR-017: Accept Phase 16 (clean slate)

Status: Accepted by explicit operator instruction, 2026-10-27.

`make purge` empties an owner's personal data but keeps the shared fragrance catalogue. The operator asked for a way to remove all recorded information and really start from scratch (prompt `16_clean_slate.md`).

## Decision

- Phase 16 is accepted for Claude on the same local-development terms as ADR-010 to ADR-016. Phase 10 stays blocked, and `last_successful_phase` keeps its meaning.
- `make clean-slate` empties every application table except the owner accounts (`owners`), their passwords (`owner_credentials`), the migration ledger (`schema_migrations`) and the migration-seeded lesson list (`academy_lessons`). Personal data of every owner and the whole shared catalogue go: fragrances, brands, variants, source observations and claims, notes, the note dictionary, trait scores and embeddings.
- Every table in schema `app` must be classified as kept or emptied in the script. An unclassified table makes the command refuse, so a new migration cannot be skipped or emptied silently.
- Same guard rails as `make purge`: a printed summary, the typed phrase `CLEAN SLATE`, and a fresh `make backup` first. The command aborts if the backup fails. Everything runs in one transaction. This is the documented, owner-requested exception to the append-only history (DATA_PERSISTENCE: an explicit, previewed, user-authorized deletion).
- Image files are not deleted by the command. They become unreferenced and are collected by the next `make backup` (ADR-016).
- The browser suite records the catalogue before a run and removes, afterwards, only the catalogue rows it added that nothing references. A clean slate therefore stays clean after `make test-e2e`.
