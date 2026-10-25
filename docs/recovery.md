# Manual recovery and upgrades

Backups are manual. There is no scheduler or automatic retention. Save a new backup after meaningful changes and before risky operations; data saved since the chosen backup is outside its recovery point. Keep several known-good checkpoints and delete older archives manually only after verifying the replacements and protected copies.

## Backup and rehearsal

Run `make backup`. The restricted host directory defaults to `~/F-Ray-grance-backups`, outside the Podman VM. A least-privileged `fray_backup` transaction exports one PostgreSQL snapshot, held open while both `pg_dump -Fc --snapshot` and manifest fingerprint queries complete. The manifest is published last, after archive readability/checksum checks. This prevents concurrent writes from making the dump disagree with its manifest. See PostgreSQL 18 documentation for [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html) and [snapshot synchronization](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION).

Copy both archive and manifest to an encrypted external device or another protected off-device destination. Independently verify the copied checksum there, then record your attestation with `make backup-record-copy BACKUP=/absolute/archive.dump LOCATION="protected destination label"`. That command records your verification; it does not perform the copy or prove encryption. Keep actual destination credentials and private paths outside Git.

Run `make restore-test BACKUP=/absolute/archive.dump`. It checks checksum, trusted format, PostgreSQL major/schema compatibility and archive readability, recreates roles in a fresh network-isolated container, restores and compares all application-table row counts/content fingerprints and the pgvector version. A synthetic runtime-role collection/history/season write check rolls back. Image-declared volumes are explicitly ignored, so the disposable database lives in the container’s writable layer and creates no anonymous data volume. The disposable container is removed on success or failure. The authoritative database stays unchanged.

This rehearsal uses the current Podman VM. It does **not** prove survival of VM or Mac loss. Before real-data import, copy the repository/runtime pins, archive and manifest to an approved separate Mac or fresh Podman VM and run the same rehearsal there. Record the environment, verified checksum, fingerprints and elapsed recovery time. Only when actually running on the independently verified destination, set `FRAY_RESTORE_ENV_LABEL` to a non-sensitive label and `FRAY_RESTORE_INDEPENDENT=YES` to record the operator attestation. Leave these unset for local rehearsals; the flags alone do not prove independence. No deletion of the original VM is necessary or authorized by this procedure.

## Explicit recovery staging

`make restore BACKUP=/absolute/archive.dump` requires typing `RESTORE TO QUARANTINE`. Only use a trusted project archive: restoring PostgreSQL dumps executes SQL. The command defaults to a fresh isolated target, validates as above, and retains the successfully restored container for operator inspection. Failed targets are removed. No live data is overwritten; there is no public/network port or durable volume on the quarantine target.

The command prints the exact target name. Inspect via `podman exec <printed-target> psql -U postgres -d fray`. Keep private query output outside reports/Git. Remove that staging target with `podman rm -f <printed-target>` when finished. Quarantine storage remains in the current VM and is not a replacement backup.

Production promotion is deliberately manual and has not been verified: stop app writes; take and verify a fresh backup of any existing target; retain the original data volume; review a separate Terraform/Ansible recovery plan for a fresh data target; restore with matching roles/extensions; verify fingerprints and API owner-scoped reads/writes; regenerate Vault-issued credentials/session configuration; only then switch the app to the approved target and run health/browser/security checks. Never copy stale Vault leases from an archive. Keep the old target available for rollback. Rebuild embeddings if required; authoritative personal data comes first. A PostgreSQL major/image or pgvector upgrade needs its supported migration path and separate review.

Protect Vault unseal material, the operator recovery process and Terraform state separately, as described in the [operator runbook](runbook.md). A PostgreSQL dump excludes Vault, Ollama models and Terraform state. Source Git history is not a collection backup.

## Reviewed application upgrade

After reviewing source/migrations, run `make upgrade AUTO_APPROVE=YES`. It runs the quality gate and health, creates a fresh backup, proves a restore, builds images, and checks saved Terraform plans. It permits changes only to API/web containers; data roots, networking, Vault/Ollama/PostgreSQL images and volumes require separate review. It applies the exact validated application plan, runs Ansible migrations, checks health and runs browser acceptance tests. Any failed step stops the upgrade; later configuration/test failures may leave the new app deployed, so inspect logs before proceeding.

Migrations are checksummed and forward-only. Do not downgrade an application across incompatible schema changes. A data rollback requires the explicit recovery staging/promotion procedure using the pre-upgrade backup; replacing an image alone cannot reverse a migration. Independent protected recovery remains a prerequisite for irreplaceable personal data.
