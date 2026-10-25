# Ansible configuration (pending Phase 00)

Create `site.yml`, `inventory.ini` and idempotent roles after the Terraform/Podman smoke test and database/Vault bootstrap design are validated. Required future roles: PostgreSQL + pgvector, schema migrations, scoped Vault database engine and auth, Ollama model readiness, app configuration and health. Do not use Ansible to create Terraform-owned containers. The Makefile fails closed until a real playbook exists.
