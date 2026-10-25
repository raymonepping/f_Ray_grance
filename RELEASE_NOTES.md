# F-Ray-grance | v0.1.6 Documentation Freeze

**Date:** 2026-10-24 | **Release type:** Documentation and agent build prompts | **Runtime:** Not deployed or tested

## Accepted changes since v0.1.5

1. **ADR-005:** Tailscale Serve private HTTPS to a loopback-bound gateway, authorized tailnet clients, independent owner authentication and authorization. No Funnel/public ingress.
2. **ADR-006:** Direct commits/pushes to verified GitHub `origin/main` via `scripts/commit_gh` only. No mandatory pull request, no force-push or branch bypass. Agent state and sanitized reports are tracked; Git is not a database backup.
3. **ADR-007:** Manual PostgreSQL backup, protected independent copy and manual isolated restore only. No cron, launchd, scheduled jobs or claimed 24-hour RPO. Preserve app/data Terraform state split and fail-closed destructive operations.
4. **PHASE_MANIFEST.md:** One authoritative 11-stage lifecycle, phases 00–10, replacing the inconsistent five-stage overview.
5. **All agent prompts:** Updated 33 phase prompts and 3 launchers for the accepted security, branch, recovery and phase contracts.
6. **DESIGN.md:** Session/login states, tailnet online/unreachable UX and honest last-manual-backup status.
7. **Quality & Phase 00:** Added authenticated HTTPS from approved iPhone and denied unauthorized access, manual restore and main-commit validation gates.

## What this release does NOT do

- It does not deploy a container, authorize Tailscale, modify Vault, create user credentials, run an infrastructure plan, back up a database or push GitHub commits.
- It does not assert the iPhone can connect or that backups are currently recoverable. Phase 00 and subsequent tests must establish these facts.
- It does not change the v0.1 product scope: personal fragrance library, Scento enrichment, 2-way Compare, Fragrance DNA and seasonal profiles.

## Getting started

1. Extract the package into a new verified F-Ray-grance GitHub repository without overwriting unrelated work.
2. Run `make validate-docs`, `make help`, and when ready `make doctor` on your Mac.
3. Ensure the repo's verified GitHub origin points to your intended project and your checked-out branch is `main`.
4. Run **one** launcher from `prompts/launchers/` for the corresponding agent. It reads `state/BUILD_STATE.json` if present and otherwise initializes state with zero claimed completion.
5. Follow `PHASE_MANIFEST.md` one phase at a time. Do not import irreplaceable collection data before backup/restore and security tests pass.
