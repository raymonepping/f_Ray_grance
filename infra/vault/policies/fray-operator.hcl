# fray-operator: day-two administration of F-Ray-grance paths only (ADR-008).
# Replaces the initial root token, which is revoked after bootstrap.
path "sys/mounts" { capabilities = ["read"] }
path "sys/mounts/database" { capabilities = ["create", "read", "update", "delete", "sudo"] }
path "sys/mounts/kv" { capabilities = ["create", "read", "update", "delete", "sudo"] }
path "sys/auth" { capabilities = ["read"] }
path "sys/auth/approle" { capabilities = ["create", "read", "update", "delete", "sudo"] }
path "sys/audit" { capabilities = ["read", "sudo"] }
path "sys/audit/*" { capabilities = ["create", "read", "update", "delete", "sudo"] }
path "sys/policies/acl" { capabilities = ["list"] }
path "sys/policies/acl/fray-*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "sys/leases/lookup" { capabilities = ["update"] }
path "sys/leases/lookup/*" { capabilities = ["list", "sudo"] }
path "sys/leases/revoke" { capabilities = ["update"] }
path "sys/leases/revoke-prefix/database/creds/*" { capabilities = ["update", "sudo"] }
path "sys/storage/raft/snapshot" { capabilities = ["read"] }
path "database/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "kv/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "auth/approle/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "auth/token/create" { capabilities = ["create", "update"] }
path "auth/token/renew-self" { capabilities = ["update"] }
path "auth/token/lookup-self" { capabilities = ["read"] }
