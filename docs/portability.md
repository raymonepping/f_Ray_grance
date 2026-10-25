# Seasonal choices and portable data

My DNA stores separate spring, summer, autumn and winter choices for notes, families, accords and traits. Love, Neutral, Avoid and Unsure are explicit choices; removing a choice leaves it unrated. Ownership does not imply liking. Fragrance affinities and source editorial suggestions remain distinct. Collection, Compare and Discover accept a seasonal context without altering canonical source facts.

Settings → Export & import downloads a private JSON document with `format: "f-ray-grance"` and `version: 1`. Keep this file protected: it includes personal notes and history. An export is not a PostgreSQL disaster-recovery backup.

## Version 1 records

- `exportedAt`: export timestamp.
- `fragrances`, `variants`: referenced exact canonical identities, brand names, package/barcode records and verification state.
- `sources`, `claims`: referenced source observations, provenance and manual corrections. New manual corrections are attributed internally to their author; actor IDs are omitted from the document. Older unattributed corrections are retained for referenced profiles.
- `entries`, `events`: the current owner's collection entries, ratings, private notes, acquisition dates and complete status transitions. Event UUIDs preserve identity across databases; numeric database sequence IDs are local only.
- `seasons`, `seasonFragrances`: the owner's explicit seasonal choices, legacy note/trait fields and fragrance associations, including origin labels.

Passwords, session records, credentials, owner IDs and generated vectors are excluded. Referenced catalog facts are shared source data; another owner's collection entries, ratings, personal notes and seasonal profiles are excluded.

## Preview and import

Choose a JSON file under 4 MiB and select Preview import. Preview validates the complete versioned schema, unique identities, barcode checksums, provenance, relationships and uninterrupted status histories. It reads the target and rolls back without writing. It reports new/existing entries, history, corrections, seasons, target and conflicts.

Apply requires explicit confirmation and a digest binding the file, signed-in owner and current target records. Changed files or target data require another preview. Apply uses a serializable transaction, adds records through ordinary history triggers and preserves portable event identities. Invalid files or conflicts change nothing. Repeating the same import is idempotent. Existing records are never overwritten; differing canonical IDs, histories, corrections or preferences require manual reconciliation rather than automatic merging.

Production apply is disabled by default (`FRAY_IMPORT_ENABLED` is false). Enable it only after an independently protected off-device backup and a successful restore outside the original Podman VM have been recorded. Export and preview remain available. Synthetic integration tests explicitly enable apply and roundtrip into a separate disposable database; that test is not evidence of independent disaster recovery.
