# Manual recovery and upgrades

Backups are manual. There is no scheduler or automatic retention. Save a new backup after meaningful changes and before risky operations; data saved since the chosen backup is outside its recovery point. Keep several known-good checkpoints and delete older archives manually only after verifying the replacements and protected copies.

## Backup and rehearsal

Run `make backup`. The restricted host directory defaults to `~/F-Ray-grance-backups`, outside the Podman VM. A least-privileged `fray_backup` transaction exports one PostgreSQL snapshot, held open while both `pg_dump -Fc --snapshot` and manifest fingerprint queries complete. The manifest is published last, after archive readability/checksum checks. This prevents concurrent writes from making the dump disagree with its manifest. See PostgreSQL 18 documentation for [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html) and [snapshot synchronization](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION).

A backup is one **recovery set**: `fray-<ts>.dump`, `fray-<ts>.images.tar`, `fray-<ts>.images.json` and `fray-<ts>.manifest.json`. The manifest binds the checksums of the other three (`recovery_set`, ADR-016). Copy all four to an encrypted external device or another protected off-device destination. Independently verify the copied checksums there, then record your attestation with `make backup-record-copy BACKUP=/absolute/archive.dump LOCATION="protected destination label"`. It refuses a set with a missing or changed file, and refuses legacy backups taken before ADR-016 (take a new backup). That command records your verification; it does not perform the copy or prove encryption. Keep actual destination credentials and private paths outside Git.

Run `make restore-test BACKUP=/absolute/archive.dump`. In order, it:

1. checks the checksum of every file in the recovery set;
2. checks trusted format, PostgreSQL major version and schema compatibility, and archive readability. A backup from a newer build is refused before anything is created, with the `app_git_revision` to check out;
3. recreates roles in a fresh network-isolated container and restores;
4. compares all application-table row counts/content fingerprints and the pgvector version with the manifest, on the backup's own schema;
5. brings an older backup forward to the current schema inside that isolated target, with the checked-in migrations, after verifying the backup's migration ledger checksums (a changed migration is refused);
6. runs a synthetic runtime-role collection/history/season/Academy/image write check that rolls back;
7. checks images (below).

Each attempt writes **one** receipt under `restore-tests/`, at the end: `result: PASS` only when every stage passed, otherwise `FAIL` with the failed stage. `make backup-status` counts only complete-set receipts (receipt version 2); receipts written before ADR-016 never count, because they were saved before the image checks ran. Retained older backups (schema 3 onwards) restore through step 5; the live database and the backup files are never migrated or changed. Image-declared volumes are explicitly ignored, so the disposable database lives in the container’s writable layer and creates no anonymous data volume. The disposable container is removed on success or failure. The authoritative database stays unchanged.

This rehearsal uses the current Podman VM. It does **not** prove survival of VM or Mac loss. Before real-data import, copy the repository/runtime pins, archive and manifest to an approved separate Mac or fresh Podman VM and run the same rehearsal there. Record the environment, verified checksum, fingerprints and elapsed recovery time. Only when actually running on the independently verified destination, set `FRAY_RESTORE_ENV_LABEL` to a non-sensitive label and `FRAY_RESTORE_INDEPENDENT=YES` to record the operator attestation. Leave these unset for local rehearsals; the flags alone do not prove independence. No deletion of the original VM is necessary or authorized by this procedure.

### Perfume images

Image binaries live in the protected `fraygrance_image_assets` volume, not in PostgreSQL and not in Git. A persistent volume is not a backup. The app never deletes image files: deleting an image, `make purge` and the synthetic-owner purge remove records only. `make backup` keeps the database and the images consistent (ADR-016):

1. Holding `.backup.lock`, before the snapshot, it collects image files that no record references and that are older than `FRAY_IMAGE_GC_GRACE_MIN` (default 60 minutes). Re-storing identical bytes refreshes a file's time, so a file in use again is not collected.
2. The database snapshot records every image file it references.
3. A read-only, network-less tar of the volume is written. Between steps 2 and 3, files can only be added, so the archive holds every file the snapshot references.
4. Every referenced original is checked against its checksum, and every derivative must be a complete WebP. Only then are `fray-<ts>.images.tar`, `fray-<ts>.images.json` and, last, the manifest published. If anything is missing, the backup fails (`BACKUP_FAIL`) and nothing is published.

`make restore-test` refuses archives with links, devices, absolute or parent paths or unexpected names. It checks every image the restored database references against the archive, then extracts the archive into a **fresh, isolated volume** (API runtime user, 750/640), with the authoritative volume untouched. In that volume it verifies every original's checksum and decodes every derivative with the API's image library, then checks that each image is readable only by its own owner. A backup whose database references images but has no image archive fails the rehearsal. Promoting a recovered target to production, including that volume, stays manual and unverified.

`bash scripts/probes/p15_recovery_matrix.sh` reproduces all of this on synthetic fixtures in private temporary targets: schema 3, 4, 5 and current backups, corruption and incompleteness cases, a file removed between snapshot and archive, and the collector.

## Explicit recovery staging

`make restore BACKUP=/absolute/archive.dump` requires typing `RESTORE TO QUARANTINE`. Only use a trusted project archive: restoring PostgreSQL dumps executes SQL. The command defaults to a fresh isolated target, validates as above, and retains the successfully restored container and its restored image volume (`fray-restoretest-assets-<ts>`) for operator inspection. Failed targets are removed. No live data is overwritten; there is no public/network port on the quarantine target.

The command prints the exact target name. Inspect via `podman exec <printed-target> psql -U postgres -d fray`. Keep private query output outside reports/Git. Remove that staging target with `podman rm -f <printed-target>` and its image volume with `podman volume rm <printed-assets>` when finished. Quarantine storage remains in the current VM and is not a replacement backup.

Production promotion is deliberately manual and has not been verified: stop app writes; take and verify a fresh backup of any existing target; retain the original data volume; review a separate Terraform/Ansible recovery plan for a fresh data target; restore with matching roles/extensions; verify fingerprints and API owner-scoped reads/writes; regenerate Vault-issued credentials/session configuration; only then switch the app to the approved target and run health/browser/security checks. Never copy stale Vault leases from an archive. Keep the old target available for rollback. Rebuild embeddings if required; authoritative personal data comes first. A PostgreSQL major/image or pgvector upgrade needs its supported migration path and separate review.

Protect Vault unseal material, the operator recovery process and Terraform state separately, as described in the [operator runbook](runbook.md). A PostgreSQL dump excludes Vault, Ollama models and Terraform state; perfume image binaries travel in the separate image archive described above. Source Git history is not a collection backup.

## Reviewed application upgrade

After reviewing source/migrations, run `make upgrade AUTO_APPROVE=YES`. It runs the quality gate and health, creates a fresh backup, proves a restore, builds images, and checks saved Terraform plans. It permits changes only to API/web containers; data roots, networking, Vault/Ollama/PostgreSQL images and volumes require separate review. It applies the exact validated application plan, runs Ansible migrations, checks health and runs browser acceptance tests. Any failed step stops the upgrade; later configuration/test failures may leave the new app deployed, so inspect logs before proceeding.

Migrations are checksummed and forward-only. Do not downgrade an application across incompatible schema changes. A data rollback requires the explicit recovery staging/promotion procedure using the pre-upgrade backup; replacing an image alone cannot reverse a migration. Independent protected recovery remains a prerequisite for irreplaceable personal data.
