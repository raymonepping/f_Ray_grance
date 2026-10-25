# F-Ray-grance | PHASE_MANIFEST.md

**Version:** v0.1.6 | **Status:** Accepted single source of truth for implementation sequencing

This manifest is authoritative for phase IDs, dependencies and required delivery boundaries across `PRODUCT_SPEC.md`, `PHASE_00.md`, `prompts/README.md`, and all Codex / Claude / IBM Bob prompts. Phases are **00 through 10**, executed sequentially, with **one repository writer at a time**. The earlier five-block (00–04) roadmap is superseded and MUST NOT be used as execution state.

| Phase | Focus | Required exit outcome |
|---|---|---|
| 00 | Host and runtime preflight | Versions, Podman socket, Terraform disposable probe, TLS/tailnet and Vault prerequisites documented without falsely claiming running integration |
| 01 | Terraform / Ansible / Podman / Make and persistence boundary | Reproducible resource ownership, separate data/app state, non-destructive lifecycle, operator-invoked backup scaffolding |
| 02 | PostgreSQL / pgvector schema and Node API | Repeatable migrations, authenticated API foundation, synthetic CRUD fixtures |
| 03 | Vault credentials and API authentication/authorization | Least-privilege dynamic PostgreSQL leases, pool rotation, owner login/session/logout, protected API routes |
| 04 | Scento-first search, exact-identity resolution and source provenance | Known exact match and safe unresolved variant; no automatic near-match substitution |
| 05 | Nuxt design system, glassmorphism and responsive app shell | Desktop sidebar / header / footer, mobile nav, protected UI/login states |
| 06 | Collection, historic ownership and testers | Durable owner-scoped CRUD, historical events, permissions enforced |
| 07 | Structured Fragrance DNA and two-way Compare | Sourced pyramids, normalized traits, responsive aligned comparison, deterministic tests |
| 08 | Ollama embeddings and pgvector discovery | Versioned vectors, meaningful comparison metrics, explainable fallback |
| 09 | Seasonal DNA and portability | Four seasons, owned/previously owned differentiation, manual export/import validation |
| 10 | Security, Tailscale HTTPS, disaster-recovery and release gates | iPhone/Mac tailnet access, blocked unauthorized requests, manual off-VM backup & isolated restore, regression evidence |

## Rules

- A successor phase requires its predecessor's redacted report, verified status and corresponding pushed `main` commit. A blocked phase does not advance.
- Phase 00 may record a correctly diagnosed and explicit **BLOCKED** gate if a live external environment is unavailable. It MUST NOT fabricate validation to move to Phase 01.
- Network access via **Tailscale Serve, HTTPS and application-level authentication/authorization** is required for remote iPhone use. Existing Vault and Podman resources from unrelated projects are out of scope.
- **Manual-only backups.** Commands and restoration procedures must work before real collection data is imported, but there is no scheduler, daily job, or invented 24-hour recovery point objective.
- `main` is the **only target branch** for `commit_gh`. No automatic force-push, branch switching, merging, rebasing or CI bypass. Git holds code, sanitized state and reports, **never database backups**.
- v0.1 comparison remains exactly **two fragrances**; no price tracker, spray logging, public sign-up, or mandatory daily journal.

See accepted ADR-005, ADR-006 and ADR-007 for decision rationale and reversal criteria.

## Accepted Phase 11 addendum — ADR-010

Phase 11: Scent Academy and optional local tutor, defined in [SCENT_ACADEMY_SPEC.md](SCENT_ACADEMY_SPEC.md). The operator explicitly authorized local development after reviewing Phase 10's outstanding recovery gates. This exception extends the execution plan to 11 for Codex/Claude while preserving Phase 10's blocked release status, import guard and ADR-009 remote-access deferral. Do not interpret development advancement as release acceptance. All other sequencing rules remain unchanged.
