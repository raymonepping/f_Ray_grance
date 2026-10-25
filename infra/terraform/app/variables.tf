variable "podman_docker_host" {
  description = "Verified Podman API socket (unix://), proven by scripts/podman_socket.sh"
  type        = string
  validation {
    condition     = startswith(var.podman_docker_host, "unix://")
    error_message = "Only local unix:// Podman sockets are permitted."
  }
}

variable "secrets_dir" {
  description = "Operator-protected host directory holding bootstrap secret FILES (contents never enter Terraform)"
  type        = string
}

variable "pg_image" { type = string }
variable "vault_image" { type = string }
variable "ollama_image" { type = string }

variable "web_image" {
  description = "Gateway image (Caddy + static Nuxt build)"
  type        = string
}

variable "api_image" {
  description = "Fastify API image; empty until Phase 02 builds it"
  type        = string
  default     = ""
}

variable "api_env" {
  description = "Non-secret API settings only"
  type        = map(string)
  default     = {}
  validation {
    condition     = alltrue([for k in keys(var.api_env) : !can(regex("(?i)(password|secret|token)", k))])
    error_message = "Secrets must not be passed to Terraform; deliver them via Vault Agent."
  }
}

variable "vault_agent_enabled" {
  description = "Create fray-vault-agent once Vault is configured (Phase 03)"
  type        = bool
  default     = false
}

variable "gateway_host_port" {
  type    = number
  default = 8470
}

variable "vault_host_port" {
  type    = number
  default = 8270
}

variable "public_origins" {
  description = "Browser origins allowed for state-changing requests (CSRF/origin check). Add the Tailscale Serve HTTPS FQDN in Phase 10."
  type        = list(string)
  default     = ["http://localhost:8470", "http://127.0.0.1:8470"]
}
