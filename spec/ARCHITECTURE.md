# F-Ray-grance: ARCHITECTURE.md

**Status:** v0.1.6 proposed implementation baseline | **Date:** 2026-10-24

## Decisions

- Personal-first, future multi-user segmentation (`owner_id` boundaries planned).
- Mobile/desktop Nuxt 4 / Vue 3 / TypeScript; Node 24 LTS with Fastify API.
- PostgreSQL 18 + pgvector; structured SQL and JSONB for source metadata; local Ollama for embeddings.
- Scento-first retrieval; manual correction and exact-identity validation; do not bulk-copy third-party catalog.
- Existing HashiCorp Vault environment is an **external dependency**, not a second Vault cluster created by the app stack.
- Podman on Apple Silicon; Terraform provisioning, Ansible configuration, Make orchestration.
- No daily wear journal, pricing engine, purchase funnel or mandatory cloud service.

## Deployment topology

```text
Approved iPhone/Mac via Tailscale tailnet + local host browser
           | private HTTPS (Tailscale Serve, no Funnel)
           v
 Tailscale Serve on Mac -> loopback-only same-origin gateway
           |
           +-- Nuxt web (frontend)
           +-- Fastify API (private upstream)
                   |-- PostgreSQL 18 + pgvector (private, persistent volume)
                   |-- Ollama (private, persistent model volume)
                   |-- Scento HTTPS API (outbound, permitted requests only)
                   +-- Vault Agent / Vault API (private/existing Vault cluster)
                               |
                               +-- database secrets engine (PostgreSQL credentials)
```

The same-origin gateway must bind to **127.0.0.1** and be exposed privately through **Tailscale Serve HTTPS**; do not use Tailscale Funnel or open a public inbound port. Use explicit grants/ACL rules to restrict allowed devices/users. Tailscale connectivity is an outer network control, **not** application authentication or authorization: Fastify/Nuxt must enforce independent login, secure sessions, and owner-only access. Database, Ollama, API internals and Vault Agent remain private/unpublished. The Mac must be online and reachable; no always-on/offline promise is made.

## Infrastructure-as-Code ownership contract

| Resource / task | Owner | Notes |
|---|---|---|
| Podman machine installation/start | Operator / bootstrap script | Not falsely represented as a Terraform-managed resource |
| Networks and persistent volumes | Terraform | Via provider validated against Podman socket; own resources in one state |
| Workload containers | Terraform **if** provider smoke test passes | Ansible must not independently create/recreate them |
| App/DB schema/configuration/migrations | Ansible + versioned scripts | Idempotent, repeatable, runs after ready checks |
| Vault mount/role policies and app auth | Ansible (approved workflow) | Admin bootstrap done with narrowly scoped operator identity |
| Dynamic DB credentials | Vault | Not stored in Terraform state or Git |
| Stop/start/logs/status | Make + Podman CLI | Runtime operations only; reconcile drift with Terraform plan |
| Manual backups/restore | Make invoking versioned scripts, run explicitly by operator | No scheduled jobs; protect volumes; isolated restore evidence |
| Full destruction | Explicit `make destroy` | Confirmation, backup gate, no accidental volume loss |

**No double ownership:** Never create a Podman Compose stack for the same containers that Terraform manages. If the Docker-compatible provider is incompatible, record an ADR and change Terraform's *resource scope*, with one explicit owner for each resource. Never silently switch tools.

### Podman compatibility gate

The `kreuzwerker/docker` provider speaks the Docker API. Podman Desktop offers a Docker-compatible socket. Compatibility is **not guaranteed** for specific network, image, volume and container fields. `infra/terraform/phase00/` is an isolated resource proof. The user must explicitly set `PODMAN_DOCKER_HOST` to a verified Podman socket before running it. Never assume `/var/run/docker.sock` refers to Podman.

## Application modules

1. **Catalog**: brand identities, fragrance identities, concentration/formulation variants, EAN/GTIN product packages.
2. **Enrichment**: Scento search, exact-match verification, source provenance, human correction; source licensing guard.
3. **Collection**: owned, previous, sampled, wishlist, rejected; historical transitions.
4. **DNA**: top/heart/base, accords, normalized traits, derivations and semantic text embeddings.
5. **Seasons**: four explicit seasonal preference sets; no usage-log dependencies.
6. **Similarity/Discovery**: hybrid structured rules + vector similarity; explain why, never claim objective smell equivalence.
7. **Operations**: health/readiness, backups, migration status, safe admin functions.

## Logical PostgreSQL model

| Entity | Essential fields |
|---|---|
| `brands` | uuid, canonical_name, aliases[] |
| `fragrances` | uuid, brand_id, canonical_name, flanker, concentration, formulation_version, launched_year, source_metadata jsonb |
| `product_variants` | uuid, fragrance_id, gtin_13 UNIQUE nullable, volume_ml, packaging, verified_source |
| `notes` and `fragrance_notes` | canonical note, top/heart/base role, source, confidence/provenance |
| `fragrance_traits` | fragrance_id, trait identifier, score, method, supporting facts |
| `fragrance_embeddings` | fragrance_id, model_id, source_revision, vector(N), generated_at |
| `collection_entries` | uuid, owner_id, fragrance_id, optional product_variant_id, status, rating, personal_notes |
| `collection_events` | entry_id, previous/new status, event_timestamp |
| `season_preferences` | owner_id, season, liked/avoided notes, weights, season_fragrances |
| `source_records` | provider, external_id, source_uri, fetched_at, license_policy, raw_mapped_json |

`vector(N)` dimension depends on the selected *pinned* Ollama model; migrate and reindex intentionally. For modest collection sizes, exact pgvector distances first, index with HNSW only when measurement justifies it. Runtime target is pgvector 0.8.7, whose PostgreSQL 18 container-image availability and ARM64 architecture must be checked and pinned in Phase 00; never assume an unverified image tag exists. Embed canonical, sourced fragrance text, not personal confidential notes.

## Remote access and application identity

Use Tailscale Serve with HTTPS certificates enabled in the operator's tailnet. Verify the FQDN on an approved iPhone and Mac, check grants restricting other nodes, and prove that Funnel is disabled. Keep the local gateway loopback-bound behind Serve, with correct forwarding headers restricted to the trusted proxy. Never trust a caller-supplied identity header as authentication. Implement owner account provisioning (no open sign-up), password hashing (Argon2id or approved equivalent), Secure/HttpOnly/SameSite cookies, server-side session expiry/revocation, CSRF/origin protection and route-level authZ (401 anonymous, 403 forbidden). Secrets needed for server sessions belong in Vault, not in frontend bundles or Git.

## Security and Vault integration

- Use an existing external Vault cluster if reachable and appropriately isolated; do not deploy a second Vault for convenience.
- Application machine auth through Vault Agent with a justified authentication method (AppRole only where securely delivered and rotated; never a permanent root token).
- Vault PostgreSQL database secrets engine creates narrowly scoped dynamic login roles for runtime read/write operations.
- Schema migrations use a **separate** privileged identity; never grant migration/DDL privileges to runtime connections.
- Sensitive Vault bootstrap input stays outside Terraform variables, state, Ansible logs and repositories. Terraform outputs must never expose tokens/passwords.
- Credential rollover must actively refresh/recreate application connection pools. Test expiry, revoke, Vault outage, graceful restart.
- Host/local development bootstrap secret creation is an explicit pre-provisioning step; any password mounted into a container must be handled outside Terraform state, with VM file-sharing behavior verified.
- Secrets must never be passed through container command arguments or logged to console. Use file-based delivery, secure permissions and `no_log` for Ansible tasks that handle secrets.
- Vault availability is a deployment gate in strict mode. A local development-only fallback, if implemented, must be explicitly selected and not silently enabled.

## Persistent data architecture

- PostgreSQL is the sole authoritative home for user collection data and source-corrected fragrance identities. Ollama vectors are derived and regenerable.
- For PostgreSQL 18-based official container images, mount the durable named volume at **`/var/lib/postgresql`** (version-specific `PGDATA` defaults under `/var/lib/postgresql/18/docker`); verify the pgvector image follows that layout in Phase 00. Use a stable project-scoped Podman named volume for `PGDATA`; the volume survives application container recreation but **not necessarily Podman machine deletion**.
- Partition Terraform state/ownership between **data** (`infra/terraform/data`) and replaceable **app** (`infra/terraform/app`) roots. Never include persistent data in `make destroy`.
- Back up **manually** through `make backup`, using a PostgreSQL logical archive on the macOS host outside the Podman VM. The operator manually verifies an independently protected off-device copy and triggers `make restore-test` before real-data import and before risky upgrades. No cron/launchd scheduler or monthly automation is in scope. Data loss since the last backup remains possible.
- Use independent migration/maintenance roles. Implement safe schema migrations, never re-seed personal records, and do not perform implicit destructive changes on startup.
- Protect images/attachments, Terraform state and Vault recovery materials with independent recovery mechanisms; a database dump cannot reconstruct all of them.
- The complete durability contract is in `DATA_PERSISTENCE.md`. The canonical relational/embedding schema is in `DATA_MODEL.md`, the integration contract in `DATA_SOURCES.md`, and Compare in `COMPARE_SPEC.md`. ADR-003 records this decision.

## Observability

JSON logs with request/correlation ID, trace/span ID where possible; never include perfumes' personal notes or secrets without intent. Health vs readiness vs dependency health must be separate. OpenTelemetry hooks can remain disabled until local collection exists, but API boundaries should be instrumentable. No external telemetry by default.

## Quality gates

- Terraform `fmt`, `validate`, `plan`, disposable apply/destroy/idempotency smoke.
- Ansible `syntax-check`, `--check` for supported tasks, second-run idempotency assessment, no secrets in output.
- PostgreSQL schema migrations and extension version checks.
- Scento exact-match negative test (Invictus Elixir must not become Victory Elixir), empty record and rate-limited/upstream down behavior.
- Vault dynamic credentials issuance, renewal/revocation, API pool refresh test.
- Playwright mobile/desktop, responsive shell, glass contrast, offline/degraded UI.
- State and backup validation before destructive operations.

## References

- https://developer.hashicorp.com/terraform/intro/core-workflow
- https://registry.terraform.io/providers/kreuzwerker/docker/latest/docs
- https://podman-desktop.io/docs/migrating-from-docker/managing-docker-compatibility
- https://docs.ansible.com/projects/ansible/latest/collections/containers/podman/
- https://developer.hashicorp.com/vault/docs/secrets/databases/postgresql
- https://github.com/pgvector/pgvector
- https://hub.docker.com/_/postgres
- https://www.scento.com/developers/perfume-api
