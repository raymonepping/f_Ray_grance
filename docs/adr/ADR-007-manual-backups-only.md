# ADR-007: Manual-only backups with durable data boundary

**Status:** Accepted | **Date:** 2026-10-24 | **Baseline:** v0.1.6

## Decision

- No recurring jobs, launchd/cron scheduling, automatic backups, cloud-backup daemon or automatic backup retention policy for v0.1.
- Keep durable `fraygrance_pgdata` in a separate Terraform data/state boundary; regular Make operations do not delete data.
- The owner explicitly runs `make backup`, verifies the checksummed off-Podman-VM archive and independently protected copy, and runs `make restore-test` into a disposable PostgreSQL instance. A successful drill is mandatory before importing valuable personal data and before risky upgrades.
- `make backup-status` truthfully shows the **last manual** backup and verification status. It must not claim automatic coverage or a 24-hour RPO. Any writes since the previous backup may be lost in a disaster.
- Git commits version code, sanitized reports and state only. Never store any actual database dump, personal fragrance history, image archive, encryption keys or Vault materials in Git.

## Consequences

- Low operational complexity, but backup freshness depends on owner discipline. Periodic manual review is strongly advised and clearly separated from autonomous scheduling.
- A persistent Podman volume is not a disaster-recovery backup; Mac/VM loss requires restoration from outside the VM.
