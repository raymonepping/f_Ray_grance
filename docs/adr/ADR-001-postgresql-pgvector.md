# ADR-001: PostgreSQL + pgvector

**Status:** Accepted  
**Date:** 2026-10-24

## Context
F-Ray-grance needs canonical fragrance identities, EAN variants, collection history, season-specific ratings, JSON enrichment metadata and similarity search. Couchbase Community Edition's vector feature boundaries complicate a frictionless local setup.

## Decision
Use **PostgreSQL 18 + pgvector** as the single application data platform. Persist structured scent attributes in relational tables / JSONB and semantic vectors with model metadata in pgvector. No Qdrant, Weaviate or Couchbase in the initial runtime. Use local Ollama for generating embeddings.

## Consequences
- One primary database and one migration lifecycle; excellent structured joins and transparent SQL filtering.
- Start with exact cosine distance; add HNSW when measured needs justify it.
- Vector dimensions are tied to a pinned embedding model and need explicit reindexing after model changes.
- Vault PostgreSQL database secrets engine can issue runtime DB credentials.
- PostgreSQL and pgvector image/extension compatibility must be tested on Apple Silicon.

## Revisit criteria
Move to dedicated vector infrastructure only after demonstrated accuracy/scale/performance requirements, not speculative complexity.
