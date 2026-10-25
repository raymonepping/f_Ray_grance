# F-Ray-grance | DATA_MODEL.md

**Version:** 0.1.6 | **Status:** Schema design, implementation and migrations pending

## 1. Authority, identity and relationships

PostgreSQL 18 is the authoritative store; pgvector stores generated embeddings *alongside* relational and JSONB data. Ollama embeddings are derived/rebuildable. Source-of-truth personal history and manual corrections must never be overwritten by provider refreshes.

```text
brands 1---N fragrances 1---N product_variants
                    | 1---N source_claims
                    | 1---N fragrance_notes N---1 note_dictionary
                    | 1---N fragrance_trait_scores
                    | 1---N fragrance_embeddings
                    | 1---N collection_entries N---1 owners
                    |                | 1---N collection_events
                    |                +--seasonal evaluations
owners 1---N seasonal_preferences (unique owner+season)
```

## 2. Proposed tables

| Table | Key and important fields | Integrity constraints |
|---|---|---|
| `owners` | `id uuid`, display_name, created_at | Single seeded owner v0.1; no public self-registration |
| `brands` | `id`, `canonical_name`, normalized_name, aliases jsonb | Unique normalized name, never brand-match by case only |
| `fragrances` | `id`, brand_id, canonical_name, normalized_name, flanker, concentration, formulation_revision nullable, year nullable | Unique identity over verified brand/name/flanker/concentration/formulation; no blind fuzzy merge |
| `product_variants` | `id`, fragrance_id, gtin14 nullable, bottle_ml, packaging_type | Validate GTIN check digit, preserve leading zeros, uniqueness for verified active GTIN; separate package from scent |
| `source_records` | `id`, provider, external_id, source_url, checked_at, response_hash, permitted_cache_class, limited mapped fields jsonb | Preserve attribution and applicable usage restrictions; no wholesale mirror |
| `source_claims` | `id`, fragrance_id, source_record_id, field_name, value jsonb, claimed_at | Separate official/provider/user/derived claims |
| `note_dictionary` | `id`, normalized_name, aliases, family nullable | One canonical note per distinct concept; do not collapse accords into individual ingredients |
| `fragrance_notes` | `fragrance_id`, note_id, tier (`top/heart/base`), source_claim_id | Many-to-many, duplicate-safe per claim and tier |
| `fragrance_trait_scores` | `fragrance_id`, trait_code, score nullable 0..5, method_version, confidence_state, source_refs jsonb | Unknown is NULL, not zero; versioned method |
| `fragrance_embeddings` | `fragrance_id`, model_id, model_revision, dimension, source_revision, embedding, generated_at | Dimension/model compatible; only compare vectors sharing model/dimension |
| `collection_entries` | `id`, owner_id, fragrance_id, variant_id nullable, state, rating nullable, personal_note nullable | Rating separate from ownership; no cascade delete of history |
| `collection_events` | `id`, entry_id, from_state, to_state, occurred_at, user_reason nullable | Append-only history, audit source context |
| `seasonal_preferences` | `owner_id`, season, liked_notes jsonb, avoided_notes jsonb, liked_traits jsonb, free_text nullable | Unique owner+season (spring, summer, autumn, winter) |
| `season_fragrances` | `owner_id`, fragrance_id, season, affinity nullable, affinity_origin | Personal explicitly entered ≠ editorial recommendation |

**Collection state vocabulary:** `owned`, `previously_owned`, `sampled`, `wishlist`, `rejected`. History is event-sourced at state-transition level, without requiring the whole app to be event-sourced. Multiple entries for repeat purchases are allowed. If a sampled perfume becomes owned, preserve the test record or transition according to explicit user action.

## 3. GTIN policy

Canonical storage: 14-character string `gtin14` after **verified** normalization (EAN-13 padded with a leading zero). Preserve raw scanned digits for display/diagnostics if desired, but do not strip meaningful zeros. Verify numeric characters and check digit, reject invalid or suspicious barcodes. A valid GTIN does **not** prove name or source authenticity. Manual confirmation is required on uncertain third-party matching.

## 4. Embedding policy

- Local Ollama generates embeddings only from **sourced or curated canonical scent descriptions**, not personal private notes.
- Store model identity, revision, dimensions, input hash/revision, and embedding timestamp; never mix incomparable vectors.
- Choose an embedding model and dimensionality during Phase 00. The physical migration may declare `vector(N)` after measured dimensions; do not hardcode an unverified dimensionality.
- Start exact cosine-distance search for the small catalog and benchmark before enabling ANN/HNSW.
- Use rule-based comparison of notes/traits for explanations, with optional embedding retrieval for discovery candidate generation.
- Raw cosine distance has no scientifically validated equivalence to perceived odor similarity; don't present a misleading `62% scent match`.

## 5. Correction and refresh rules

- Provider refreshes write new source records/claims; **never silently overwrite manual corrections**.
- Human-reviewed canonical corrections create revision metadata and trigger downstream recalculation/re-embedding.
- Keep personal reviews, ratings and seasonal evaluations isolated from public/vendor enrichment calls.
- Reference and collection data can be exported separately; importing must be idempotent and must not duplicate collection history.
- Use migrations with tested rollback/restore policy. Never modify authoritative collections with seed-data resets on startup.

## 6. SQL migration gate

Create `vector` extension on PostgreSQL 18 using an authorized schema-management role; runtime credentials lack CREATE/ALTER/DROP privileges. Test uniqueness constraints, status/event invariants, barcode validation, ratings, unknown traits, and migration from an empty database. v0.1 deliverable must include reproducible schema migrations and a schema version table.

Official references: https://www.postgresql.org/docs/18/ddl.html ; https://github.com/pgvector/pgvector
