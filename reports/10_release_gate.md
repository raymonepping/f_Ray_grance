# Phase 10 — Security, persistence and release gate

Prompt FRAY-CODEX-10. Codex, 2026-10-25. Predecessor Phase 09 `9d5c5ae0e8701a617a9cf297c5e97be4d4f41605` was pushed to verified GitHub main. Its GitHub Detect secrets check was observed completed/success.

## Decision

**Release BLOCKED pending independent recovery evidence.** The local Mac implementation remains usable with owner authentication. Tailscale/iPhone access is **DEFERRED by operator** under ADR-009; no enterprise policy workaround was attempted. Real personal-data import remains disabled. Phase 11 remains documentary draft scope and cannot start from a blocked Phase 10.

## Improvements and prior-work audit

- Fixed a real backup consistency risk: the original dump and its manifest fingerprints used separate database snapshots. A held read-only exported PostgreSQL snapshot now supplies both `pg_dump --snapshot` and manifest queries. Manual backup publication remains partial-file → readable archive → checksum/manifest → final manifest last; a local lock prevents overlapping backups and existing archive filenames cannot be overwritten.
- Restore validates format, checksum, PostgreSQL major/schema compatibility and archive readability before creating the fresh target. It recreates the role model, restores, checks the exact pgvector version, executes synthetic runtime collection/history/season CRUD in a rolled-back transaction and compares all table fingerprints.
- Disposable database commands now explicitly ignore image-declared volumes. The inherited “no volume” claim did not itself suppress automatic anonymous image volumes; explicit Podman behavior now enforces it. No broad volume cleanup/prune was performed.
- `make restore` requires an explicit absolute trusted archive and typed confirmation. It defaults to a fresh quarantined target, retains only a validated target, and never overwrites/promotes the authoritative database. Actual production promotion remains a reviewed operator procedure, not a tested claim.
- `make upgrade AUTO_APPROVE=YES` runs quality/health/backup/restore gates, builds images, validates saved Terraform plans to allow only API/web container changes, applies that exact app plan, then runs migrations, health and browser tests. Infrastructure/DB-image/volume changes require separate review. Failures stop execution; forward migrations cannot be undone by replacing an image.
- Hardened the inherited live security probe so operator/CSRF credentials travel through header descriptors and Vault CLI environment rather than command-line credential values.
- Backup status now binds off-device attestations to archive checksum and explicitly reports the absence of independently attested recovery for the latest archive. No attestation was fabricated.
- Updated the stale root README (which still described unimplemented Phase 00 scaffolding), runbook lease duration, current access policy and [recovery guide](../docs/recovery.md). Included formatting-only changes left unstaged by the Phase 09 pre-commit hook.

## Observed validation

| Check | Result / evidence |
|---|---|
| `make test` | PASS after recovery-tooling changes; docs/prompts, shell/Python, Terraform/Ansible, typechecks, API/web tests and secret checks |
| `make upgrade AUTO_APPROVE=YES` | PASS: fresh backup, restore, reviewed app-only plan, configure/health, 28/28 browser tests (30.6 seconds) |
| `python3 scripts/probes/p10_lifecycle.py` | PASS: synthetic history/notes/four-season backup restore; all 18 table fingerprints unchanged across down/start, restart, API recreation and full stateless app destroy/reprovision/configure |
| Noninterference | All 108 unrelated container IDs/states unchanged during lifecycle drill |
| `python3 scripts/probes/p10_backup_concurrency.py` | PASS: 9 concurrent synthetic seasonal revisions; restored dump matches every manifest fingerprint |
| `bash scripts/probes/p03_live_security.sh` | 39 PASS, 0 FAIL: least-privilege policies, leases/revocation, pool rotation, Vault outage/recovery, anonymous/authenticated access, origin/CSRF/logout/cookies and no credential values in project service logs |
| Guard probes | PASS: corrupted archive, unsupported schema, missing restore path and upgrade without explicit approval refused before target changes |
| Confirmed `make restore` | PASS: fresh quarantine target, 18-table fingerprints and runtime smoke; inspected network=none and no mounts/volumes; 5.3 seconds total staging; only verified test target removed |
| `make health`, `make drift`, `make doctor` | PASS; no drift in data or app root; loopback gateway only; prerequisites/Podman socket verified |
| Final post-rebuild browser/backup/restore | PASS: `make test`, 28/28 browser tests (32.0 seconds), fresh shared-snapshot archive `fray-20261025T095344Z.dump`, restore smoke and all 18 table fingerprints (93 rows), pgvector 0.8.7 |

All probe owners were synthetic and removed after their tests. Backups/restore receipts stay in the restricted host backup directory, outside Git and outside the VM. Reports contain no private records or credentials. Restore durations measure the observed local steps; no workstation-loss recovery-time guarantee is claimed.

## Required operator evidence

The latest manual host backup has **no recorded independently protected off-device copy**. No restore outside the original Podman VM has been executed. The operator has been asked for the protected destination and separate Mac/VM/environment; no destination or access has been supplied yet. These are required before importing irreplaceable personal history under [DATA_PERSISTENCE.md](../spec/DATA_PERSISTENCE.md), whose durability gate requires a restore “independently of the original Podman VM.” Local disposable restores and source commits do not satisfy that gate.

Production recovery promotion and iPhone Safari/remote device grants/denials are not verified. Tailscale is deferred explicitly; remote gates are not marked PASS. Preserve the original authoritative volume, keep import disabled and resume Phase 10 when the operator supplies an approved recovery destination/environment. `last_successful_phase` remains 09.

## Changed-file inventory and handoff

Recovery scripts (`backup.sh`, `backup_snapshot.py`, `backup_manifest.py`, `backup-status.sh`, `restore-test.sh`, `restore.sh`, `upgrade.sh`), disposable database setup, runtime restore smoke SQL, synthetic lifecycle/concurrency probes, inherited security probe, Make/test integration, current README/changelog/runbooks, browser evidence and atomic build state. Only these explicit phase-owned changes are committed through `commit_gh`; unrelated agent configuration stays untracked.

Local recovery implementation was committed/pushed through `commit_gh` as `5d6bee138de9c0319f4c6d440f868cfb0f669782`. Its GitHub Detect secrets check was observed completed/success. The following checkpoint includes that observed CI result and shell formatting produced by the pre-commit hook; shell syntax and documentation validation pass. This does not change the blocked independent recovery decision.
