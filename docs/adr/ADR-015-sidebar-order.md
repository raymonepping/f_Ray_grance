# ADR-015: Accept Phase 14 (sidebar order and dividers)

Status: Accepted by explicit operator instruction, 2026-10-26.

The operator asked for prompt `14_reorder_sidebar.md`: dividers between sidebar items, and a more logical order than the flat list (Collection, Discover, Compare, My DNA, Samples, My Spectrum, Academy, Settings).

## Decision

- Phase 14 is accepted for Claude on the same local-development terms as ADR-010, ADR-011 and ADR-014. Phase 10 stays blocked, and `last_successful_phase` keeps its meaning.
- Navigation is grouped by purpose, with a visual divider between groups. Each group carries an accessible name, but no visible label above it (DESIGN.md: no eyebrow labels).
  1. **Collection**: Collection, Samples (a filtered view of Collection).
  2. **Explore**: Discover, Compare.
  3. **Profile**: My DNA, My Spectrum (both describe the owner and their collection).
  4. **Learn**: Academy.
  5. **Utility** (bottom area): Settings and connection status.
- This amends `spec/DESIGN.md` only where it is silent. Its primary routes keep their order (Collection, Discover, Compare, My DNA), and Settings stays in the bottom utility area. The mobile bottom navigation keeps exactly the four primary routes. The mobile drawer and the collapsed icon rail use the same groups and dividers.
- There is still one navigation source (`apps/web/shared/navigation.ts`); every surface renders from it.
