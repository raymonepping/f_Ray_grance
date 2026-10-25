# Phase 08 — Pinned local embeddings and explainable discovery

Prompt FRAY-CODEX-08. Agent Codex. Date 2026-10-25. Predecessor Phase 07 `acadc10fa6a7a8ae4a2b1e1f86c3e91149e8eebe` verified directly on origin/main.

## Implementation

- Local Ollama adapter uses bounded timeouts, verifies model digest before/after generation, and rejects changed model/dimensions, non-finite and zero vectors. Live observed `nomic-embed-text:v1.5` manifest digest `0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f`, dimension **768**. Distinct from the Phase 00 blob digest.
- Owner/CSRF-protected explicit indexing on a verified fragrance. Input is canonical identity plus public provider/official descriptors only; all user-origin claims and personal tables are excluded. Stored metadata includes source revision/hash, model revision/dimensions and generation time. Refresh/reindex is intentional; no model pull or catalog crawling.
- Exact pgvector cosine query joins compatible revision/dimension and validates both current source hashes. Changed source rows never reuse stale vectors. No ANN/HNSW: live 2-row/4-pair query measured **0.297 ms execution**, 0.285 ms planning (`EXPLAIN ANALYZE`); no large-catalog performance claim.
- Similar/different directions use explicit positive ratings, seasonal likes/avoids and source-listed notes/families. Ownership is not liking. Different mode requires preference fit before novelty; avoids/exclusions are enforced. No fake scores on missing vectors or Ollama outage.
- Discover controls and reasons, optional local indexing on detail, and precise text-semantic relatedness labels. Raw vectors and confidential content never reach the browser. Rule formulas and limitations: `docs/discovery.md`.

## Audit fixes

- Found a latent history-ordering defect: `SELECT id::text ... ORDER BY id` sorted the text alias, producing wrong order across digit boundaries. Sort explicitly by the numeric table column; deterministic regression uses IDs of different lengths. No stored data rewritten.
- Enlarged footer links to preferred 44px touch targets after axe exposed insufficient target spacing in populated collection layouts.
- A failing new stale-source test initially omitted required source provenance; fixed the fixture to include an observation, preserving the database integrity constraint.

## Operator scope change

Tailscale was installed and its service started by the operator. Read-only inspection found `NeedsLogin`; the operator then explicitly deferred Tailscale due to IBM enterprise DNS filtering. **ADR-009** records local-only access for this handoff. No sign-in, Serve/Funnel, tailnet/network changes or policy bypass performed. Remote acceptance is DEFERRED, never falsely marked passed. The accepted-document manifest was rehashed for this ADR only.

## Evidence and safety

`make test`: PASS (API **127 tests** plus web 24, typechecks, docs, infra and secret checks). Tests cover digest/dimension rejection, omitted private data, source staleness, owner separation, positive-preference ranking, bounded novelty, avoids and structured outage fallback. Live browser indexing produced two compatible 768-dimensional records and explainable Layton recommendations from a synthetic positively rated Phantom in Red. Data is source-backed catalog content; synthetic personal data is removed after tests.

Normal service health and loopback ingress preserved. Existing accounts, durable data volumes and unrelated stacks untouched. No new schema migration or real-history import. The full browser gate is recorded below after its final observed completion. Manual off-device protection and independent restore still require operator-selected destinations.

Next: Phase 09, four-season choices and safe JSON portability.

Final observed `make test-e2e`: **27/27 PASS**, including both comparison themes, six responsive widths, prior shell/collection regression and live indexing/discovery.
