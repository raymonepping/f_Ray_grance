# ADR-003: Persistent data is independent of application lifecycle

**Status:** Accepted architecture policy; implementation and restore drills pending  
**Date:** 2026-10-24

## Context

F-Ray-grance will preserve a personal fragrance collection, historic ownership, manual corrections, and seasonal preferences over years. API/frontend containers, application images and infrastructure may be rebuilt frequently. Podman runs inside a macOS VM, so VM removal or disk loss must be included in the failure model.

## Decision

1. PostgreSQL 18/pgvector remains the authoritative state store for all personal collection data. Its storage volume has a stable name and survives stateless container recreation.
2. Terraform provisioning is separated into a guarded **data** boundary and replaceable **app** boundary, with distinct state. Only app resources belong to the normal `make destroy` command.
3. The database volume is not the backup. Produce **operator-initiated manual** PostgreSQL archives outside Podman VM, plus independently protected off-device copies. **No scheduled backups or fixed daily/monthly retention**; use a successful restore rehearsal before onboarding irreplaceable data and major changes. See ADR-007.
4. Keep all personal history, manual provenance corrections, sample statuses and seasonal preferences intact across normal operations and schema upgrades. Derived Ollama embeddings can be rebuilt.
5. No daily usage diary is required; backups are run **only on explicit operator command**, not automatically.
6. Terraform `prevent_destroy` supplements, but cannot replace, separate state boundaries, off-VM backups and restore testing.
7. Normal Make targets never remove persistent volumes. Irreversible data deletion requires an explicit separate procedure with double confirmation.

## Consequences

- More initial setup for backup storage and verification.
- Small recurring disk/storage cost for archives and off-device retention.
- Much lower risk of losing irreplaceable collection history during quarterly rebuilds.
- Full disaster recovery depends on tested, protected backups and independent Vault/infra recovery.

## Verification

- Recreate API and DB containers with unchanged data volume; compare persistent IDs and counts.
- Restore a host/off-device backup into a brand-new disposable PostgreSQL environment.
- Test `make stop`, `down`, `destroy` against protected data boundary.
- Fail release if backup status cannot be demonstrated or sample restore does not succeed.

## References

- `DATA_PERSISTENCE.md` (authoritative operational details)
- https://www.postgresql.org/docs/18/backup.html
- https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle
- https://docs.podman.io/en/latest/markdown/podman-volume.1.html
