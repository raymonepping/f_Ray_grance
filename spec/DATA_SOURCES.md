# F-Ray-grance | DATA_SOURCES.md

**Version:** 0.1.6 | **Status:** Scento-first design, provider adapter to be implemented

## 1. Product principles

Automatic enrichment is the default. Brand registry is **open**, with acceptance examples from Calvin Klein, Chanel, Davidoff, Dior, Hugo Boss (BOSS/HUGO), Jean Paul Gaultier, JOOP!, Rabanne/Paco Rabanne and Versace. Data enrichment is advisory: the user confirms exact fragrance identity when needed. Never substitute a similar-sounding flanker or concentration.

## 2. Scento contract (verified against docs on 2026-10-24)

- REST API base: `https://www.scento.com/api/perfume/v1`.
- Documented read-only GET endpoints include `/search?q=...&kind=perfume`, `/perfumes/{perfume}`, `/contrast?perfumes=...`, `/perfumes/{perfume}/neighbours`, `/materials/{material}`, and `/houses/{house}`.
- API is free, anonymous and documented via OpenAPI 3.1. No built-in GTIN lookup is documented; local barcode resolution requires a separate identity resolver and verified mapping.
- Terms permit tools that read the API, but forbid overloading, bypassing limits and wholesale copying to rebuild a competing catalog. Cache modestly only for user-initiated lookups and preserve provider attribution and source link. Check current terms during Phase 00 and before expanding usage.
- There is **no guaranteed complete coverage** for newest mainstream releases. Evidence from live checks: Phantom In Red resolves; `1 Million Black`, `1 Million Night Elixir`, `Invictus Elixir` did not resolve to exact records in observed requests (the last returned a distinct `Invictus Victory Elixir` near match). Confirm again at integration time.
- Scento family taxonomy may differ from a manufacturer's: store both with origin instead of silently treating them as interchangeable.

## 3. Resolver state machine

```text
Search user input (brand/name or GTIN)
       -> Local exact canonical/fragrance/variant lookup
       -> Scento search (if unresolved and allowed)
       -> Identity validation (brand + name + flanker + concentration)
       -> EXACT / AMBIGUOUS / NOT_FOUND
       -> EXACT: preview + provenance -> user adds fragrance
       -> AMBIGUOUS: require selection; never auto-merge
       -> NOT_FOUND: manual draft + optional official manufacturer facts
```

A generic search result with a similar name is not sufficient for canonical resolution. A match to `Invictus Victory Elixir` when searching `Invictus Elixir` must be flagged as distinct. Do not let the API's closest-match suggestions become silent replacements.

## 4. Provider adapter interface

- `search({brand,query,locale})` returns candidate identities with source IDs and match reason.
- `fetchProfile(providerId)` returns a typed `SourceProfile` with notes, families, character, wear, attribution, fetchedAt.
- `enrichExact({candidate,confirmedFragranceId})` persists only permitted mapped fields; returns validation and review status.
- `lookupBarcode(gtin14)` first consults local verified GTIN mappings; external resolver only when source and license are expressly approved.
- Boundary includes timeout, retry with backoff for idempotent GET, per-provider rate limiting, cache TTL, no unbounded catalog crawling, typed error states.

Recommended error states: `NO_EXACT_MATCH`, `AMBIGUOUS_IDENTITY`, `SOURCE_UNAVAILABLE`, `SOURCE_RATE_LIMITED`, `SOURCE_SCHEMA_CHANGED`, `SOURCE_TERMS_BLOCK`, `SOURCE_PARTIAL_DATA`.

## 5. Privacy and asset policy

- Do not send collection owner ID, personal ratings, diary text or other local personalization to Scento.
- Do not scrape provider pages to bypass API restrictions.
- Images must be properly licensed or provider-authorized for reuse. In absence of permitted imagery use generic unbranded placeholder silhouettes.
- Original brand, note names and source link are shown alongside normalized analysis. Provider notes are not automatically declared official unless provenance supports that claim.
- Data import is additive and reviewable; removal of a provider never deletes personal edits or collection history.

## 6. Provider contract tests

- Resolve `Rabanne Phantom In Red` with valid pyramid fields and source link.
- Seek `Rabanne Invictus Elixir` and **reject** nearest result `Invictus Victory Elixir` as not exact.
- `1 Million Black` exact lookup may fail; create reviewable local draft without fabricated note entries.
- Test full/partial/missing note pyramid, unexpected JSON schema, slow response, rate limit and network loss.
- Test 9 priority brand aliases and at least one exact family/concentration flanker collision.
- Confirm API rules and cache scope before any automated batch ingestion.

Official documents:
- https://www.scento.com/developers/perfume-api
- https://www.scento.com/terms-of-service#perfume-api
