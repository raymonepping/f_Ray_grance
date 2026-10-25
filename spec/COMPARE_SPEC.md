# F-Ray-grance | COMPARE_SPEC.md

**Version:** 0.1.6 | **Status:** Normative product + design specification | **Date:** 2026-10-24

## 1. Purpose and release scope

Compare is a first-class left-sidebar / mobile-bottom-navigation experience. It must make two fragrance profiles understandable at a glance and show whether they introduce different olfactory characteristics into a collection.

**v0.1 (P0):** exactly **two** canonical, user-confirmed fragrances side by side, sourced note pyramids, normalized traits, written contrasts and season context. **v0.2:** two to four fragrances, saved comparisons, portfolio overlap and novelty experiments. Do not claim v0.2 features are built.

## 2. Access points

- Sidebar / mobile bottom navigation: `/compare`.
- Collection card: `Add to Compare`.
- Detail page: `Compare with...`.
- Discover result: `Compare to a fragrance I own`.
- Selected items persist while navigating during a session. Direct links use `/compare?a={fragrance_uuid}&b={fragrance_uuid}`; validate both IDs on server.
- Replace, clear and swap are available and keyboard-accessible. A==B is rejected with a helpful message.

## 3. Content contract

| Section | v0.1 required fields | Unknown behavior |
|---|---|---|
| Selectors | Exact canonical brand/name/flanker/concentration + selected ID | Explicit selection required |
| Identity | Bottle image if licensed, brand, name, concentration, collection status | Neutral bottle silhouette; `Not recorded` |
| Short scent summary | Family, subfamily if known, source-backed character sentence | `Not available` and source tooltip |
| Pyramid (compact) | Single representative sourced top/heart/base note per fragrance | Unavailable tier says `Not listed` |
| Pyramid (expanded) | All available source-listed notes grouped by tier | Display partial-source notice |
| Trait bars | Sweet, fresh, spicy, woody, warm, same 0-5 relative scale, two aligned bars per row | `—`; never pretend missing=0 |
| Extended traits | Aromatic, fruity, gourmand, smoky, green, marine/mineral when data permits | Hide axes only when both unknown, disclose |
| Explanation | Up to three source-grounded differences and similarities | `Insufficient data for a reliable comparison` |
| Season/moment | User-declared seasonal fit separately from provider editorial suggestion | Unknown season not silently classified |
| Source & method | Origin, checked at, score method, status (official/provider/heuristic/user) | Mark unverified |

A fragrance note may be an accord (e.g. salted mineral accord) and not a literal natural raw material. Preserve the original wording in the detail and canonicalize aliases separately.

## 4. Explicit trait scoring policy

- Display a discretized **indicative 0–5 scale**. Scores must be produced by a versioned, auditable mapping from sourced accords/notes and reviewed editorial descriptions, not arbitrary LLM opinion.
- Store provenance (`source_kind`, `source_id`, `scoring_method`, `method_version`, `observed_at`, `confidence_state`) for each dimension.
- `0` means the reviewed scoring model assessed absence/very-low expression with sufficient evidence; `NULL` means not measured/unknown. Do not interchange them.
- No percentage similarity until calibration against an independently reviewed fragrance-pair evaluation set. pgvector cosine distance expresses semantic text similarity, **not odor similarity**.
- Compare relative traits on the **same axes** and with the **same model version**. If scores use different methods or dates, recalculate or flag incompatible.
- In the explanation, say `according to Scento`, `manufacturer notes`, `estimated trait`, or `your preference` as appropriate. Avoid claiming a particular scent *is* objectively better.

## 5. Layout and interaction

```text
DESKTOP >= 1200
+---------------------+----------------------------------------------+
| LEFT SIDEBAR        | STICKY HEADER: Compare | Search | Add      |
| My Collection       +----------------------------------------------+
| Discover            | Scent A selector      Scent B selector      |
| > Compare           | [Image, identity]     [Image, identity]     |
| My DNA              | Top/Heart/Base        Top/Heart/Base        |
| Settings            | Family & character    Family & character   |
|                     | SWEET  [A bar]         [B bar]               |
|                     | FRESH  [A bar]         [B bar]               |
|                     | SPICY  [A bar]         [B bar]               |
|                     | ... aligned trait rows ...                   |
|                     | What differs? / Which season or moment?      |
|                     | Source notes / scoring information          |
|                     +----------------------------------------------+
|                     | FOOTER: version/privacy/source status       |
+---------------------+----------------------------------------------+
```

Mobile (320–767px): sticky concise selectors below compact header, content in **paired stacked sections**. Keep A/B trait bars on the same row; pyramid cards may stack for readability; never require page-wide horizontal scrolling. Bottom navigation fixed with safe-area inset; compare tray appears above it. The rest of the page has bottom padding equal to controls + safe area.

**Glass rules:** sidebar, header, search/dialog layers and mobile bottom navigation may use restrained translucency (`backdrop-filter`) with an opaque fallback. **Pyramids, trait bars, tables and long explanations use solid or near-opaque backgrounds**. UI never depends on translucency for meaning.

**Color and accessibility:** gold A / blue B are secondary visual cues; all trait bars and legend/labels are textual. WCAG 2.2 AA target, touch targets ideally >=44×44 CSS px, visible focus, keyboard controls, table/text alternatives, reduced motion, 200% text zoom. Color alone may not distinguish A and B.

## 6. API shape

`POST /api/compare`

```json
{
  "fragranceIds": ["uuid-a", "uuid-b"],
  "traitMethod": "normalized-v1",
  "includePersonalSeasonContext": true
}
```

Server returns exactly two canonical identities, their `source/verification` metadata, pyramids, normalized axes (numeric or null), unambiguous shared/unique notes, a structured explanation object with evidence references, and optional user-declared seasonal context. The client does not manufacture missing scores and may not feed a raw third-party response straight into the UI.

Reject invalid/missing/duplicate IDs with typed and accessible errors. Limit identifiers, payload size and abusive request rates. Personal season context requires user authorization, even in single-user mode.

## 7. Explanation logic and acceptance

1. Compare exact canonical note identifiers (including alias handling) and tag similar-but-not-identical accords as such, not as shared identical ingredients.
2. Only discuss a trait difference if both sides have comparably sourced scores; otherwise describe the limitation.
3. Explanation is deterministic/rule-based first; optionally ask local Ollama to turn a **structured evidence object** into prose. Output is checked for unsupported claims.
4. Rotation advice uses explicit preferred seasons or attributed provider wear contexts. It does **not** infer a habit from ownership or create a daily-wear log.

### Acceptance scenarios

- [ ] Rabanne Invictus Elixir versus Phantom In Red: show accurate different note pyramids without silently substituting `Invictus Victory Elixir`.
- [ ] Toggle compact/expanded for each scent, preserve source notes, compare 5 fixed axes and show what each measure means.
- [ ] With missing trait data, show `—`, no fake bar and no invented percentage.
- [ ] Swap preserves data and updates labels, chart order and link.
- [ ] When Scento is unavailable, cached/user-corrected comparison remains readable and shows last verification time.
- [ ] 320, 375, 390, 768, 1280 and 1440 widths: keyboard accessible, no clipped note names; 200% text zoom; contrast-tested glass fallback.
- [ ] Collection and source data are read-only during compare; comparison cannot change history silently.

## 8. Future improvements, explicitly out of v0.1

3–4 comparison columns, saved comparisons, calibrated novelty scores, personal overlap statistics, compare-a-sample-to-entire-collection and optional radar view. Do not prioritize radar over understandable aligned bars.
