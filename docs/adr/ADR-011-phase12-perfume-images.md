# ADR-011: Accept Phase 12 (perfume images) for local development

Status: Accepted by explicit operator instruction, 2026-10-25.

The operator added `spec/PERFUME_IMAGE_SPEC.md` and the Phase 12 prompts for Claude and Codex, and instructed: "move on until prompt 12 is finished." This accepts Phase 12 into the execution plan for Claude and Codex, on the same terms as ADR-010:

- It is a local-development exception, not evidence that Phase 10 passed. Phase 10 stays **blocked** on its independent off-device copy and separate restore environment; real-data import stays disabled; remote access stays deferred (ADR-009).
- Phase 12 requires Phase 11 completed and pushed, as its prompt states.
- `PERFUME_IMAGE_SPEC.md` is authoritative for scope: one primary image per fragrance or variant, a trusted source chain, binaries outside Git and outside disposable containers, server-side fetching with SSRF protection and a domain allowlist, no crawling or catalogue mirroring.
- `last_successful_phase` keeps its meaning (highest contiguous completed phase) and cannot move past blocked Phase 10.

IBM Bob's prompt set is unchanged.
