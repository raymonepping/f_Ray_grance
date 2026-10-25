# F-Ray-grance | DATA_PERSISTENCE.md

**Version:** v0.1.6  
**Status:** Accepted durability policy; implementation and restore tests pending  
**Last updated:** 2026-10-24  
**Related:** `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `OPERATIONS.md`, `DESIGN.md`

> **The application is replaceable. The collection is not.**

## 1. Durability guarantees and failure model

The collection must endure ordinary container lifecycle actions, source rebuilds, application version upgrades, Mac/Podman restarts, and re-provisioning of *stateless* application resources. The loss of an entire Podman machine, disk, or Mac is handled through **recoverable backup**, not by claiming a local volume survives machine deletion.

| Event | Expected result | Required mechanism |
|---|---|---|
| `make stop`, `start`, `restart`, `down` | Existing collection and history unchanged | Persistent database volume, never deleted by lifecycle commands |
| Application container rebuild/replacement | Existing collection unchanged | DB persisted independently from the API/frontend image |
| `make up` or idempotent reconfigure | No duplicate seed, no destructive migrations | Readiness/metadata checks, versioned migrations |
| PostgreSQL image/extension upgrade | Data retained on supported migration path | Pinned versions, preflight, backup, documented migration and rollback |
| Terraform app-infra destroy | No automatic destruction of data state/volume | Separate state/ownership, explicit guarded actions |
| Podman VM replacement, local storage corruption | Restore available; possible data loss since last backup | Off-VM backups + validated restore |
| Host loss or ransomware | Recover from separately protected copy | Encrypted off-device backup, credentials recovery procedure |
| Ollama embedding model replaced | Personal content preserved; embeddings regenerated | Keep model metadata; derived-data rebuild procedure |
| Scento API unavailable | Existing content remains browsable and editable | Stored normalized records and saved source provenance |

**Important:** Neither a named Podman volume nor `lifecycle.prevent_destroy` alone is a backup/absolute deletion guarantee. Terraform's `prevent_destroy` may not protect against deletion if its resource declaration is removed. Refer to the official Terraform lifecycle documentation.

## 2. Persistence boundaries

### 2.1 Authoritative, non-recreatable personal data (Tier A)

Persist and back up:

- Collection entries and their stable identifiers, ownership and sample/wishlist/rejected/previously-owned history.
- Personal descriptions, test impressions, notes and ratings.
- Seasonal preferences: spring, summer, autumn, winter, including love/neutral/avoid and explicit uncertainty.
- Manual data corrections, merge decisions, confirmed fragrance identity and EAN/GTIN associations.
- References to and licenses/metadata for user-uploaded images; file bytes if uploads are supported.
- Historical state transitions and provenance decisions, not just today's snapshot.
- App settings whose loss affects data interpretation (normalization version, schema version).

**No automatic pruning** of the above in normal operation. A user-authorized permanent deletion is explicit, previewed and logged.

### 2.2 Rebuildable or re-fetchable derived data (Tier B)

- Vector embeddings, similarity score caches and denormalized discovery indexes.
- Thumbnail caches, resized assets and local fetched catalog previews where licenses permit.
- Temporary enrichment job queues and generated recommendation explanations.

These should be rebuildable using retained source references and versioned inference settings. Prefer keeping current embeddings in backups for convenience, but never require them to restore Tier A.

### 2.3 Sensitive infrastructure state (Tier C)

- Terraform state, encrypted backup keys, Vault bootstrap materials and locally required host settings.
- Treat Terraform state as sensitive. Keep backed up outside the Podman machine, with access controls.
- Existing Vault cluster has its **own independent backup and disaster-recovery plan**. F-Ray-grance backups do not back up Vault and should not export raw Vault secrets.

## 3. Storage layout and ownership

- PostgreSQL 18 + pgvector data files reside on a **stable named Podman volume**, scoped to this project, e.g. `fraygrance_pgdata`. Never use anonymous volumes or ephemeral layers for PostgreSQL.
- On macOS, Podman is remote to the client and volumes reside within the Podman VM; do not mistake their location for a macOS host directory.
- DB volume lifetime is managed in an explicitly separate protected **data provisioning boundary** (`infra/terraform/data`) from replaceable services (`infra/terraform/app`). This is a proposed Terraform split pending Podman provider compatibility testing.
- `app` plans may replace API/frontend containers, networks, and approved stateless resources, but may not manage the persistent database volume.
- **PostgreSQL 18 container layout:** official images use `PGDATA=/var/lib/postgresql/18/docker` and a volume root at `/var/lib/postgresql`. Phase 00 must inspect the chosen pgvector image and mount at the correct parent. Mounting at the legacy `/var/lib/postgresql/data` path without checking may lose the intended persistence behavior on recreation.
- Never bind-mount the live PostgreSQL `PGDATA` onto an arbitrary macOS-shared folder without separate durability, permissions and performance validation. For v0.1, prefer a Podman named volume plus host/off-host **logical backups**.
- External backup destination must exist on macOS **outside** the Podman VM. It must not be another volume in the same VM.
- Use explicit project/resource names and labels, and verify them before any destructive action.
- `make down` does not run `podman volume rm`, `podman volume prune`, `podman machine rm`, `terraform destroy` in the data root, or equivalent destructive actions.

## 4. Backup policy (accepted manual-only operation)

| Element | Default policy | Purpose |
|---|---|---|
| PostgreSQL logical DB dump | **Manually**, using `make backup` | Operator-triggered recovery point; no scheduler |
| Pre-upgrade/pre-migration dump | **Mandatory** | Recovery checkpoint before change |
| Backup format | `pg_dump -Fc` custom archive | Consistent logical snapshot and flexible `pg_restore` |
| Backup destination | Restricted macOS host folder outside Podman VM | Survive VM recreation |
| Additional copy | Encrypted off-device storage | Survive machine failure |
| Retention | Operator-managed, keep at least the previous known-good recovery copy | Avoid replacing the only restorable archive; no automated pruning |
| Verification | Dump completion, checksum, `pg_restore --list`, off-device copy verification | Detect obvious failures |
| Restore drill | **Manually before real-data onboarding, risky upgrades and important data recovery changes** | Prove *recoverability*, not just backup creation |
| Recovery point objective (RPO) | **Unbounded between manual backups** | Be explicit that records written after the last backup may be lost |
| Recovery time objective (RTO) | Initially measured in restore drills | Do not invent an untested guarantee |

A logical dump does **not** automatically include PostgreSQL global roles, Vault configuration, external user image files, Ollama models, or infrastructure state. Back these up through the appropriate separate process. Roles and pgvector installation must be recreated through controlled Ansible configuration before restore.

### Operational requirements

1. Dump from a backup-specific, least-privileged database role with sufficient read permissions; support Vault-leased credentials without storing a static password.
2. Record a manifest: UTC timestamp, database/schema version, PostgreSQL and pgvector versions, application Git revision, backup tool version, file checksum, file size, and target environment.
3. Use a temporary filename during backup; atomically mark success only after completion and verification. Never advertise incomplete files as healthy backups.
4. Encrypt copies outside the trusted local machine and restrict host-level access to cleartext archives. Never commit backups to Git.
5. Do not automatically delete all older backups until the new backup is confirmed and a separate off-device copy is verified.
6. **Do not install cron, launchd agents, CI schedules, timed retention or background backup jobs.** The owner runs `make backup`, copies the backup to independently protected media and runs `make restore-test` by choice or before high-risk changes.
7. `make backup-status` reports last confirmed operator-run backup and separately verified copy; stale or absent status is shown honestly, without claiming ongoing protection or automatic alerts.

## 5. Restore runbook requirements

`make restore BACKUP=/absolute/path/to/archive` must:

1. Refuse to run without an explicit backup path, protected confirmation and supported source/version check.
2. Verify checksum/manifest and backup readability before touching the destination.
3. Require a **fresh backup of the target database** before restoring over it, or default to a new temporary database.
4. Require maintenance mode / stopped app writes, or restore into a new DB and switch only after validation.
5. Reinstall/check the pgvector extension and apply least-privilege roles from Ansible, never assume dump restores Vault leases.
6. Restore data with `pg_restore`, verify schema compatibility, row counts and referential integrity, and run collection read/write smoke tests.
7. Compare key entity counts: fragrance identities, collection entries, historical transitions, seasonal preferences, annotations, and manually corrected source data.
8. Clearly report failure and leave original data intact on a failed rehearsal.
9. Only promote restored DB and restart app after tests pass; then regenerate derived embeddings if necessary.

A `make restore-test` target must use a **disposable database** and leave the authoritative collection unchanged.

## 6. Safe Terraform / Ansible / Make ownership

- **Terraform** provisions service resources and a separately scoped persistent-data layer; keep distinct states. Apply `prevent_destroy` where supported, while acknowledging its limits. Plan must be reviewed before data-affecting changes.
- **Ansible** configures PostgreSQL, pgvector, users, migrations and Vault integration. Migrations are versioned and repeatable. It does not wipe `PGDATA`, reinitialize a nonempty DB, or replace historical collection entries with seed data.
- **Make** is the only documented operator interface, with non-destructive defaults. Destructive functions live behind separate, named `danger-*` commands, not behind `down`, `clean`, `reset` or default `destroy`.
- **Podman** is the runtime, not the data-retention authority. Never use project-unscoped `podman system prune --volumes` as a maintenance shortcut.
- **Vault** issues operational credentials; credential rotation must not trigger schema initialization or data recreation.

### Required command contracts

| Make target | Safe behavior |
|---|---|
| `make start/stop/restart/down` | Manage only F-Ray-grance containers. Volumes untouched. |
| `make up` | Reconcile infra/config; preserve all data; no migrations without preflight. |
| `make doctor` | Validate Podman VM, disk, volume, Vault and backup destination availability. |
| `make plan` | Never implicitly apply; flag replacements affecting stateful resources. |
| `make backup` | Create off-VM consistent DB snapshot plus manifest. |
| `make backup-status` | Report last valid backup, age and off-device copy status. |
| `make restore-test` | Test in disposable DB; produce verifiable report. |
| `make restore BACKUP=...` | Guarded, explicit, safe maintenance restore. |
| `make upgrade` | Mandatory backup + schema check + reviewed plan. |
| `make destroy` | Destroy app resources only, preserve data boundary. |
| `make danger-destroy-data` | Separate, double-confirmed irreversible action; excluded from general help/default. |

These are **specification targets, not yet implemented commands**. No script is to falsely report a backup, restore or operational success.

## 7. Migration and rollback protection

- Pin PostgreSQL image digest or tested version, pgvector extension version, schema migration tool version, Ollama model revision, and app image revision in deployment records.
- Use expandable migrations (`add column` -> backfill -> switch reads/writes -> remove old column in later, separately approved release) for changes to authoritative personal data.
- Avoid destructive `DROP TABLE`, `TRUNCATE`, re-seeding, cascade deletes or direct DB resets in normal deployment and tests.
- Tests run in separate disposable databases, never the authoritative fragrance DB.
- For PostgreSQL major upgrades follow the official supported upgrade pathway, not a blind image tag replacement on the old `PGDATA`.
- Backup and verify restore before risky schema/extension upgrades; document the rollback route.
- Downgrade after a forward schema migration might not be possible; recovery may require restoring the pre-upgrade backup.

## 8. Acceptance tests for Phase 00 / v0.1

- [ ] Add two fragrances and one sample, set personal seasonal preferences, stop/start stack and verify unchanged IDs/counts.
- [ ] Replace API/frontend containers and rerun Ansible; records unchanged, migrations not re-seeded.
- [ ] Recreate PostgreSQL **container** with the same named volume; collection unchanged. (Do not remove the volume.)
- [ ] **Manually run** `make backup` producing a complete `pg_dump -Fc` archive stored **outside Podman VM** with checksummed manifest and secure permissions.
- [ ] **Manually run** `make restore-test` to restore archive to disposable PostgreSQL, confirm counts, historical transitions, four-season profiles and manual corrections.
- [ ] Rebuild embeddings from canonical source text after restoring, without mutating personal preference content.
- [ ] Revoke a Vault DB lease; app handles credential renewal safely and does not modify or lose collection data.
- [ ] Simulate unavailable Scento/Ollama; existing library remains usable.
- [ ] Attempt `make down`, `make destroy`, `make clean` and verify none can delete the persistent data layer.
- [ ] Test fresh workstation/Podman VM reconstruction using off-VM backup, with results and measured RTO documented. Use a test environment, never delete production data for a test.

**Durability release gate:** Do not call v0.1 release-ready until at least one successful **operator-initiated** full restore drill verifies Tier A recovery independently of the original Podman VM. This is a manual practice: Git commits do **not** back up PostgreSQL records. Document last backup time and chosen off-device copy location (never store secrets or private paths in Git).

## 9. Official sources

- Official PostgreSQL container versioned PGDATA layout: https://hub.docker.com/_/postgres
- PostgreSQL 18 backup/restore: https://www.postgresql.org/docs/18/backup.html
- PostgreSQL 18 `pg_dump`: https://www.postgresql.org/docs/18/app-pgdump.html
- PostgreSQL 18 `pg_restore`: https://www.postgresql.org/docs/18/app-pgrestore.html
- Podman volumes: https://docs.podman.io/en/latest/markdown/podman-volume.1.html
- Podman machine/volume architecture: https://docs.podman.io/en/latest/markdown/podman-create.1.html
- Terraform lifecycle `prevent_destroy` caveat: https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle
- Vault PostgreSQL database plugin: https://developer.hashicorp.com/vault/docs/secrets/databases/postgresql
- Vault Agent auto-auth: https://developer.hashicorp.com/vault/docs/agent-and-proxy/agent
