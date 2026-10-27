# fray-vault-agent (ADR-008, spec/SECURITY.md §2). AppRole auto-auth; renders
# short-lived credentials as files the API reads. No token sink is exposed to the
# API: the API never holds a Vault token.
pid_file = "/tmp/agent.pid"

vault {
  address = "http://fray-vault:8200"
  retry {
    num_retries = -1
  }
}

auto_auth {
  method "approle" {
    config = {
      role_id_file_path                   = "/vault/auth/role-id"
      secret_id_file_path                 = "/vault/auth/secret-id"
      remove_secret_id_file_after_reading = false
    }
  }
}

template_config {
  exit_on_retry_failure         = false
  static_secret_render_interval = "5m"
}

# Runtime DB login (fray_runtime member). Agent renews the lease and re-renders
# with new credentials before max_ttl; the API swaps its pool when the file changes.
template {
  destination = "/vault/rendered/db-runtime.json"
  perms       = "0640"
  contents    = <<-EOT
  {{- with secret "database/creds/fray-runtime" -}}
  {"username":"{{ .Data.username }}","password":"{{ .Data.password }}"}
  {{- end -}}
  EOT
}

# Session-token HMAC key. Rotating it (new KV version) invalidates all sessions.
template {
  destination = "/vault/rendered/session.json"
  perms       = "0640"
  contents    = <<-EOT
  {{- with secret "kv/data/fray/session" -}}
  {"token_hmac_key":"{{ .Data.data.token_hmac_key }}","version":{{ .Data.metadata.version }}}
  {{- end -}}
  EOT
}

# TinyFish key for web research and image search (ADR-013). Written by `make tinyfish-key`;
# Ansible creates an empty placeholder so this template always renders. Empty key = feature off.
template {
  destination = "/vault/rendered/tinyfish.json"
  perms       = "0640"
  contents    = <<-EOT
  {{- with secret "kv/data/fray/tinyfish" -}}
  {"api_key":{{ .Data.data.api_key | toJSON }},"version":{{ .Data.metadata.version }}}
  {{- end -}}
  EOT
}
template {
  destination = "/vault/rendered/scentrev.json"
  perms       = "0640"
  contents    = <<-EOT
  {{- with secret "kv/data/fray/scentrev" -}}
  {"api_key":{{ .Data.data.api_key | toJSON }},"version":{{ .Data.metadata.version }}}
  {{- end -}}
  EOT
}
template {
  destination = "/vault/rendered/noteboxd.json"
  perms       = "0640"
  contents    = <<-EOT
  {{- with secret "kv/data/fray/noteboxd" -}}
  {"api_key":{{ .Data.data.api_key | toJSON }},"version":{{ .Data.metadata.version }}}
  {{- end -}}
  EOT
}
template {
  destination = "/vault/rendered/fragella.json"
  perms       = "0640"
  contents    = <<-EOT
  {{- with secret "kv/data/fray/fragella" -}}
  {"api_key":{{ .Data.data.api_key | toJSON }},"version":{{ .Data.metadata.version }}}
  {{- end -}}
  EOT
}
