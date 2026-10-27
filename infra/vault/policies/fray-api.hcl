# fray-api (via Vault Agent / AppRole): runtime DB credentials, session HMAC key and the TinyFish
# web-research key (ADR-013), the ScentRev key (ADR-020), the NoteboxD key (ADR-021) and the Fragella key
# (ADR-022). Read-only.
path "database/creds/fray-runtime" {
  capabilities = ["read"]
}
path "kv/data/fray/session" {
  capabilities = ["read"]
}
path "kv/data/fray/tinyfish" {
  capabilities = ["read"]
}
path "kv/data/fray/scentrev" {
  capabilities = ["read"]
}
path "kv/data/fray/noteboxd" {
  capabilities = ["read"]
}
path "kv/data/fray/fragella" {
  capabilities = ["read"]
}
path "sys/leases/renew" {
  capabilities = ["update"]
}
path "auth/token/renew-self" {
  capabilities = ["update"]
}
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
