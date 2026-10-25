---
name: F-Ray-grance
description: "Scent Spectrometer: a private fragrance-intelligence console read like an instrument."
colors:
  canvas: "#0b0e12"
  panel: "#11151b"
  raised: "#171c24"
  sunken: "#080a0d"
  ink: "#e8edf2"
  ink-2: "#a9b2bd"
  ink-3: "#8a94a1"
  line: "rgba(232, 237, 242, 0.09)"
  line-strong: "rgba(232, 237, 242, 0.2)"
  action: "#e8edf2"
  action-ink: "#0b0e12"
  signal: "#d4ff4f"
  signal-ink: "#0b0e12"
  signal-text: "#d4ff4f"
  warn: "#ffc14d"
  bad: "#ff7a6b"
  tier-top: "#e8edf2"
  tier-heart: "#a9b2bd"
  tier-base: "#6f7b89"
  focus: "#e8edf2"
  chrome: "rgba(11, 14, 18, 0.86)"
  canvas-light: "#eef1f4"
  panel-light: "#ffffff"
  raised-light: "#f7f9fb"
  sunken-light: "#e4e8ec"
  ink-light: "#0c1016"
  ink-2-light: "#3f4a57"
  ink-3-light: "#56616e"
  line-light: "rgba(12, 16, 22, 0.1)"
  line-strong-light: "rgba(12, 16, 22, 0.24)"
  action-light: "#0c1016"
  action-ink-light: "#ffffff"
  signal-light: "#c6f135"
  signal-ink-light: "#0c1016"
  signal-text-light: "#3e5a00"
  warn-light: "#8a5a00"
  bad-light: "#b42318"
  tier-top-light: "#0c1016"
  tier-heart-light: "#56616e"
  tier-base-light: "#98a3af"
  focus-light: "#0c1016"
  chrome-light: "rgba(238, 241, 244, 0.88)"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
    fontFeature: "'ss01', 'cv11'"
  headline:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
    fontFeature: "'ss01', 'cv11'"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
    fontFeature: "'ss01', 'cv11'"
  subtitle:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
    fontFeature: "'ss01', 'cv11'"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "'ss01', 'cv11'"
  body-small:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'ss01', 'cv11'"
  caption:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  button:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 550
    lineHeight: 1
  label:
    fontFamily: "Geist Mono Variable, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.08em"
  readout:
    fontFamily: "Geist Mono Variable, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
  readout-counter:
    fontFamily: "Geist Mono Variable, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
rounded:
  bar: "2px"
  chip: "4px"
  segment: "6px"
  control: "8px"
  panel: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "28px"
  4xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "40px"
  button-quiet:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "40px"
  button-ghost:
    textColor: "{colors.ink-2}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  icon-button:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    size: "36px"
  field:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  bay:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  well:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
  segment-track:
    backgroundColor: "{colors.sunken}"
    rounded: "{rounded.control}"
    padding: "4px"
  segment-item:
    textColor: "{colors.ink-2}"
    typography: "{typography.body-small}"
    rounded: "{rounded.segment}"
    padding: "0 12px"
    height: "32px"
  segment-item-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  nav-item:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  nav-item-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  source-chip:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  identity-verified:
    textColor: "{colors.signal-text}"
    typography: "{typography.readout}"
  identity-unverified:
    textColor: "{colors.warn}"
    typography: "{typography.readout}"
  header-search:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-3}"
    typography: "{typography.body-small}"
    rounded: "{rounded.control}"
    height: "36px"
    width: "288px"
---

# Design System: F-Ray-grance

Scope: the web console in this app (`apps/web`). The product specification in `../../spec/DESIGN.md` stays authoritative for information architecture, navigation structure, behaviour, error states and accessibility; its visual tokens are superseded by this file, as recorded in `../../docs/adr/ADR-012-scent-spectrometer-visual-world.md`. Product truth lives in `PRODUCT.md`; the direction contract lives in `.impeccable/surfaces/app-layouts-default-vue.md`.

## Overview

**Creative North Star: "The Scent Spectrometer"**

Every fragrance is read like a sample on an instrument. The collection is a sample table, a note pyramid is a chromatogram of labelled peaks, and provenance is the calibration line etched beside each reading. The interface is anodised graphite bays with etched hairlines and ice-white ink; in daylight it becomes calibrated lab paper with the same grammar. Nothing decorates: every mark either carries a value, labels a value, or frames a value.

Density is that of a working console, not a showroom. Rows are fixed-column so only the values change between them; rank is carried by weight, case and reversal before size. Measurements, counts, identifiers and peak labels are set in Geist Mono with tabular figures; everything a person reads as language is set in Geist. One phosphor-lime signal exists in the whole system and it means one thing: this identity is verified, or this connection is live.

The system rejects the fragrance category default of bottle-card grids, star ratings and marketing heroes, and the detector rejected decorative grid backgrounds outright. Motion is reserved for state and for one signature moment, The Scan, when a read head sweeps a chromatogram and its peaks appear once.

**Key Characteristics:**
- Graphite bays (dark, default) and lab paper (light) share one token set and one grammar.
- One accent, phosphor lime, reserved for verified identity and live connection.
- Geist for language, Geist Mono for every measurement, count, identifier and peak label.
- Flat, opaque, hairline-bordered panels; only the sticky header is translucent.
- Fixed-column sample tables with etched mono-caps column labels.
- The chromatogram is the signature visual and states what its peak height means.
- Unknown values render as an em dash glyph (U+2014), never as zero or a guess.

## Colors

A near-monochrome graphite and ice-white instrument palette with a single phosphor-lime signal and two strong fault colours.

The dark theme is the default (`:root` and `[data-theme='dark']`); the light theme (`[data-theme='light']`) is the same set of roles under daylight. Keys ending in `-light` in the frontmatter are the light-theme values of the same role. Components use the semantic tokens only, never raw hex, and every text pairing is verified for WCAG 2.2 AA in `test/contrast.test.ts`.

### Primary
- **Phosphor Lime** (`signal`): the verified-identity dot, the live-connection dot in the sidebar, the read head of The Scan, the Verified counter, and text selection. As a fill it always carries `signal-ink`. On lab paper the fill brightens slightly and lime text switches to the deep olive `signal-text-light` so it still passes contrast.
- **Lime Text** (`signal-text`): the word "Verified" and the verified count when lime is set as text.

### Secondary
- **Caution Amber** (`warn`): unverified drafts, degraded connection, warning banners. Always paired with a glyph or an outlined dot and a label.
- **Fault Coral** (`bad`): errors, unreachable Mac, failed saves. Always paired with an icon and words.

### Neutral
- **Instrument Bay Graphite** (`canvas`): the page ground behind every bay.
- **Anodised Panel** (`panel`): the opaque reading surface for tables, pyramids, prose, the sidebar and the bottom nav.
- **Raised Graphite** (`raised`): quiet buttons, the selected segment, the active nav row, row hover (at half strength).
- **Well Black** (`sunken`): inputs, selects, tracks, segment tracks, table header strips and the lower half of the fragrance bay.
- **Ice-White Ink** (`ink`): primary text, the active nav indicator bar, owned status glyph, the filled primary action (`action` with `action-ink` text) and the focus ring (`focus`).
- **Steel Ink** (`ink-2`): secondary text, inactive nav labels, peak labels.
- **Etch Grey** (`ink-3`): column labels, captions, unknown values, placeholders, drawn chevrons.
- **Etched Hairline** (`line`) and **Scale Hairline** (`line-strong`): every border, divider, baseline, zone separator and ruler tick. `line-strong` marks hover and the chromatogram baseline.
- **Tier Ramp** (`tier-top`, `tier-heart`, `tier-base`): a luminance ramp, bright to dim, that inks the top, heart and base zones of a chromatogram. Always labelled, never colour alone. `tier-base` also draws the comparison series in trait bars.
- **Header Chrome** (`chrome`): the translucent fill of the sticky header only.

### Named Rules
**The One Signal Rule.** Phosphor lime appears only for verified identity and live connection state. Status, selection of a nav row, primary actions and decoration never use it; if a screen has no verified or live thing on it, it has no lime.

**The Ink Action Rule.** The filled primary action is ink on graphite (or graphite ink on paper), never a hue. Colour is for state, not for calls to action.

**The Glyph Plus Word Rule.** Status, tier and tone are always carried by a glyph shape and a label as well as colour: filled, half, dashed and struck circles for collection states; a leading rule plus icon for banners.

## Typography

**Display Font:** Geist Variable (with ui-sans-serif, system-ui fallbacks), self-hosted, no external font requests.
**Body Font:** Geist Variable, with stylistic sets ss01 and cv11 on.
**Label/Mono Font:** Geist Mono Variable (with ui-monospace, SF Mono, Menlo).

**Character:** A precise grotesque for language and its mono sibling for readings; the pair looks like one instrument's faceplate. Rank comes from weight (600 headings, 550 buttons, 500 active labels) and from mono caps versus sentence case, before it comes from size.

### Hierarchy
- **Display** (600, 36px, 30px under 768px, 1.15): the fragrance name on its detail page, the one place a sample's identity is the hero.
- **Headline** (600, 28px, 24px under 768px, 1.15, tracked tighter): the page title, one per view.
- **Title** (600, 19px, 1.3): bay and section headings. Bay headers with a toolbar use 17px.
- **Subtitle** (600, 15px, 1.35): sub-section headings inside a bay, such as "Note profile".
- **Body** (400, 15px, 1.55): prose and row names (row names at weight 500). Prose measure is capped at 60 to 68ch.
- **Body Small** (400, 13px): brand and concentration lines, secondary row text, form labels (at weight 500), status labels.
- **Caption** (400, 12px): explanatory footnotes such as the chromatogram height statement and authorship lines.
- **Label** (Geist Mono, 11px, 0.08em, uppercase, etch grey): column labels, axis labels, tier names and readout counter labels.
- **Readout** (Geist Mono, tabular figures, 13px in cells, 11px for peak labels, 22px for counters): values, counts zero-padded to two digits, ratings as "4/5", launch years, method identifiers, version numbers.

### Named Rules
**The Mono Means Measured Rule.** Geist Mono is used only for measurements, counts, identifiers and peak labels. Prose, headings, buttons and form labels are never mono.

**The Label Is Not A Kicker Rule.** Mono caps labels sit on data: column heads, axes, counters, definition terms. They never sit above a page or section heading as an eyebrow.

## Layout

The shell is a channel rail, a thin instrument header and a single content column.

- **Sidebar:** 260px with the Spectral F mark at top-left at 1200px and wider; forced to a 76px icon rail from 768px to 1199px; replaced by a fixed four-item bottom nav (60px rows, safe-area padded) plus a focus-trapped drawer under 768px. Collapsing and expanding snaps between widths with no width transition, and the first paint already has the right width.
- **Header:** sticky, 64px tall (56px under 768px), inside the content column. It holds breadcrumbs or the page title, a 224px to 288px search trigger with its keyboard hint, the theme toggle and at most one primary action.
- **Content:** centred, max 1440px, side gutters of 16px, 24px at 768px and 32px at 1280px. Pages stack their sections with a 20px to 24px gap.
- **Page header row:** the headline and its one-line count on the left, readout counters on the right (hidden under 640px on Collection).
- **Sample table:** one bay holding a filter toolbar, an etched column-label strip and fixed-column rows. At 768px and wider the columns are name (flexible), note profile (132px), status (9rem), rating (4rem), identity (7.5rem) and compare (6.5rem) with 24px gaps; under 768px each row reflows to name with status at the end, then the micro chromatogram and compact identity line.
- **Detail:** a full-width fragrance bay (identity on top, chromatogram in a sunken lower band), then a two-column grid at 1280px (1.6fr reading column, 1fr relationship column). On narrower screens the relationship panel moves first.
- **Rhythm:** a 4px base step (4, 8, 12, 16, 20, 24, 28, 32). Bay padding is 16px to 20px, 28px for the fragrance hero bay. Row height lands near 68px.
- **Touch:** coarse pointers raise every control to 44px.

**The Fixed Column Rule.** In any list of comparable samples the column positions never move between rows; only the values change.

## Elevation & Depth

Depth is tonal and drawn, not lifted. Surfaces are opaque and step from canvas to panel to raised, with sunken wells below; every edge is a 1px hairline. Shadows exist only for things that float above the page.

### Shadow Vocabulary
- **Float** (`box-shadow: var(--shadow-2)`, dark `0 32px 80px -24px rgba(0, 0, 0, 0.85)`, light `0 30px 70px -28px rgba(12, 16, 22, 0.4)`): the mobile drawer, the search dialog, the overlay panel variant and the compare tray. Nothing resting in the page uses it.
- **Selected inset** (`box-shadow: inset 0 0 0 1px var(--line-strong)`): the selected segment in a segmented control, on top of the raised fill.

### Named Rules
**The Opaque Bay Rule.** Every reading surface is opaque with a hairline border and no resting shadow.

**The Single Glass Rule.** Only the sticky header is translucent (header chrome with a 14px blur and 140% saturation). It falls back to the opaque canvas when backdrop-filter is unsupported, when reduced transparency is requested by the system or in settings, and under forced colours.

## Shapes

One corner language, scaled by size: panels at 10px, controls at 8px, segments and small inline buttons at 6px, source and origin chips at 4px, trait bars at 2px. Fully round shapes are kept for tiny status dots, step numbers and the 2px active indicator bars. Disclosures and selects use a drawn chevron (a rotated 7px corner of two 1.5px strokes, or a 2px-stroke SVG chevron in etch grey), never the browser's marker. Chromatogram zones are separated by dashed hairlines; the collection table's column-label strip carries a single ruler layer of 1px ticks every 8px along its bottom edge, 4px tall.

The Spectral F mark is built on a 32-unit grid: a solid stem (the ray) and arms made of spectral lines that step down in length, weight and opacity. It is one colour (currentColor) so it holds in both themes, and it shares this geometry with the favicon.

## Components

### Buttons
Precise and quiet: one shape, three roles.
- **Shape:** gently squared corners (8px), 40px tall (36px in the header and toolbars, 44px on touch), 14px label at weight 550, 8px icon gap.
- **Primary:** ink fill with graphite text. Hover mixes 12% of the canvas into the fill. Pressed nudges down 1px. Disabled drops to 45% opacity.
- **Quiet:** raised fill, ink text, hairline border that strengthens on hover. Used for secondary actions such as "Compare with another fragrance", the compare tray and sign out.
- **Ghost:** no fill, steel ink; hover raises the fill and lifts the text to ink. Used for row actions like "Add" to compare and "Clear".
- **Icon button:** 36px square (44px on touch), transparent until hover, always with an accessible name and a title.
- **Focus:** a 2px ink outline offset 2px on every interactive element.

**The One Primary Rule.** A view has one filled primary action, normally the header action. The compare tray is a secondary control and uses quiet and ghost buttons.

### Segmented Controls
- **Style:** a sunken track with a hairline border and 4px padding; items are 32px tall (36px in forms), 6px corners, steel ink.
- **State:** the selected item gets the raised fill, ink text at weight 500 and the selected inset ring. Used for collection status filters, the status picker, ratings and seasons.

### Cards / Containers
- **Bay:** panel fill, 1px etched hairline, 10px corners, no shadow, 16px to 20px padding. Content that divides a bay uses hairline rules, not nested cards.
- **Well:** sunken fill, hairline border, 8px corners. Holds icons in empty states and lists, and the sidebar connection readout.
- **Subtle:** hairline border on a transparent ground for low-weight grouping.

### Inputs / Fields
- **Style:** sunken well, hairline border, 8px corners, 40px tall, 12px side padding, label above in 13px steel ink at weight 500. Textareas are 96px minimum.
- **Hover / Focus:** hover strengthens the border; focus replaces it with the 2px ink outline.
- **Selects:** native, with the drawn chevron 12px from the right edge.

### Navigation
- **Sidebar rows:** 40px tall, 14px labels, 18px Lucide line icons at 1.75 stroke. Inactive rows are steel ink; hover raises the fill at 60%. The active row gets the raised fill, ink text at weight 500 and a 2px ink bar on its left edge, never lime.
- **Bottom nav:** 11px labels under 20px icons; the active item carries a 2px ink bar on its top edge.
- **Breadcrumbs:** 13px etch grey with mono slashes; the current page is ink at weight 500.
- **Logo:** the Spectral F alone at top-left (34px in the sidebar, 26px in the mobile header, 30px in the drawer) with the accessible name "F-Ray-grance". The written name appears only in the footer and in the sign-in headline.

### Status Marks
- **Collection status badge:** a 10px glyph plus a 13px label. Owned is a filled ink circle, sampled a half-filled circle, wishlist a dashed outline, previously owned an etch-grey outline, rejected a struck etch-grey outline.
- **Identity mark:** verified is a lime dot with a 3px lime halo and "Verified" in lime readout text; anything else is an outlined amber dot with "Unverified draft".
- **Status banner:** a bay with 8px corners, a 3px leading rule in the tone colour, a tone icon, a 14px title at weight 500 and 13px steel body. Announced politely to assistive technology.

### Source Chips
Small readout chips (11px mono, 4px corners, hairline border) name the origin of a fact, such as Scento, official, derived or personal.

### Chromatogram (signature component)
The note profile drawn as a chromatogram trace. Three fixed zones (top, heart, base) separated by dashed hairlines over a `line-strong` baseline, each zone inked with its tier on the luminance ramp, a faint ink area fill under the trace, and one labelled peak per listed note with a 6px tick on the baseline. Peak labels are 11px mono steel ink above each apex. Below, a three-column caption gives each tier's mono label, its zero-padded count and its notes, or "Not listed". Peak height encodes listed order within a tier, not concentration, and every chromatogram states this in a caption next to it. With no pyramid there is no trace.
- **The Scan:** on mount, a 1.5px lime read head sweeps left to right over 1100ms and the trace reveals behind it, then labels fade in. It plays once. Reduced motion shows the finished trace immediately.
- **Micro:** a 132 by 30px ink-only trace per row in the sample table, with a shared footnote under the table.

### Scent Trait Bars
A fixed-axis table on an indicative 0 to 5 scale, same trait order everywhere. Each bar is a 6px sunken track with 2px corners and quiet fifths ticks; the value fills in ink (the second series in `tier-base`), followed by a right-aligned mono value with one decimal. An unknown value shows the em dash glyph in etch grey and no bar. The caption states the scale, the method identifier and what the em dash means.

### Readout Counters
Definition lists at the top right of a page: mono caps labels over 22px tabular values, zero-padded to two digits. Only the verified count may be lime.

### Empty State
A centred bay (max 36rem) with a well-framed icon, a title, a 46ch body and, when there is a next step, one primary action. A single quiet trace silhouette in `line-strong` may run along its top edge.

## Do's and Don'ts

### Do:
- **Do** use the semantic tokens (canvas, panel, raised, sunken, ink, ink-2, ink-3, line, line-strong) for every surface and text colour, in both themes.
- **Do** keep phosphor lime for verified identity and live connection only, with `signal-text` when it is set as text.
- **Do** set measurements, counts, identifiers and peak labels in Geist Mono with tabular figures, and zero-pad counts to two digits.
- **Do** render unknown values as the em dash glyph (U+2014) in etch grey, and say "Not listed" for an unlisted tier.
- **Do** state "Height follows listed order, not concentration" next to every chromatogram.
- **Do** give each view one filled primary action and make everything else quiet or ghost.
- **Do** use drawn chevrons for disclosures and selects.
- **Do** put the etched ruler (1px ticks every 8px) only on the column-label strip of a measurement table.
- **Do** honour reduced motion, reduced transparency and forced colours: The Scan renders finished, the header turns opaque, panels take system colours.

### Don't:
- **Don't** use lime for primary actions, active navigation, success decoration or emphasis.
- **Don't** set prose, headings, buttons or form labels in Geist Mono.
- **Don't** show a zero, a bar or a guessed note where a value is unknown.
- **Don't** add decorative grid, graticule or dot backgrounds to any surface; the light-theme graticule was removed for this reason.
- **Don't** place a second filled primary button in a view, including inside the compare tray.
- **Don't** write the product name beside the logo in the sidebar, drawer or header.
- **Don't** animate the sidebar width; collapse and expand snap.
- **Don't** add resting shadows to bays or make any surface other than the sticky header translucent.
- **Don't** imply concentration with chromatogram peak height, or encode tier by colour alone.
