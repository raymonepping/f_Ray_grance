# ADR-016: Accept Phase 15 (evidence-backed revisions)

Status: Accepted by explicit operator instruction, 2026-10-26.

An independent Codex review of prompts 01–14 ([review](../../reports/review_01_14.md)) reproduced seven defects (R1–R7) that the passing regression suites did not catch. Codex prepared the revision prompt. The operator asked Claude to execute it.

## Decision

- Phase 15 is accepted for Claude (`prompts/Claude/15_revisions.md`) on the same local-development terms as ADR-010 to ADR-015. Phase 10 stays blocked, import stays disabled, Tailscale stays deferred (ADR-009) and `last_successful_phase` keeps its meaning.
- The Codex copies of prompts 13 and 14, which the operator created, are registered as accepted alternatives. Their content matches the Claude prompts except for the agent identity. IBM Bob stays on 00–10.
- **Backup consistency (R2).** Image files are content-addressed and are only ever added by the running app. Deleting an image removes its database row and keeps the files. Unreferenced files are collected by `make backup` itself, while it holds `.backup.lock` and before it takes the database snapshot, and only once they are older than a grace period, so an upload in flight is never collected. Between the snapshot and the image archive, files can therefore only be added. The archive is a true superset of what the snapshot references, and `make backup` verifies that before it publishes the manifest.
- **Complete recovery set (R1).** One restore receipt covers the database and the image archive together. It is written once, after every stage has run, with `result: PASS` only when all stages pass. Off-device copy records and independent-restore claims are bound to the checksums of every file in the set.
- **Older backups (R3).** A backup at an older schema is restored into the isolated target and then brought forward with the checked-in forward migrations (ledger checksums verified first), before the current smoke test. The live database and the backup files are never changed.
- **Exact identity for web research and image lookup (R4).** A page or product name matches only if, once the brand, the target name, concentration wording, size and packaging words are removed, nothing is left. Any extra word marks a different product (a flanker or a variant). The agent's `exact_match` flag is necessary but never sufficient.
