# Migration job: short-lived migrator DB credentials only. Never granted to the API.
path "database/creds/fray-migrator" {
  capabilities = ["read"]
}
