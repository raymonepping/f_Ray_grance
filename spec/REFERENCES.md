# F-Ray-grance | VERIFIED_REFERENCES.md

**Research checked:** 2026-10-24. Official source links and the questions they substantiate. This document is a research record, not proof of local runtime behavior.

| Area | Verified reference | Key fact |
|---|---|---|
| PostgreSQL 18 backup | https://www.postgresql.org/docs/18/backup-dump.html | `pg_dump` consistent logical snapshot; restore requires compatible roles and extensions |
| PostgreSQL 18 container volume | https://hub.docker.com/_/postgres | PostgreSQL 18 uses version-specific `PGDATA` and volume root `/var/lib/postgresql` |
| pgvector | https://github.com/pgvector/pgvector | Exact/ANN vector searches, cosine operator, supported PostgreSQL versions |
| pgvector 0.8.7 | https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md | Version 0.8.7 noted on 2026-10-01; image availability still to verify |
| Tailscale Serve | https://tailscale.com/docs/features/tailscale-serve | Private tailnet HTTPS proxy, not public Funnel |
| Tailscale HTTPS | https://tailscale.com/docs/how-to/set-up-https-certificates | Tailnet HTTPS certificate prerequisites and privacy trade-off |
| Tailscale access rules | https://tailscale.com/docs/features/access-control | Explicit grants/ACLs for allowed client identities |
| PostgreSQL logical backup tools | https://www.postgresql.org/docs/18/app-pgdump.html | `pg_dump` manual consistent logical archive; restore validation needed |
| Vault database plugin | https://developer.hashicorp.com/vault/docs/secrets/databases/postgresql | PostgreSQL dynamic credentials, roles and leases |
| Vault Agent auto-auth | https://developer.hashicorp.com/vault/docs/agent-and-proxy/autoauth | Auto-auth token acquisition/renewal behaviors |
| Terraform lifecycle | https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle | `prevent_destroy` is not absolute if configuration removed |
| Podman socket | https://podman-desktop.io/docs/migrating-from-docker/managing-docker-compatibility | Docker-compatible socket available; test provider capabilities |
| Podman on Mac | https://docs.podman.io/en/latest/markdown/podman-machine.1.html | Podman uses a Linux VM on macOS |
| Scento API | https://www.scento.com/developers/perfume-api | Keyless GET API, perfume lookup and contrast endpoints |
| Scento API terms | https://www.scento.com/terms-of-service#perfume-api | No overload/bypass/wholesale catalog replication |
| Accessibility | https://www.w3.org/TR/WCAG22/ | WCAG 2.2 AA requirements including 4.5:1 normal text contrast |
| Terraform Docker provider | https://registry.terraform.io/providers/kreuzwerker/docker/latest/docs | Version 4.6.0 is available for Darwin ARM64; Podman API compatibility remains unverified |
| Nuxt documentation | https://nuxt.com/docs/4.x/getting-started/installation | Nuxt 4 package/runtime requirements to verify with chosen lockfile |

Use runtime pinning based on an actual ARM64 Podman test, not on the existence of a published version string. Validate licenses and source terms again before shipping.
