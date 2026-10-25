# F-Ray-grance: OPERATIONS.md

**Status:** Contract for local operations, v0.1.6 | **Date:** 2026-10-24

## Operating philosophy

Terraform installs infrastructure; Ansible configures services; Make provides one predictable CLI; Podman runs it. The existing Vault service is a precondition and central authority for application secrets. Follow the sequencing: **verify → provision → readiness → configure → validate → operate**.

Do not hide unfinished provisioning behind green terminal messages. This file defines a **command contract**. No Makefile, Terraform provider compatibility, Ansible playbooks or runtime is asserted to be implemented merely because its behavior is specified.

## Proposed CLI contract

| Command | Responsibility | Data impact |
|---|---|---|
| `make help` | Describe commands | none |
| `make doctor` | Check host binaries, Podman engine and explicit provider socket | none |
| `make smoke-init` | Terraform init for disposable provider compatibility probe | creates local Terraform cache/state |
| `make smoke-plan` | Plan network+volume+container test | no container changes |
| `make smoke-up` | Apply disposable Podman compatibility probe | creates named disposable test resources |
| `make smoke-down` | Destroy only the probe resources | destructive to probe objects only |
| `make init` | Initialize app Terraform root after implementation | no application services |
| `make plan` | Preview foundation changes | no application services |
| `make provision` | Terraform apply foundation | creates/changes scoped application infrastructure |
| `make configure` | Run idempotent Ansible service configuration | may modify DB config, schema, Vault policies |
| `make up` | `doctor` + `provision` + `configure` + `health` | start/reconcile services |
| `make start` | Start existing named services in dependency order | preserves volumes |
| `make stop` | Stop existing named services in reverse dependency order | preserves volumes |
| `make down` | Alias for nondestructive stop | preserves volumes |
| `make restart` | Stop/start existing services | preserves volumes |
| `make status` | Show F-Ray-grance containers | none |
| `make logs SERVICE=api` | Scoped logs for one service | none |
| `make health` | API, Postgres extension, Vault lease checks | none |
| `make test` | Backend/frontend/integration tests | may use disposable test data |
| `make backup` | **Manual**, consistent PostgreSQL dump outside Podman VM with manifest/checksum | creates backup artifact only on operator command |
| `make backup-status` | Report last operator-run complete backup and known off-device copy verification status | none |
| `make restore-test` | Restore to disposable PostgreSQL and compare authoritative records | isolated test database |
| `make upgrade` | Mandatory preflight and backup before upgrades/migrations | controlled planned changes |
| `make restore` | Explicit, confirmed restore from chosen backup | changes live DB content |
| `make destroy` | Tear down only stateless application boundary; data state excluded | app runtime only |
| `make danger-destroy-data` | Dedicated double-confirmed deletion outside normal workflow | **irreversible** |

## Command behavior policy

- Make commands use explicit names and non-zero exit on failure; no `|| true` masking errors.
- `make stop/down` stop only **known** F-Ray-grance containers, never all Podman containers. Keep the Podman machine itself running as it may host unrelated projects.
- `make destroy` is limited to the stateless application Terraform state (`infra/terraform/app`). Keep persistence resources in a separately controlled data root/state, not included in general destroy. `make danger-destroy-data` is separate, not implemented by default, and requires double confirmation and verified backup.
- `make down`, `make stop`, `make clean` (if ever added) never remove volumes or Podman machines. Do not run unscoped `podman system prune --volumes`.
- `make logs` must redact secrets in service logging; the Makefile must not print Vault values.
- `make up` must remain idempotent; do not repeatedly recreate volumes or run unguarded database migrations.
- Terraform state must be retained, backed up securely and excluded from Git. Treat state as **sensitive**, even if resource definitions aim to avoid secrets.
- Ansible configuration uses separate credentials and `no_log` when necessary. Application DB roles cannot run schema migrations.
- Use per-project naming and labels (`fraygrance`) to prevent accidental interference with Arcanium, Editors Factory, other services or Podman machines.
- Reconcile Terraform state with Podman after manually starting/stopping containers. Lifecycle state can appear as drift in a subsequent plan.

## Initial Phase 00 prerequisites

- macOS Apple Silicon, working Podman machine; Terraform, Ansible, GNU Make, Vault CLI, Tailscale CLI/app and appropriate runtimes installed locally.
- Existing Vault cluster reachable **without using a root/admin token in app environment**.
- Explicit `PODMAN_DOCKER_HOST` points to a Podman Docker-compatible socket. Confirm it is not Docker Desktop before running Terraform against it.
- Scento outbound HTTPS availability; Postgres 18 + pgvector chosen; model/dimensions for Ollama embeddings pinned only after a functional experiment.
- Configure **Tailscale Serve privately** on the Mac host or chosen trusted ingress. Tailnet DNS/HTTPS and grants must be operator-authorized; Terraform must not silently alter tailnet-wide ACLs or create public endpoints. Keep app gateway on `127.0.0.1`; **never enable Funnel**. Independently enforce owner authentication/authorization in Fastify.
- `make doctor` checks what's available. It does not install or modify local tools.

## Provisioning sequence

```text
make doctor
    ↓
make smoke-init → make smoke-plan → make smoke-up → make smoke-down
    ↓ successful socket/provider compatibility
make init → make plan → make provision
    ↓
wait for PostgreSQL and API dependencies
    ↓
make configure (Ansible)
    ↓
make health → make test
    ↓
make status / logs / stop / start / backup
```

The first pass must test the provider with disposable resources **before** any PostgreSQL data or Vault secret is involved. If the provider fails: investigate API compatibility, record specific failure, and decide a revised Terraform ownership boundary in an ADR. Do not add untested fallbacks.

## Ansible configuration boundaries

- PostgreSQL: create logical DB/schema and enable pgvector, apply versioned migrations, configure least-privilege roles using approved administrator path, validate connectivity. Use `community.postgresql` modules where practical; for contained DB run commands through a controlled connection; test on Mac/Podman VM.
- Vault: configure scoped policies, auth roles, database plugin/roles **after** DB is reachable; only approved admin capabilities; no root token persistence.
- Ollama: verify embedding model readiness; controlled model pull in configuration stage only after resource/performance limits agreed.
- API: render nonsecret settings, configure health integration and initial indexes/jobs.
- Frontend: theme tokens and build settings only; never embed Vault secrets into publicly bundled Nuxt configuration.
- Ansible must never own the container lifecycle if Terraform owns containers. `containers.podman` is useful for inspection/configuration, but avoid declaring `podman_container state=started` for Terraform-owned resources.

## Remote access operations

1. Confirm Tailscale is installed and authenticated on both Mac and iPhone; enable MagicDNS and HTTPS certificates for the tailnet if authorized.
2. Confirm tailnet access rules restrict the intended operator devices/users; do not assume the default policy is restrictive.
3. With only the gateway listening on `127.0.0.1:<approved-port>`, use the installed Tailscale version's `tailscale serve` syntax to map the local port to the tailnet HTTPS hostname. Inspect `tailscale serve status`. Never use Funnel.
4. Test HTTPS DNS and certificate validation on an approved iPhone; verify login, session-cookie security, logout and denial of a disallowed client. Confirm Mac sleep/network loss degrades cleanly.
5. Tailscale configuration changes are a distinct, explicitly approved operator step and must not be mixed with Podman resource ownership or Vault policies. Do not write Tailscale auth keys into Terraform state or Git.

## Backups and destruction

- PostgreSQL backup must use a consistent `pg_dump` against a validated connection, record schema/app version and timestamp. Do not claim a `pg_dump` alone backs up Ollama models, user uploads, Terraform state, or Vault.
- Periodic restore drills are a release gate; backup encrypted or securely protected, not left on a public share.
- `make destroy` must not remove PostgreSQL persistent data, the existing independently managed Vault cluster or unrelated Podman resources.
- **No automatic backups, schedulers or rotation services.** The owner chooses when to run `make backup`; `make backup-status` records the last verified manual backup and protected external copy. Run `make restore-test` before importing irreplaceable data and before risky upgrades, and periodically at the owner's discretion. Git commit history is source recovery, not database recovery.
- `make restore-test` must use a disposable destination and compare personal notes, ratings, collection history, seasonal profiles, and known fragrance IDs.
- Provisioned volume names must remain stable and documented; volume resource deletion must be blocked until explicit data-loss confirmation. Terraform `prevent_destroy` is a defense in depth, not an absolute guard if resource configuration is removed.
- A verified manual PostgreSQL backup must exist off-VM on the macOS host and have an independently protected off-device copy before real personal collection data is imported; the user triggers copies and restore tests. A Podman named volume alone is not disaster recovery.
- Pre-upgrade/pre-migration backup and restore test are required release gates. See `DATA_PERSISTENCE.md` for retention, restore and RPO requirements.

## Failure examples

| Failure | Expected behavior |
|---|---|
| Podman machine stopped | `doctor` fails with actionable message; no Terraform apply |
| Docker socket points to Docker Desktop | Operator aborts until endpoint verified; no accidental Docker deployment |
| Terraform smoke fails | Stop before provisioning; report unsupported API operation |
| Scento unavailable | Existing collection loads; enrichment shows retryable error |
| Ollama unavailable | Structured notes and comparisons remain usable; vector discovery degrades visibly |
| Vault lease revoked | API drops/refreshes DB pool, returns clean failure while authority is unavailable |
| Ansible fails | Preserve Terraform state, rerun configuration after correction |
| `stop` requested | Only named project services stop; PostgreSQL volume remains |

## Useful official references

- https://developer.hashicorp.com/terraform/cli/run
- https://developer.hashicorp.com/vault/docs/secrets/databases/postgresql
- https://docs.ansible.com/projects/ansible/latest/collections/containers/podman/
- https://podman-desktop.io/docs/migrating-from-docker/managing-docker-compatibility
