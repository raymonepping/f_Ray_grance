# ADR-009: Defer Tailscale; continue local Mac access

Status: Accepted by explicit operator instruction, 2026-10-25.

The operator installed Tailscale, then instructed: "We will leave Tailscale out.. for now" after IBM's enterprise DNS policy blocked the service as a Personal VPN.

For the current handoff, use the existing loopback-only Mac gateway and independent owner authentication. Do not sign in, enable Serve/Funnel, alter tailnet grants, change enterprise DNS/VPN settings or attempt a filtering workaround. The installed service is left untouched.

Remote iPhone/private HTTPS access is deferred by the owner. This supersedes the requirement to configure or execute Tailscale checks now in ADR-005, Phase 00 gate G00.10 and Phase 10 prompts. It does not constitute a passed remote-access test or claim of full original v0.1 remote-access acceptance. Report those checks as DEFERRED (operator), distinguish local readiness from the original remote release scope, and retain owner auth, CSRF, cookie protections, private internal services and the loopback binding.

No alternative tunnel or public endpoint is introduced. Revisit only on an explicit operator request in an approved environment. All manual backup, independent recovery, exact-identity and data-durability requirements remain in effect.
