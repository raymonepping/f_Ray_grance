# F-Ray-grance | SECURITY.md

**Version:** 0.1.6 | **Status:** Security control design; integration/penetration tests pending

## 1. Trust boundaries and threat model

`Approved tailnet client -> Tailscale Serve HTTPS -> loopback-only gateway -> Nuxt/Node API -> private PostgreSQL / Ollama / Vault Agent`. Outbound HTTPS only for approved enrichment. Local browser users also authenticate to the app; network trust does not equal owner identity. The Vault cluster is already deployed independently and **is not managed/destroyed** by this project's Terraform roots.

| Threat | Control | Required check |
|---|---|---|
| Unauthorized network/user access | Loopback-bound gateway, Tailscale Serve (never Funnel), restrictive tailnet grants, **mandatory app owner login even from localhost**, centralized route authZ | Unapproved tailnet client denied; anonymous 401; non-owner 403 |
| Secrets in browser/assets/logs | Secrets remain server-side; static inspection and secret scans | Inspect frontend build, logs and Terraform state |
| Privileged DB credentials leaked | App uses Vault-leased narrow runtime role; migrations via separate schema role | Attempt DDL as runtime must fail |
| Vault lease expires/revoked | Credential manager refreshes DB pool, does not reuse revoked user, fails safely | Revocation/renewal integration test |
| External source poisoning | Typed schema validation; source provenance; human confirmation of identity | Wrong flanker, malformed note payload |
| LLM hallucination / prompt injection | Local model not authoritative; structured evidence checks; do not obey fetched text as instructions | Contradictory retrieved text cannot change DB facts |
| Manual backup theft | Restrict local archive permissions; encrypt/protect the operator-selected off-device copy; guard restore | Manual recovery drill + permissions check |
| Cross-user data exposure (future) | `owner_id` on personal tables, centralized authorization boundary | Security unit tests for future RLS/multi-user |
| CSRF/XSS | SameSite+HttpOnly Secure cookies when HTTPS; CSRF protections on mutations; output escaping, Content Security Policy | Browser E2E tests |

## 2. Vault responsibilities

- Vault Agent auto-auth (AppRole **only if secure initial secret-id distribution and rotation are possible**; otherwise evaluate supported auth appropriate to local deployment).
- Vault PostgreSQL Database Secrets Engine, separate runtime read/write role. Short leases and a predictable credential rollover path tested with Node `pg` pools.
- Separate privileged migration DB identity. Never allow API runtime to create users/extensions or perform schema migrations.
- Optional KV v2 for sensitive bootstrap/app session key (if applicable), Transit for deliberately selected confidential fields only; neither is required just to keep public perfume notes.
- Use `no_log` for Ansible secret tasks, protected filesystem access to Vault Agent rendered material, no sensitive Terraform state. No Vault root token or static DB password in Git/Make command lines.
- Minimize dynamic-role SQL privileges, and ensure Vault's administration DB account is not shared with the application's runtime credentials.
- Vault Agent can renew auth tokens and support secret templating; API must implement safe pool reload/refresh because a rotated file does not change established database connections.
- Never assume connectivity or auth method to the existing Vault cluster until Phase 00 verification.

## 3. Session and API protection

- **Single-user owner login is mandatory even on localhost.** No public registration and no trust-on-first-request. Set up the initial owner through a local, explicit operator bootstrap with a generated/safely entered secret that is never stored in Git, logs or Terraform state.
- Hash passwords with **Argon2id** (or justify equivalent), store only hashes in PostgreSQL, and throttle login attempts. No built-in hardcoded/test account in production.
- Enforce application-level authorization even after successful Tailscale access. Every personal-read and mutation API checks the authenticated owner, not just the browser route. Return 401 for missing/expired session and 403 when identity lacks access.
- Issue opaque server-managed sessions with `HttpOnly`, `Secure` and appropriate `SameSite` cookies over the Tailscale HTTPS origin; enforce CSRF/origin checks and logout/session revocation. Pin trusted proxy and forwarded-header configuration; ignore arbitrary client-provided auth headers.
- Serve only over a verified HTTPS FQDN for remote access, with Tailscale MagicDNS and HTTPS certificate capability enabled. Certificate transparency exposure of tailnet machine DNS names is a documented privacy trade-off.
- Tailscale grants/ACLs are the outer device-network policy, not the application authorization system. Confirm Funnel is disabled and that unapproved tailnet identities cannot reach Serve.
- All collection reads/writes, personal preferences, imports/exports and Compare's seasonal personalization require authorized owner context.
- Strict body/query schemas, limits, timeouts, CSRF protection, rate limits and sensible CORS (default same-origin).
- Validate barcode inputs; never trust candidate identity solely from a valid check digit.
- Do not log user free-text personal notes or provider tokens. Maintain request IDs and operation outcomes without personal content.

## 4. Test gates

- [ ] No secrets in repository, Terraform state (including plan files), environment diagnostics or frontend output.
- [ ] Vault Agent authentication, DB role issuance, renewal, revocation and crash/restart behavior observed.
- [ ] Runtime role denied DDL and superuser rights.
- [ ] Existing Vault stays operational after `make stop`, `make destroy` and test runs.
- [ ] Database/Ollama/Vault Agent not reachable on non-approved network interfaces.
- [ ] Authorization, CSRF/XSS, source poisoning, export permissions and restore security verified.
- [ ] Tailscale Serve HTTPS reachable from an approved iPhone; same-origin session cookies work; camera permissions tested if scanner implemented.
- [ ] Funnel disabled; unauthorised tailnet identities denied; other local network clients cannot reach the gateway directly.
- [ ] Owner login/logout, failed-login rate limit, session expiry/revocation, 401/403 authorization tests and CSRF rejection recorded.

Official references:
- https://developer.hashicorp.com/vault/docs/secrets/databases/postgresql
- https://developer.hashicorp.com/vault/docs/agent-and-proxy/autoauth
- https://developer.hashicorp.com/vault/docs/agent-and-proxy/agent

Official Tailscale references:
- https://tailscale.com/docs/features/tailscale-serve
- https://tailscale.com/docs/how-to/set-up-https-certificates
- https://tailscale.com/docs/features/access-control
