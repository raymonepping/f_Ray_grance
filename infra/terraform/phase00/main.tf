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
}

resource "docker_volume" "probe" {
  name = "f-ray-grance-phase00-vol"
}

resource "docker_image" "probe" {
  name = "docker.io/library/alpine:3.20"
}

resource "docker_container" "probe" {
  name         = "f-ray-grance-phase00-probe"
  image        = docker_image.probe.image_id
  command      = ["sh", "-c", "sleep 3000"]
  network_mode = docker_network.probe.name
  must_run     = true
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
