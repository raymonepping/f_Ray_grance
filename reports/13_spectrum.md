# Phase 13: My Spectrum

Prompt FRAY-CLAUDE-13 ([ADR-014](../docs/adr/ADR-014-my-spectrum.md), [SPECTRUM_SPEC.md](../spec/SPECTRUM_SPEC.md)). Agent Claude (claude-opus-5-5). Date 2026-10-26. Prerequisite verified: Phase 12 completed, with its commit `a4bbea9` on `origin/main`. Phase 10 stays **blocked**; `last_successful_phase` stays 09.

## State

Prompt 13 was added at the operator's request and registered for Claude only (`scripts/prompt_catalog.py`, `prompts/STATE_CONTRACT.md`, `spec/PHASE_MANIFEST.md`; `scripts/state.py` accepts phase 13). ADR-014 and the spec addendum were accepted. Phase 13 was checkpointed `in_progress` under the single-writer lock, then completed.

## Implemented

- **Computation** (`apps/api/src/domain/spectrum.ts`, pure, method `spectrum-v1` over traits `sourced-notes-v1`):
  - two bipolar axes, Fresh ↔ Warm (fresh, green, marine/mineral vs warm, spicy, smoky) and Dry ↔ Sweet (woody, aromatic vs sweet, gourmand, fruity);
  - a pole score is the mean of known traits only;
  - a fragrance is placed only when both poles have a known trait;
  - the collection position is the unweighted mean of placed fragrances, with min/max spread;
  - an 11-trait readout with `known/total`, and family counts with "not listed" kept separate.
  Unknown values are never treated as 0, and ratings are not used.
- **API:** `GET /api/v1/profile/spectrum?scope=owned|owned_and_samples`. It is owner-scoped and read-only, counts several bottles of one fragrance once, and never includes wishlist, rejected or previously owned entries. It reuses the existing effective-profile precedence and the trait derivation shown on fragrance detail and Compare.
- **Web:** a "My Spectrum" page in the secondary navigation, plus a link from My DNA. It includes:
  - the scope switch;
  - the two instrument tracks with graduations, spread band, fragrance ticks and the collection marker;
  - a plain-language reading ("Balanced", "Leans Fresh", "Clearly Warm") with a signed value;
  - coverage ("2/2 placed") and the list of fragrances not placed;
  - a sorted, linked fragrance list per axis;
  - the trait readout, family breakdown, and method and limitation text;
  - an empty state.
  The page states that it describes the collection, not what the owner likes.

## Fixed during validation (from the owner's live use)

- **Web research proposed facts from a different product.** For Dior "Sauvage" (verified Eau de Toilette), the "Sauvage Eau de Parfum" page passed the exact-name check, because the name is a phrase inside it, and offered "Eau de Parfum". Fixes:
  - pages and product names stating a different concentration from the trusted known one are rejected; the fragrance's own name is removed first, so "Boss Bottled Elixir" is not misread as concentration "elixir";
  - only gaps can be proposed or accepted, and the server enforces this;
  - saved values are shown as "Saved", and the message names them.
  The one contradicting research value the owner had saved was superseded (kept in history, not deleted). Regression tests cover the Sauvage and Elixir cases.
- **E2E isolation.** `shell.spec` signs the shared session out, so the spectrum tests sign in themselves. Live-source assertions accept an Open Beauty Facts outage (it answered HTTP 502 during one run).

## Validation

| Check | Result |
|---|---|
| `make validate-docs` (75 frozen docs, 38 prompts) | PASS |
| `make test`: typecheck and API tests on fresh PG18, including `spectrum.test.ts` (hand-checkable positions, placement, means, families, empty state, owner scoping, scope switch, ratings ignored, bottles counted once) and the research regressions; web unit 35/35 | PASS |
| `impeccable detect --json app` | `[]` |
| `make images`, `make recreate SERVICE=api` and `SERVICE=web` | PASS |
| `make test-e2e` | **45/45 PASS**, covering the spectrum empty state and the populated spectrum at 1440 and 390 px, axe-clean in both themes with no overflow, plus the scope switch and links to detail |
| `make health`, `make drift` (data and app), live security probe `p03` | PASS, NO_DRIFT, 39/39 |

Synthetic e2e owners are purged after every run; the real owner account was not modified by tests.

## Truth and limits

The positions are a descriptive heuristic over indicative, method-versioned traits derived from source-listed notes. They are not measurements, not recommendations, and not a statement of preference. Coverage depends on how many owned fragrances have known notes on both sides of an axis; fragrances not placed are listed.

## Open issues and next steps

- With only a few owned fragrances, ticks can overlap. The sorted list below each track always shows the exact values.
- Phase 10 recovery gates remain operator-dependent. There are no further accepted phases.

## Correction (Phase 15)

The [independent review](review_01_14.md) found that this report overstated the plotted ticks: they were decorative, inside an `aria-hidden` track, and only the list below the track linked to detail. The "based on one fragrance" qualification required by the spec was also missing, and a slower response for a scope the owner had already left could replace the current one. All three are fixed and tested in [Phase 15](15_revisions.md) (R6, R7). The text above is left as originally reported.
