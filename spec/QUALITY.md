# F-Ray-grance | QUALITY.md

**Version:** 0.1.6 | **Status:** Executable test plan, test implementation pending

## 1. Quality bar

Treat this project as a **data-trust and persistence application** with a premium mobile-first UI. A demo that looks right while losing records, falsely resolving variants or inventing scores is a failed release.

## 2. Required pipelines and tools

| Level | Tooling | Minimum pass condition |
|---|---|---|
| Static | TypeScript strict, ESLint, formatting, dependency review | Zero blocking errors |
| UI components | Vitest + Vue Testing Library where appropriate | Rendering, state, keyboard tests |
| API | Vitest/Fastify injection | Auth, schema, typed errors and pagination |
| Data | PostgreSQL disposable test DB + migration test | Clean migrations, FK, GTIN, history, NULL-vs-zero |
| Enrichment | Scento fixture/contract and live smoke | Exact match, missing, rate-limit, offline path |
| Compare | Deterministic fixtures and Playwright | Same axes, correct notes, no fabricated scores |
| Responsive | Playwright snapshots 320/375/390/768/1280/1440 | No page overflow/clipped labels |
| Accessibility | axe-core + manual keyboard + iOS VoiceOver | WCAG 2.2 AA target |
| Security | Secret scanning, auth/CSRF validation, Vault lease tests | No critical leakage or broken authorization |
| Infra | `terraform fmt/validate/plan`, provider smoke, Ansible syntax/idempotency | Observed success, scoped resources |
| Durability | **manual** off-VM backup, operator-verified off-device copy and isolated restore drill | Referential and user-history integrity verified; no automatic schedule |

## 3. Comparison acceptance matrix (P0)

- [ ] Choose two verified fragrances through page, card, detail and discover.
- [ ] `Invictus Elixir` never silently resolves to `Invictus Victory Elixir`.
- [ ] Pyramid compact and expanded modes retain all known note tiers correctly.
- [ ] Trait axes remain aligned and use identical scoring versions/scales.
- [ ] Unknown scores render as unknown, not zero; no unvalidated similarity percentages.
- [ ] Explanations cite source-backed differences, respect user preference origin and mention limitations.
- [ ] Desktop sidebar / sticky header / flowing footer work with mobile drawer and bottom nav.
- [ ] Glass does not compromise contrast; 200% font zoom/reduced motion support.

## 4. Persistence and outage matrix (P0)

- [ ] Stop/start and API rebuild preserve owned, previous, sample, wishlist and rejected states.
- [ ] DB container recreation with *same stable volume* does not reset state.
- [ ] On macOS, backup archive exists outside Podman VM plus a protected off-device copy.
- [ ] Restore from backup into a newly provisioned disposable database and validate counts, event history, user notes and seasons.
- [ ] PostgreSQL 18 volume root `/var/lib/postgresql` verified for selected runtime image, not assumed from old versions.
- [ ] Approved iPhone can access the app over Tailscale Serve HTTPS, authenticate, and use owner-protected API; disallowed tailnet clients cannot connect; Funnel disabled.
- [ ] Anonymous read/export and state-changing requests fail 401; non-owner requests fail 403; logout/session expiry and CSRF checks pass.
- [ ] GitHub direct `main` push via `commit_gh` includes sanitized state/report, with no force-push or unverified PR/CI success claims.
- [ ] Source unavailable: existing collection and compare stay usable with stale indicator.
- [ ] Ollama unavailable: structured comparisons work; vector-only recommendations degrade visibly.
- [ ] Vault lease revoked: connection refresh path proved without persistent-data modification.
- [ ] `make down`/`make destroy` cannot remove database volume or existing Vault.

## 5. Release evidence required

Produce `reports/PHASE00_VALIDATION.md` and later `reports/V01_ACCEPTANCE.md` with test date, hardware/OS/Podman versions, image digests, Terraform state paths, commands, pass/fail evidence and unresolved issues. In v0.1, do not mark acceptance tests passed based only on written checklists. The documentation package itself is **not deployment evidence**.

Official accessibility reference: https://www.w3.org/TR/WCAG22/

**Manual backup caveat:** No daily/weekly automated backup gate exists; an explicit operator-performed successful backup and isolated restore verification are prerequisites to importing real collection history. The UI cannot promise protection beyond the last verified manual copy.
