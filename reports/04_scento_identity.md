# Phase 04 — Scento-first Search, Exact-Identity Resolver and Source-Provenance Enrichment

**Prompt:** FRAY-CLAUDE-04 (via `prompts/launchers/Claude_START_HERE.md`) · **Agent:** Claude (claude-opus-5-5) · **Date:** 2026-10-25 · **Status:** completed

## Launcher gate

`main`, origin verified; Phase 03 `completed`, commit `83062a2` ancestor of `origin/main`; 0 unpushed; next eligible 04; lock acquired. **CI note:** GitHub's gitleaks workflow failed on `83062a2` (synthetic test password flagged); fixed in this phase and recorded in state (`phases.03.ci = failed`).

## Implemented

| Area | Files |
|---|---|
| Scento adapter | `apps/api/src/providers/scento.ts` — documented GET endpoints only (`/search`, `/perfumes/{slug}`); 5 s timeout; 2 retries with backoff for 5xx/network; 429 → `SOURCE_RATE_LIMITED` (+Retry-After, no retry storm); 401/403/451 → `SOURCE_TERMS_BLOCK`; TypeBox schema validation → `SOURCE_SCHEMA_CHANGED`; local token bucket (1 req/s, burst 8) and 6 h TTL cache for user lookups (no crawling); only the search text is sent, honest user agent; provider id allow-list |
| Brand registry | `domain/brands.ts` — 9 focus brands with aliases (Paco Rabanne→Rabanne, Christian Dior→Dior, BOSS/HUGO→Hugo Boss, JPG→Jean Paul Gaultier, …); open registry for all others |
| Concentrations | `domain/concentration.ts` — maps provider wording; unknown wording → null (original kept as claim), never guessed |
| Resolver | `domain/resolver.ts` — states `exact` / `candidate_needs_review` / `unresolved` / `conflict`; EXACT requires brand (alias-aware) + full normalised name in the listing **and** in the fetched profile, plus agreement with any requested concentration; near matches are listed with an explicit reason and never substituted; verified local identities short-circuit |
| Persistence | `repo/enrichment.ts` — `enrichExact` (verified identity, `source_records` with response hash/attribution/cache class, per-field provider claims, note dictionary + tiered `fragrance_notes`), idempotent per response hash; `refreshFromProvider` supersedes **provider** claims only and refuses identity changes; `addUserClaim` (manual override, never superseded by refresh); `createDraft` (identity only, no notes/traits); `effectiveProfile` (user > official > provider > derived, with source + checked-at) |
| GTIN | resolve by barcode: check digit validated; local verified mapping first; otherwise `NO_APPROVED_BARCODE_RESOLVER` with `checksumValid: true, catalogConfirmed: false` |
| API | `routes/v1/fragrances.ts` — `POST /fragrances/resolve` (name or GTIN), `POST /fragrances/enrich` (server re-verifies the confirmed candidate; mismatch → 409, nothing saved), `POST /fragrances/drafts`, `POST /fragrances/:id/refresh`, `POST /fragrances/:id/claims`, `GET /fragrances/:id/profile`; per-route rate limits |
| Security hardening | owner guard and Origin/CSRF checks moved to `onRequest`: anonymous/forged requests now get 401/403 **before** body validation (previously a 400 could reveal schemas) |
| Fixtures | `apps/api/test/fixtures/scento/` — 5 attributed responses captured 2026-10-25 (README documents terms) |
| Evidence | `scripts/probes/p04_live_enrichment.sh` |

UI review states: the web app is built in Phase 05; the resolver's review/conflict states are exposed through the API contract above and will be rendered there.

## Validation (observed)

| Check | Result |
|---|---|
| `make test` | **PASS** — Vitest **100/100** (22 adapter/resolver contract, 13 enrichment/HTTP, plus earlier suites), gitleaks clean (history + tree) |
| Contract: Phantom In Red exact with full pyramid + source link + attribution | PASS |
| Contract: Invictus Elixir → review, *Invictus Victory Elixir* flagged `near_match` ("extra victory — not the same fragrance") | PASS |
| Contract: listing "Invictus Victory Elixir" contradicted by profile "Invictus Victory" (EDP) → `conflict` | PASS (real Scento inconsistency observed 2026-10-25) |
| Contract: requested concentration ≠ profile → `conflict`; alias brand → exact; 1 Million Black → no exact, no fabricated notes; unknown → `unresolved` | PASS |
| Contract: partial pyramid → exact + `SOURCE_PARTIAL_DATA`, missing tier null; 5xx retry; 429; timeout; network loss; schema change; non-JSON; 451; cache + local budget; outbound request carries only `q` | PASS |
| Persistence: provenance rows; re-enrich idempotent; manual pyramid/family override survives refresh with changed provider data; provider claims superseded not deleted; refresh refused on identity change; profile readable with Scento down (refresh 503 `SOURCE_UNAVAILABLE`); wrong-identity enrich 409 with nothing saved; draft has identity only | PASS |
| GTIN: bad check digit 400; valid unmapped = checksum-valid, not catalog-confirmed; verified mapping exact | PASS |
| `make drift` / `make health` | NO_DRIFT / PASS |

### Live exit gate (real gateway, real Scento API, synthetic owner removed afterwards)

```text
== resolve Rabanne Phantom In Red (live Scento)
state=exact provider=None concentration=None top=None
== resolve Rabanne Invictus Elixir (must NOT become Victory Elixir)
state=candidate_needs_review code=NO_EXACT_MATCH near=[('Invictus Victory Elixir', 'near_match'), ('Million Elixir', 'near_match'), ('Invictus Victory', 'near_match')]
== resolve Rabanne 1 Million Black
state=candidate_needs_review code=NO_EXACT_MATCH
== enrich Phantom in Red
fragranceId=4c1db1d2-ddc1-475c-8d1a-2621e1e10902 created=False partial=False source=https://www.scento.com/perfumes/phantom-in-red-rabanne
== effective profile
status=verified | character:provider, character_words:provider, concentration:provider, family:provider, identity:provider, pyramid:provider, subfamily:provider, wears:provider | checked=2026-10-25T07:53:55.806Z
== enrich wrong identity (Victory record as Invictus Elixir) must be refused
code=CONFLICT scento={'name': 'Invictus Victory', 'house': 'Rabanne', 'concentration': 'eau de parfum'}
synthetic owner probe-a1fd09 removed
db: fragrances=1 verified, notes=10, source_records=1
```

(Second run shown: Phantom In Red now resolves from the verified local identity; first run resolved it from Scento with `provider=phantom-in-red-rabanne concentration=parfum top=['Plum','Saffron','Bergamot']` and enrichment returned `created=True`.)

**Exit gate met:** one verified exact fragrance (Rabanne Phantom in Red, parfum) enriched with 10 sourced notes and 1 attributed source record; Invictus Elixir and 1 Million Black remain explicitly unresolved/in review.

## Findings during the phase

1. Scento's search listing and profile can disagree (name *and* concentration) → profiles are always verified before EXACT.
2. Local Scento budget burst=3 starved normal use (third resolve answered `SOURCE_RATE_LIMITED`) → burst 8, sustained 1 req/s.
3. Body validation ran before auth/CSRF hooks → 400 leaked to anonymous/forged callers → moved to `onRequest` (tests assert 401/403).
4. CI gitleaks failure on the Phase 03 commit (synthetic literal) → runtime-generated test password + fingerprinted `.gitleaksignore`.

## Safety & persistence

- Only catalogue/reference data was written to the live DB (one verified fragrance); no personal collection data; synthetic owners deleted.
- No personal data sent to Scento; provider payloads never forwarded raw to clients; user corrections are never overwritten.

## Next phase

**05 — Nuxt design system, glassmorphism and responsive application shell.**
