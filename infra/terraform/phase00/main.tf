# Phase 00 ONLY: disposable proof of Podman Docker-compatible API with Terraform.
# Does not deploy application or handle secrets.
terraform {
  required_version = ">= 1.10.0"
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "= 4.6.0"
    }
  }
}

variable "podman_docker_host" {
  description = "Explicit, operator-verified Unix socket owned by Podman Desktop / Podman machine"
  type        = string
  validation {
    condition     = startswith(var.podman_docker_host, "unix://")
    error_message = "Only local unix:// Podman sockets are permitted in this smoke test."
  }
}

provider "docker" {
  host = var.podman_docker_host
}

resource "docker_network" "probe" {
  name = "f-ray-grance-phase00-net"
  # Podman reads IPAM back as {driver = host-local}; declare it to avoid a
  # forced replacement on every plan (observed Phase 00).
  ipam_options = { driver = "host-local" }
}

resource "docker_volume" "probe" {
  name = "f-ray-grance-phase00-vol"
}

resource "docker_image" "probe" {
  name = "docker.io/library/alpine:3.20"
}

resource "docker_container" "probe" {
  name     = "f-ray-grance-phase00-probe"
  image    = docker_image.probe.image_id
  command  = ["sh", "-c", "sleep 3000"]
  must_run = true
  # Podman reports a custom network_mode back as "bridge", which forces a
  # replacement on every plan. networks_advanced is stable (observed Phase 00).
  network_mode = "bridge"
  networks_advanced {
    name = docker_network.probe.name
  }
  volumes {
    volume_name    = docker_volume.probe.name
    container_path = "/probe"
  }
  labels {
    label = "io.fraygrance.project"
    value = "fraygrance"
  }
}

output "probe_container_name" {
  value = docker_container.probe.name
}
output "probe_network" {
  value = docker_network.probe.name
}
output "probe_volume" {
  value = docker_volume.probe.name
}
