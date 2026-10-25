# ADR-010: Authorize Phase 11 local development while recovery remains open

Status: Accepted by explicit operator instruction, 2026-10-25.

After the Phase 10 handoff explicitly described the outstanding independently protected off-device copy and separate restore environment, the operator instructed: “Then we can move to 11 now.” This authorizes implementing the existing Scent Academy prompt scope now. It is an exception to the sequential development prerequisite, not evidence that Phase 10 passed.

Phase 11 uses the accepted [Scent Academy addendum](../../spec/SCENT_ACADEMY_SPEC.md). Phases 00–09 remain verified; Phase 10 remains blocked with its recovery evidence and blockers intact. Local development, synthetic fixtures, additive migrations and local deployment may continue. Real-data import stays disabled. Remote access remains deferred under ADR-009. No release-ready, independent backup, production promotion or remote-device test success is implied.

The execution/state contract accepts phase 11 and records this authorization explicitly. `last_successful_phase` continues to mean the highest contiguous completed predecessor; a separately completed Phase 11 cannot move it past blocked Phase 10. Preserve the outstanding release gates until they are actually verified. This decision supersedes Phase 11's former “Phase 10 genuinely completed” prerequisite only for this expressly authorized local development run.
