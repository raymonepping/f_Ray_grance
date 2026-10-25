# Ansible configuration

`make configure` runs `site.yml` on the Mac host. Roles configure services that
Terraform already runs, through `podman exec` and loopback HTTP. Ansible never
creates, starts or removes containers (ADR-002).

| Role | Responsibility |
|---|---|
| `preflight` | Assert project-labelled containers are running; wait for PostgreSQL |
| `postgres_base` | Database `fray`, least-privilege role model, `vector` extension, schema `app`, default privileges; superuser loses its network password |
| `ollama_model` | Pull the pinned embedding model if absent |
| `vault_status` | Report fray-vault seal state (Phase 03 adds policies, engines, AppRole) |

Every role checks state first, so a second run reports `changed=0`. Tasks that
handle secrets use `no_log: true`; no log file is written.
