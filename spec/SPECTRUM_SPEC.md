# F-Ray-grance | SPECTRUM_SPEC.md

**Version:** 1.0 · 2026-10-26
**Status:** Accepted add-on specification for Phase 13 ([ADR-014](../docs/adr/ADR-014-my-spectrum.md))
**Depends on:** phases 00–09, 11 and 12 completed and pushed

## Purpose

"My Spectrum" shows where the owner's collection sits on a small number of scent spectrums, based only on the fragrances they **own**. Owning samples can optionally be included. It describes what the collection covers. It is not a statement of what the owner likes: ownership never implies liking (see the My DNA rules in `PRODUCT_SPEC.md`).

## Inputs

- Collection entries in state `owned`, plus `sampled` when the owner selects "owned and samples". Wishlist, rejected and previously owned entries are never included.
- For each fragrance: the indicative 0–5 traits from the existing versioned trait method (`trait-method.md`, the same scores shown on fragrance detail and Compare). These are derived from source-listed notes (pyramid or untiered listed notes) and the effective family. Ratings are not used.
- An unknown trait is unknown. It is never counted as 0.

## Spectrums

Two bipolar axes, each from −1 (left pole) to +1 (right pole):

| Axis | Left pole (traits) | Right pole (traits) |
|---|---|---|
| Fresh ↔ Warm | fresh, green, marine/mineral | warm, spicy, smoky |
| Dry ↔ Sweet | woody, aromatic | sweet, gourmand, fruity |

- Pole score = mean of the pole's **known** trait scores.
- A fragrance's position = (right pole − left pole) / 5. It is placed on an axis only when **both** poles have at least one known trait; otherwise it is listed as "not placed" for that axis.
- Collection position = the unweighted mean of placed positions. Spread = the minimum and maximum placed positions.

Each axis also shows how many owned fragrances were placed (coverage). With fewer than 2 placed fragrances, the collection marker is shown with "based on one fragrance".

## Trait readout and families

- For each of the 11 traits: the mean of known scores across the in-scope fragrances, plus `known / total`. A trait no fragrance expresses is shown as "—".
- Families: count per effective family; "Family not listed" is counted separately.

## Presentation

- Page "My Spectrum" (secondary navigation) with the scope switch, the two axes (one tick per fragrance, linking to its detail; the collection marker; the spread band), the trait readout, the family breakdown, coverage, and the method and limitation text.
- Empty state when nothing is owned. It links to Collection and Discover.
- It follows `apps/web/DESIGN.md`: instrument grammar, labels and values readable without colour, lime reserved for verified state only, WCAG 2.2 AA in both themes, 320 px reflow.

## Truth and limits

- The positions are a descriptive heuristic over indicative, method-versioned traits. They are not a measurement or a recommendation. The UI states the method and its limitation.
- No new data leaves the Mac; the computation is local and read-only. No schema change is needed.
