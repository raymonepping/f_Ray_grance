# ADR-014: Accept Phase 13 (My Spectrum) for local development

Status: Accepted by explicit operator instruction, 2026-10-26.

The operator asked for "My Spectrum (or something similar) that indicates, based on the perfumes that I own, where I am on that spectrum", and asked for a prompt `13_add_spectrum.md` to be added and executed.

## Decision

- Phase 13 is accepted for Claude, on the same local-development terms as ADR-010 and ADR-011. Phase 10 stays **blocked**, `last_successful_phase` keeps its meaning (it cannot move past 09), import stays disabled, and Tailscale stays deferred (ADR-009). IBM Bob's and Codex's prompt suites are unchanged.
- `spec/SPECTRUM_SPEC.md` is authoritative for scope. It is a read-only, owner-scoped view over owned (optionally sampled) fragrances, using the existing indicative trait method and effective families. There are two bipolar axes (Fresh ↔ Warm, Dry ↔ Sweet), a trait readout and a family breakdown. Coverage is shown, and unknown stays unknown.
- Owning is not liking: the view describes the collection, never preferences, and does not use ratings.
- There is no schema change and no external call.
