# F-Ray-grance PROTECTED data boundary (ADR-003, ADR-008).
# Owns only the durable named volumes. Separate state from the app root; never
# targeted by `make destroy`. prevent_destroy is defence in depth, not a backup.
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

variable "podman_docker_host" {
  description = "Verified Podman API socket (unix://)"
  type        = string
  validation {
    condition     = startswith(var.podman_docker_host, "unix://")
    error_message = "Only local unix:// Podman sockets are permitted."
  }
}

provider "docker" {
  host = var.podman_docker_host
}

locals {
  labels = {
    "io.fraygrance.project" = "fraygrance"
    "io.fraygrance.tier"    = "data"
  }
}

resource "docker_volume" "pgdata" {
  name = "fraygrance_pgdata"
  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
  lifecycle {
    prevent_destroy = true
  }
}

resource "docker_volume" "vault_data" {
  name = "fraygrance_vault_data"
  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
  lifecycle {
    prevent_destroy = true
  }
}

# Tier B (re-downloadable) but kept here so app teardown never re-pulls models.
resource "docker_volume" "ollama_models" {
  name = "fraygrance_ollama_models"
  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
  lifecycle {
    prevent_destroy = true
  }
}

# Tier A (owner data): perfume image originals and derivatives (Phase 12). Metadata lives in
# PostgreSQL; this volume holds the binaries, outside Git and outside any disposable container.
resource "docker_volume" "image_assets" {
  name = "fraygrance_image_assets"
  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
  lifecycle {
    prevent_destroy = true
  }
}

output "volumes" {
  value = {
    pgdata        = docker_volume.pgdata.name
    vault_data    = docker_volume.vault_data.name
    ollama_models = docker_volume.ollama_models.name
    image_assets  = docker_volume.image_assets.name
  }
}
