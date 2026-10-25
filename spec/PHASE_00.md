# F-Ray-grance | PHASE_00.md

**Version:** 0.1.6 | **Status:** Ready-to-execute validation plan, no execution claimed

## Goal

Demonstrate that the chosen architecture is feasible and that data survives expected lifecycle events before using real collection history.

## Validation sequence

| Gate | Work | Evidence required |
|---|---|---|
| G00.0 | Verify versioned docs and agent consistency with `make validate-docs` | Manifest, local Markdown links, 33 stage prompts and 3 launchers verified |
| G00.1 | Confirm macOS ARM64, Podman machine/socket, Terraform, Ansible, Node >= tested Nuxt 4 requirement and available Vault endpoint | Tool versions, health, verified socket points to Podman not Docker Desktop |
| G00.2 | Disposable Terraform Docker-provider probe on Podman socket | `plan/apply/inspect/destroy` recorded, **without touching shared stacks** |
| G00.3 | PostgreSQL 18 + pgvector >=0.8.7 image availability on ARM64; pin image digest | `SELECT version()` and `SELECT extversion FROM pg_extension WHERE extname='vector'`; inspect volume path `/var/lib/postgresql` |
| G00.4 | Ansible roles in a disposable test environment | First and second run results; no secrets in logs/state |
| G00.5 | Vault Agent auth + dynamic PostgreSQL credentials with scoped grants | Issue, query, renew/revoke, credential refresh and outage results |
| G00.6 | Scento-first provider access and strict entity resolver | Phantom In Red exact; missing 2026 entries safely unresolved; current terms checked |
| G00.7 | Ollama selected local embedding model / observed dimensions | Generate and compare repeatable vectors; record model/dimension/hash, no hallucination claim |
| G00.8 | Nuxt shell proof on mobile/desktop | Glass/readability, sidebar/header/footer and Compare prototype with 2 fixtures |
| G00.9 | **Manual** backup / restore independent of Podman machine | Operator runs `make backup`, manually verifies independent protected copy and `make restore-test` with record verification; no scheduler |
| G00.10 | Tailscale Serve private HTTPS and login design | Confirm MagicDNS/HTTPS eligibility, allowed tailnet clients, Serve vs Funnel, gateway loopback bind, and 401/403/session test plan; real device test may occur at Phase 10 |
| G00.11 | Direct-to-main agent handoff | Verify intended GitHub origin and current branch `main`, protected `commit_gh` behavior and single-writer state contract; no PR is required |

The authoritative phase sequence is **00–10**, defined in [`PHASE_MANIFEST.md`](PHASE_MANIFEST.md). This file covers Phase 00 only and does not replace the subsequent stage acceptance criteria.

## Phase 00 completion conditions

All P0 gates passed or exceptions explicitly accepted with a **documented alternative** (not silently bypassed). No production fragrance history imported before G00.9 and source-identity checks pass. A failed Terraform Docker/Podman provider test triggers ADR revision for resource ownership; do not hand control of identical resources to both Terraform and Compose.

## Important implementation note

The supplied Makefile is a **Phase 00 scaffold**, not a working full stack. `make doctor`, `make help`, and the optional disposable `smoke-*` plan represent its current designed starting point. Provision/configuration/backup/restore targets fail closed until implementation and testing. Real runtime operations must be built and evidenced during Phase 00/01.

## Reports

Required report fields: status (PASS/FAIL/BLOCKED), actual command/output digest, environment version, resource names, notes on failures, security considerations, tested backups and links to resulting test artifacts.
