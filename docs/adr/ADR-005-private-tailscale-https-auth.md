# ADR-005: Private mobile access through Tailscale Serve, HTTPS and app identity

**Status:** Accepted | **Date:** 2026-10-24 | **Baseline:** v0.1.6

## Decision

- Use **Tailscale Serve** for tailnet-private HTTPS to a gateway bound to 127.0.0.1 on the Mac. **Never use Tailscale Funnel** for this app.
- Explicit access rules constrain the reachable devices/users; do not assume tailnet defaults. Enable MagicDNS and HTTPS certificates only with the operator's approval; HTTPS certificates may cause machine/tailnet DNS names to appear in Certificate Transparency logs.
- Tailscale provides the private network and TLS entrance, **not application authentication/authorization**. F-Ray-grance requires independent owner login, server-side sessions, secure cookie flags and owner checks for every personal API route, including exports and comparisons.
- No public registration in v0.1. No external OAuth/identity provider required. Store password hashes in PostgreSQL, protect server-side signing secrets through Vault, and test lockout/rate limit, CSRF, session expiry and logout.
- Mac sleep/offline means iPhone access is unavailable. The first release does not promise an offline data sync engine.

## Validation

- Approved iPhone: trusted HTTPS origin, successful login, source-backed Collection/Compare and logout.
- Disallowed tailnet identity: no Serve access; direct LAN connection denied.
- Anonymous API: 401; authenticated wrong owner: 403; session expiry/CSRF enforced; proxy headers not trusted blindly.
- Tailnet network changes require explicit operator approval; existing unrelated Tailscale access must be unaffected.

## References

- https://tailscale.com/docs/features/tailscale-serve
- https://tailscale.com/docs/how-to/set-up-https-certificates
- https://tailscale.com/docs/features/access-control
