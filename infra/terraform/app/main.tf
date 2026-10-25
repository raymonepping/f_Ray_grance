# F-Ray-grance replaceable application boundary.
# Owns the private network and named workload containers. Durable volumes are
# owned by ../data (separate state) and referenced here by name only.
# No secret values are passed in: the PostgreSQL bootstrap password is a host
# file mounted read-only; Vault keys never touch Terraform.
terraform {
  required_version = ">= 1.10.0"
  backend "local" {}
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "= 4.6.0"
    }
  }
}

provider "docker" {
  host = var.podman_docker_host
}

locals {
  labels = {
    "io.fraygrance.project" = "fraygrance"
    "io.fraygrance.tier"    = "app"
  }
  volumes = {
    pgdata        = "fraygrance_pgdata"
    vault_data    = "fraygrance_vault_data"
    ollama_models = "fraygrance_ollama_models"
  }
  api_enabled   = var.api_image != ""
  agent_enabled = var.vault_agent_enabled
}

# Images are pulled/built by Make (podman, --platform linux/arm64, --format docker).
data "docker_image" "postgres" { name = var.pg_image }
data "docker_image" "vault" { name = var.vault_image }
data "docker_image" "ollama" { name = var.ollama_image }
data "docker_image" "web" { name = var.web_image }
data "docker_image" "api" {
  count = local.api_enabled ? 1 : 0
  name  = var.api_image
}

resource "docker_network" "fraygrance" {
  name = "fraygrance"
  # Podman reads IPAM back as {driver = host-local}; declared to stay drift-free (Phase 00).
  ipam_options = { driver = "host-local" }
  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ---------------------------------------------------------------- PostgreSQL
resource "docker_container" "postgres" {
  name         = "fray-postgres"
  image        = data.docker_image.postgres.id
  restart      = "unless-stopped"
  network_mode = "bridge"
  networks_advanced {
    name    = docker_network.fraygrance.name
    aliases = ["fray-postgres"]
  }
  env = [
    "POSTGRES_PASSWORD_FILE=/run/secrets/pg_superuser",
    "POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --data-checksums",
  ]
  # PostgreSQL 18 image layout: volume root /var/lib/postgresql, PGDATA 18/docker (verified Phase 00).
  volumes {
    volume_name    = local.volumes.pgdata
    container_path = "/var/lib/postgresql"
  }
  volumes {
    host_path      = "${var.secrets_dir}/pg_superuser"
    container_path = "/run/secrets/pg_superuser"
    read_only      = true
  }
  healthcheck {
    test     = ["CMD", "pg_isready", "-U", "postgres", "-q"]
    interval = "10s"
    timeout  = "5s"
    retries  = 6
  }
  dynamic "labels" {
    for_each = merge(local.labels, { "io.fraygrance.service" = "postgres" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ---------------------------------------------------------------- Vault (ADR-008)
resource "docker_container" "vault" {
  name         = "fray-vault"
  image        = data.docker_image.vault.id
  restart      = "unless-stopped"
  command      = ["server"]
  network_mode = "bridge"
  networks_advanced {
    name    = docker_network.fraygrance.name
    aliases = ["fray-vault"]
  }
  env = [
    "SKIP_SETCAP=1",
    "VAULT_ADDR=http://127.0.0.1:8200",
  ]
  # Operator CLI only; loopback-bound, never routed through the gateway/Tailscale.
  ports {
    internal = 8200
    external = var.vault_host_port
    ip       = "127.0.0.1"
  }
  volumes {
    volume_name    = local.volumes.vault_data
    container_path = "/vault/file"
  }
  upload {
    file    = "/vault/config/fray.hcl"
    content = file("${path.module}/../../config/vault.hcl")
  }
  dynamic "labels" {
    for_each = merge(local.labels, { "io.fraygrance.service" = "vault" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ---------------------------------------------------------------- Vault Agent (Phase 03)
# Regenerable volumes (Tier B/C): AppRole delivery and rendered short-lived creds.
resource "docker_volume" "agent_auth" {
  count = local.agent_enabled ? 1 : 0
  name  = "fraygrance_agent_auth"
  # Owned by the agent's uid:gid (vault 100, group 1000 = API's node user) on creation.
  driver_opts = { o = "uid=100,gid=1000" }
  # Podman reads options back with extra UID/GID keys; they only matter at creation.
  lifecycle {
    ignore_changes = [driver_opts]
  }
  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
}

resource "docker_volume" "agent_rendered" {
  count = local.agent_enabled ? 1 : 0
  name  = "fraygrance_agent_rendered"
  # Owned by the agent's uid:gid (vault 100, group 1000 = API's node user) on creation.
  driver_opts = { o = "uid=100,gid=1000" }
  # Podman reads options back with extra UID/GID keys; they only matter at creation.
  lifecycle {
    ignore_changes = [driver_opts]
  }
  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
}

resource "docker_container" "vault_agent" {
  count        = local.agent_enabled ? 1 : 0
  name         = "fray-vault-agent"
  image        = data.docker_image.vault.id
  restart      = "unless-stopped"
  entrypoint   = ["vault"]
  command      = ["agent", "-config=/vault/agent/agent.hcl"]
  user         = "100:1000"
  network_mode = "bridge"
  networks_advanced {
    name    = docker_network.fraygrance.name
    aliases = ["fray-vault-agent"]
  }
  env = [
    "HOME=/tmp",
    "SKIP_SETCAP=1",
  ]
  upload {
    file    = "/vault/agent/agent.hcl"
    content = file("${path.module}/../../config/vault-agent.hcl")
  }
  # AppRole credentials are delivered by Ansible (no_log) into this volume.
  volumes {
    volume_name    = docker_volume.agent_auth[0].name
    container_path = "/vault/auth"
  }
  # Rendered short-lived credentials, shared read-only with the API.
  volumes {
    volume_name    = docker_volume.agent_rendered[0].name
    container_path = "/vault/rendered"
  }
  dynamic "labels" {
    for_each = merge(local.labels, { "io.fraygrance.service" = "vault-agent" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ---------------------------------------------------------------- Ollama
resource "docker_container" "ollama" {
  name         = "fray-ollama"
  image        = data.docker_image.ollama.id
  restart      = "unless-stopped"
  network_mode = "bridge"
  networks_advanced {
    name    = docker_network.fraygrance.name
    aliases = ["fray-ollama"]
  }
  env = [
    "OLLAMA_HOST=0.0.0.0:11434",
    "OLLAMA_KEEP_ALIVE=10m",
  ]
  volumes {
    volume_name    = local.volumes.ollama_models
    container_path = "/root/.ollama"
  }
  healthcheck {
    test     = ["CMD", "ollama", "list"]
    interval = "30s"
    timeout  = "10s"
    retries  = 3
  }
  dynamic "labels" {
    for_each = merge(local.labels, { "io.fraygrance.service" = "ollama" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ---------------------------------------------------------------- API (Phase 02+)
resource "docker_container" "api" {
  count        = local.api_enabled ? 1 : 0
  name         = "fray-api"
  image        = data.docker_image.api[0].id
  restart      = "unless-stopped"
  network_mode = "bridge"
  networks_advanced {
    name    = docker_network.fraygrance.name
    aliases = ["fray-api"]
  }
  env = concat(
    [
      "FRAY_DB_HOST=fray-postgres",
      "FRAY_DB_CREDENTIALS_FILE=/vault/rendered/db-runtime.json",
      "FRAY_SESSION_KEY_FILE=/vault/rendered/session.json",
      # Forwarded headers are trusted only from inside the private project network (the gateway).
      "FRAY_TRUSTED_PROXIES=${one(docker_network.fraygrance.ipam_config).subnet}",
      "FRAY_PUBLIC_ORIGINS=${join(",", var.public_origins)}",
    ],
    [for k, v in var.api_env : "${k}=${v}"],
  )
  dynamic "volumes" {
    for_each = local.agent_enabled ? [1] : []
    content {
      volume_name    = docker_volume.agent_rendered[0].name
      container_path = "/vault/rendered"
      read_only      = true
    }
  }
  healthcheck {
    test     = ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
    interval = "15s"
    timeout  = "5s"
    retries  = 4
  }
  dynamic "labels" {
    for_each = merge(local.labels, { "io.fraygrance.service" = "api" })
    content {
      label = labels.key
      value = labels.value
    }
  }
  depends_on = [docker_container.postgres, docker_container.vault_agent]
}

# ---------------------------------------------------------------- Gateway / web
# Same-origin gateway: static Nuxt build + /api reverse proxy. The ONLY published
# app port, bound to 127.0.0.1 for Tailscale Serve (ADR-005). Never 0.0.0.0.
resource "docker_container" "web" {
  name         = "fray-web"
  image        = data.docker_image.web.id
  restart      = "unless-stopped"
  network_mode = "bridge"
  networks_advanced {
    name    = docker_network.fraygrance.name
    aliases = ["fray-web"]
  }
  ports {
    internal = 8080
    external = var.gateway_host_port
    ip       = "127.0.0.1"
  }
  upload {
    file    = "/etc/caddy/Caddyfile"
    content = file("${path.module}/../../config/Caddyfile")
  }
  dynamic "labels" {
    for_each = merge(local.labels, { "io.fraygrance.service" = "web" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

output "containers" {
  value = compact([
    docker_container.postgres.name,
    docker_container.vault.name,
    docker_container.ollama.name,
    local.agent_enabled ? "fray-vault-agent" : "",
    local.api_enabled ? "fray-api" : "",
    docker_container.web.name,
  ])
}

output "gateway_url" {
  value = "http://127.0.0.1:${var.gateway_host_port}"
}
