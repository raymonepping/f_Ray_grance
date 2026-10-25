# ADR-012: Replace the visual world with "Scent Spectrometer"

Status: Accepted by explicit operator instruction, 2026-10-25.

The operator asked for a console that is "classy, modern, futuristic and sleek", a sharp logo in the top left "instead of the written F-RAY-GRANCE", and a much better overall design, built with the project's impeccable and design-taste skills and verified with Playwright. In the design round they confirmed the product truth as stated, chose **"Replace the visual world"**, chose the **"Spectral F"** logo, and accepted the assigned direction **"Scent Spectrometer"**, built code-led (no generated imagery).

## Decision

- **Visual tokens in `spec/DESIGN.md` are superseded** by the Spectrometer tokens in `apps/web/app/assets/css/tokens.css`: graphite canvas and opaque panels, ice-white ink, one phosphor-lime signal reserved for verified or live state, Geist with Geist Mono for measurements, 10 px panels and 8 px controls. A light "lab paper" theme mirrors it. The navy/gold glass palette is retired; only the sticky header stays translucent, with opaque fallbacks for reduced transparency and forced colours.
- **Everything else in `spec/DESIGN.md` stays authoritative**: information architecture, navigation (sidebar 260 px, rail 76 px, bottom nav under 768 px, one navigation source), one primary header action per view, behaviour and error states, unknown values shown as "—" (never zero), provenance labels, accessibility (WCAG 2.2 AA in both themes, keyboard, reduced motion, 320 px reflow).
- **Logo**: the Spectral F (`apps/web/app/components/brand/SpectralMark.vue`, `public/favicon.svg`) is a geometric F whose arms are spectral lines. It stands alone top-left in the sidebar and drawer, with "F-Ray-grance" as its accessible name.
- **Note profiles are drawn as chromatograms** (`Chromatogram.vue`): one labelled peak per source-listed note in fixed top, heart and base zones, on the tier luminance ramp. Peak height encodes listed order, not concentration, and every chromatogram says so. Unlisted tiers stay flat and labelled "Not listed"; with no pyramid there is no trace at all. The Collection list carries a micro version, backed by the effective pyramid the API now returns per entry (same precedence as the detail profile; no new data is invented).
- The direction contract, product brief and review captures live in `apps/web/PRODUCT.md` and `apps/web/.impeccable/`.

## Consequences

Component tests and the contrast audit now check the Spectrometer tokens, and `e2e/design-review.spec.ts` captures every main screen in both themes at desktop and mobile widths, with axe and an overflow check. No bottle imagery is added; Phase 12 owns perfume images.
