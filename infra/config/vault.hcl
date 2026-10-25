# fray-vault server configuration (ADR-008). Non-secret; uploaded by Terraform.
ui            = false
disable_mlock = true

storage "raft" {
  path    = "/vault/file"
  node_id = "fray-vault-1"
}

# Private project network only; host access is published on 127.0.0.1 only.
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

api_addr     = "http://fray-vault:8200"
cluster_addr = "http://fray-vault:8201"
log_level    = "info"
