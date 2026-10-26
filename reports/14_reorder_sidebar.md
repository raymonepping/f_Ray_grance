# Phase 14: Sidebar order and dividers

Prompt FRAY-CLAUDE-14 ([ADR-015](../docs/adr/ADR-015-sidebar-order.md)). Agent Claude (claude-opus-5-5). Date 2026-10-26. Prerequisite verified: Phase 13 completed, with its commit `84cafd0` on `origin/main`. Phase 10 stays blocked; `last_successful_phase` stays 09.

## Implemented

- **One grouped navigation source** (`apps/web/shared/navigation.ts`): each item has a purpose group; `NAV_GROUPS` gives the order and accessible names; `MAIN_GROUPS` and `UTILITY_NAV` are derived from it. The order is:
  1. Collection, Samples
  2. Discover, Compare
  3. My DNA, My Spectrum
  4. Academy
  5. Settings, in the bottom utility area

  The primary routes keep the spec order (Collection, Discover, Compare, My DNA).
- **Sidebar** (expanded and icon rail): each group is a labelled list with a hairline divider between groups. There are no visible labels above groups, which matches the DESIGN.md rule against eyebrow labels. Settings and the connection status sit in the bottom utility area behind a divider. Active state is unchanged.
- **Mobile drawer:** the same groups and dividers, with Settings last. **Mobile bottom navigation** is unchanged: Collection, Discover, Compare, My DNA.

## Validation

| Check | Result |
|---|---|
| `make validate-docs` (77 frozen docs) | PASS |
| `make test` (web unit tests include the order and group contract: every item in exactly one group, unique routes) | PASS |
| `impeccable detect --json app` | `[]` |
| `make images`, `make recreate SERVICE=web`, `make heal` | PASS |
| `make test-e2e` | **49/49 PASS**. New: groups, order and 3 dividers on the sidebar at 1440 px and on the rail at 1024 px, axe-clean in both themes with no overflow; drawer groups on mobile; bottom navigation keeps exactly the four primary routes. |

Evidence: `reports/evidence/14/`. Synthetic e2e owners are purged after every run.

## Open issues

None for this phase. Phase 10 recovery gates remain operator-dependent.
