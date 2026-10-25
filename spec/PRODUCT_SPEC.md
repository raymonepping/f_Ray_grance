# F-Ray-grance: Product vision, architecture & v0.1.6 specification

**Status:** Consolidated product baseline; implementation has not yet been performed  
**Date:** 2026-10-24  
**Motto:** *Don't just track your fragrances. Understand your rotation.*  
**Promise:** *Your Fragrance DNA. Your Collection. Your Seasons.*

## 1. Vision

A self-hosted, mobile-first personal fragrance intelligence application. Understand fragrances, their note pyramids, seasonal affinity and overlap with an owned or previously tested collection. Prefer explainable hybrid comparisons over opaque AI popularity rankings.

## 2. Confirmed scope decisions

- One person first, schema prepared to support additional users later; no public registration in v0.1.
- Brands are **not restricted**. Initial quality test set: Calvin Klein, Chanel, Davidoff, Dior, Hugo Boss (BOSS/HUGO), Jean Paul Gaultier, JOOP!, Rabanne/Paco Rabanne and Versace.
- Auto-enrich via Scento-first provider API, with explicit identity validation, permission-aware source attribution and user correction. No mass mirroring.
- Collection states: owned, previously owned, sampled, wishlist, rejected. A state transition is historical, not destructive.
- Four explicit seasonal profiles. **No mandatory daily wearing diary**.
- Separate facts, derived Scent DNA and personal preferences.
- Barcodes: EAN/GTIN identifies a commercial variant (volume/packaging), NOT the scent formula or individual bottle. Keep internal IDs for fragrance and individual collection record.
- Responsive web experience, mobile-first; native iOS app not in scope. Native phone camera barcode scan remains an enhancement dependent on browser testing.
- **Selected stack:** Nuxt 4 / Vue 3 / TypeScript; Node.js 24 / Fastify; PostgreSQL 18 + pgvector; local Ollama; Vault; Podman; Terraform; Ansible; Make.
- Not a price-alert site, bottle counter, spray tracker or social feed.

## 3. User journeys

1. **Collection**: visual library with statuses, samples, season filters, personal rating and historical ownership.
2. **Discover**: search by brand/name and EAN if known; enrich via Scento; verify exact fragrance; correct incomplete results; add to collection.
3. **Fragrance DNA**: canonical fragrance identity, top/heart/base pyramid, families, accords, normalized trait bars, short reliable descriptions and source badges.
4. **Compare**: select 2 exact perfumes in v0.1 (up to 4 in v0.2); compare families/notes/trait axes; show shared and distinct features, plus optional semantic similarity and understandable explanation.
5. **My DNA**: spring/summer/autumn/winter explicit favorites and avoidances, seasonal fit, personal repertoire and gaps without assuming ownership equals preference.

Detailed UX, glassmorphism, left sidebar, header, footer, navigation states and acceptance criteria are specified in **DESIGN.md**; the normative comparison contract is **COMPARE_SPEC.md**.

## 4. Data contracts

- `brand` → `fragrance` (flanker/concentration/formulation) → `product_variant` (EAN/GTIN, volume/packaging); `collection_entry` references fragrance and optionally variant.
- Preserve Scento official response, manufacturer claims, curated rules and personal perception as separate provenance-scoped sources.
- Never auto-merge a near-name match: *Invictus Elixir* is not *Invictus Victory Elixir*.
- If enrichment cannot find exact identity, create a draft candidate subject to user approval. Never substitute an unrelated similar product.
- `fragrance_embeddings`: model ID, revision, observed dimensions, text source revision, vector and generation timestamp. Vector similarities are semantic text similarities, not measured scent identity.
- Explicit privacy boundaries: personal notes/preferences remain local and are omitted from external enrichment requests unless authorized.

## 5. API outline

- `GET /api/health/live` and `/api/health/ready`
- `GET /api/fragrances?query=` and `GET /api/fragrances/{id}`
- `POST /api/fragrances/resolve` (brand/name/EAN; exact match or review state)
- `POST /api/fragrances/{id}/enrich` (controlled, rate-limited)
- `GET /api/fragrances/{id}/dna`
- `POST /api/compare` (exactly 2 canonical IDs in v0.1; schema permits 2–4 later)
- `GET/POST/PATCH /api/collection` (status, rating, personal annotations)
- `GET/PATCH /api/profile/seasons/{season}`
- `GET /api/discover?mode=similar|different&season=`
- `GET /api/export` and protected import endpoint

API contracts are versioned; provider payloads are never passed directly to the client unvalidated. Authorize every collection mutation even for single-user v0.1.

## 6. Technology and operating decisions

- **ADR-001 accepted:** PostgreSQL 18 + pgvector is the authoritative database; Couchbase removed from the new baseline.
- **ADR-002 accepted intent:** Terraform provision, Ansible configure, GNU Make orchestrate, Podman run; compatibility to be tested in Phase 00.
- **ADR-003 + ADR-007 accepted durability policy:** PostgreSQL data volume isolated from ephemeral application lifecycle; **operator-invoked manual** off-VM backup, independent protected off-device copy and verified restore before real-data onboarding and risky upgrades. No scheduler, daily backup guarantee or automatic rotation. See `DATA_PERSISTENCE.md`.
- Reuse the separately operated Vault service. Apply scoped Vault machine identity and dynamic PostgreSQL secrets, no root token in application configuration.
- No additional vector database or cloud service in v0.1.
- Frontend is themed as premium fragrance intelligence, with left sidebar on desktop, glass header and restrained frosted navigation, full mobile bottom navigation.
- PWA install/offline capabilities are incremental; core mobile browser experience is required over **Tailscale Serve HTTPS** from approved tailnet devices, with **independent app login, secure session and owner authorization**. Mac asleep/offline means remote access is unavailable.
- **ADR-005:** Tailscale Serve (NOT Funnel), HTTPS and explicit Tailscale grants plus app AuthN/AuthZ; no public exposure.
- **ADR-006:** Verified GitHub origin, direct commits/pushes to `main` via `scripts/commit_gh`, with safe staging and no forced updates.
- **ADR-007:** Manual PostgreSQL backup and isolated restore test only, initiated through Make. Git commits do not protect database content.

## 7. Delivery sequence

**Normative reference:** [`PHASE_MANIFEST.md`](PHASE_MANIFEST.md). The **11 implementation phases 00–10** are authoritative. Agent suites, state transitions, reports and release acceptance use these exact IDs; the earlier five-block roadmap is retired. Do not renumber state in an existing repository without a migration plan.

## 8. Definition of done

- Local start/stop/status via Make; no accidental modification of other Podman stacks.
- Terraform plan/apply and Ansible configuration rerunnable and tested for intended idempotency.
- Database schema/pgvector extension and Vault PostgreSQL dynamic credentials validated.
- Original and manual sources retained with provenance; exact fragrance variant never silently substituted.
- Collection, compare and 4-season profile work without Ollama or Scento online.
- `DESIGN.md` mobile and desktop accessibility requirements met; tests cover 390/768/1280/1440 px.
- **Manual** backup produced and restored **outside the original Podman VM**, volumes persistent across rebuilds, protected independent copy confirmed, sensitive Terraform/Ansible material excluded from version control.
- Starting, stopping, upgrading and tearing down stateless containers never destroy fragrance ownership, historical statuses, seasonal preferences or manual corrections.
- No claims of completed deployment prior to execution and observed tests.
- Two-fragrance Compare complies with `COMPARE_SPEC.md`, including compact/expanded note pyramids, aligned trait bars, missing-value semantics, provenance, mobile view and explainable conclusions.

## 9. Non-functional acceptance priorities

- **Data must remain durable:** no default Make target removes PostgreSQL state or its named volume; **one verified operator-triggered** backup outside the Podman VM, a protected independent copy and a successful isolated restore test are release gates. No scheduler and no guaranteed RPO between manual backups.
- **Latency targets (provisional, measure during Phase 00):** cached Collection/Compare views aim for p95 server response <= 500 ms locally; Scento/Ollama enrichment is asynchronous and must not freeze the interface. These are engineering targets, not measured results.
- **Accessible design:** WCAG 2.2 AA target for mobile and desktop; dense scent data uses opaque contrast-tested surfaces, even with glassmorphism in the shell.
- **No fabricated certainty:** no similarity percentage presented as calibrated scent equivalence; unknown trait/notes remain unknown, and user statements remain separate from provider facts.
- **Scope control:** price tracking, daily wearing logs, consumption estimates, 4-way Compare, photo-based bottle OCR, public sign-up and model fine-tuning are post-v0.1.

## 10. Source reference

Read alongside `DESIGN.md`, `COMPARE_SPEC.md`, `DATA_MODEL.md`, `DATA_SOURCES.md`, `ARCHITECTURE.md`, `SECURITY.md`, `DATA_PERSISTENCE.md`, `OPERATIONS.md`, `QUALITY.md`, `PHASE_00.md` and ADRs. The historical v0.1.2 specification is archival, not authoritative after PostgreSQL acceptance.
