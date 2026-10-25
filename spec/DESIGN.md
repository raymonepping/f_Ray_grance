# F-Ray-grance | DESIGN.md

**Version:** 0.1.6-design.1  
**Status:** Design baseline for review; implementation not yet performed  
**Updated:** 2026-10-24  
**Product:** F-Ray-grance, a personal fragrance intelligence application  
**Architecture baseline:** Nuxt 4 / Vue 3 / TypeScript, Tailwind CSS v4, Node.js 24 / Fastify, PostgreSQL 18 / pgvector, Ollama, Scento-first enrichment, HashiCorp Vault, Terraform / Ansible / GNU Make / Podman

> **Don't just track your fragrances. Understand your rotation.**

## 0. Scope, authority, and non-goals

This document is the **source of truth for visual design, interface architecture, and interaction behavior**. The product specification defines the domain, data contracts, security, and release features. Neither document silently overrides the other. Resolve conflicts through an explicit design/architecture decision.

**Confirmed product constraints:**

- Personal, single-user application first; structure can support multi-user later.
- Responsive web app for desktop and mobile, not a native iOS app.
- Remote iPhone access runs through **Tailscale Serve HTTPS** to a loopback-bound gateway; an owner login is required even on an authorized tailnet device. No public site or Tailscale Funnel.
- When the Mac is off/asleep/unreachable, show a clear network-unavailable state. No promised always-on or offline collection sync in v0.1.
- Main experiences: Collection, Discover, Compare, My DNA; Settings is secondary.
- Automatic perfume enrichment, Scento-first, with exact-identity confirmation and source attribution.
- Seasonal preference profiles, not daily check-ins or spray counting.
- Historical collection status matters as much as current ownership.
- Price intelligence and bottle-consumption management are **not** primary design features.
- Brand catalog is open; initial coverage priorities include Calvin Klein, Chanel, Davidoff, Dior, Hugo Boss, Jean Paul Gaultier, JOOP!, Rabanne and Versace.

**Design non-goals:**

- Looking like a perfume shop, retail promotion site, social network, or a generic AI dashboard.
- Excessive blur, unreadable transparent cards, gratuitous animated backgrounds, or decorative gradients everywhere.
- Displaying invented fragrance notes, model-inferred traits as verified facts, or precise affinity percentages without calibration.
- Making a user create a daily usage log to benefit from the product.

## 1. Product personality and design principles

**Personality:** premium, calm, intelligent, editorial, tactile, precise. Evoke a modern fragrance atelier with subtle scientific instrumentation.

1. **The fragrance is the hero.** Images and olfactory properties take priority over system metrics.
2. **Glass is a material, not an effect to apply everywhere.** Use glassmorphism for shell surfaces, overlays, and select feature panels. Data-dense areas use stable solid surfaces.
3. **Information hierarchy beats decoration.** Name > scent family > note signature > personal relationship > optional technical metadata.
4. **Everything important remains understandable without AI.** Unknown data is visible, not fabricated.
5. **Source and personal opinion are distinct.** Official, third-party, inferred, and personal values are visually distinguishable.
6. **Mobile is a primary environment, not an afterthought.** Thumb reach, safe areas, touch targets, and scroll behavior matter.
7. **Beauty and accessibility coexist.** Respect contrast, reduced motion, focus visibility, keyboard navigation, and readable charts.
8. **Quiet confidence.** No emoji-heavy production UI, noisy badges, fake statistics, or competing call-to-action buttons.

## 2. Visual direction

### 2.1 Palette and themes

**Default:** dark navy with muted warm gold. Offer a fully designed light theme from the start, plus a System mode.

| Semantic token | Dark | Light | Usage |
|---|---|---|---|
| `--bg-canvas` | `#101C2B` | `#F6F5F1` | Application canvas |
| `--bg-elevated` | `#203246` | `#FFFFFF` | Solid card / important readable surface |
| `--text-primary` | `#F3F0E9` | `#101C2B` | Headlines and body copy |
| `--text-secondary` | `#B9C8D8` | `#495668` | Secondary explanatory copy |
| `--accent-gold` | `#E3B458` | `#9C641D` | Active accents, labels, highlights |
| `--accent-blue` | `#78A7D2` | `#315E89` | Informational actions and links |
| `--border-subtle` | `rgba(226,239,247,.16)` | `rgba(16,28,43,.12)` | Dividers and panel outlines |
| `--focus-ring` | `#E3B458` | `#315E89` | Keyboard focus treatment |
| `--status-success` | `#7BC9AA` | `#146B4C` | Verified / completed, with text label |
| `--status-warning` | `#FFD28A` | `#945600` | Review needed, with text label |
| `--status-error` | `#FF9B99` | `#A92F2D` | Errors, with text label |

These are **starting design tokens**. Validate rendered text, icon, focus and state contrast on every *composited* glass background. Never assume a token pairing passes because its opaque equivalent passes.

- Primary text aim: WCAG 2.2 AA contrast **at least 4.5:1** for ordinary text.
- Large text aim: **at least 3:1**.
- Non-text controls and meaningful boundaries: **at least 3:1** where applicable.
- Never rely solely on gold vs blue to distinguish fragrance status, note type, or score.
- Avoid bright saturated orange except as a rare deliberate state; warm gold is the primary accent.

### 2.2 Typography

- Interface/body: `Inter`, if approved and bundled, otherwise `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Optional editorial display typeface **only** for page titles and feature moments, after readability/performance review. Do not block v0.1 on a custom font.
- Headings use carefully chosen scale, not arbitrary font-size classes.

| Token | Desktop | Mobile | Weight / line height |
|---|---:|---:|---|
| Display | 40px | 30px | 650 / 1.1 |
| H1 | 32px | 26px | 650 / 1.18 |
| H2 | 24px | 21px | 600 / 1.25 |
| H3 | 18px | 18px | 600 / 1.3 |
| Body | 16px | 16px | 400 / 1.55 |
| Secondary | 14px | 14px | 400 / 1.45 |
| Caption | 12px | 12px | 450 / 1.45 |

Use tabular numbers for percentages, quantities and comparisons. Avoid overlong centered paragraphs. Max editorial text line length: ~68 characters where practical.

### 2.3 Shape, rhythm, and elevation

- Spacing uses a 4px scale: `4, 8, 12, 16, 24, 32, 48, 64`.
- Sidebar group padding: 12px; card padding: 20-24px desktop, 16px mobile.
- Page gutter: 32px desktop, 24px tablet, 16px mobile.
- Card radius: 20px; small controls: 12px; large hero panel: 24px.
- Icon style: consistent Lucide line icons (20px generally), 1.75-2px optical stroke.
- Use one restrained shadow level for elevation and a second for dialogs. No layered neon glows.
- Border usually `1px`. Selected state must combine border, filled background or icon, and a clear text cue.

## 3. Glassmorphism specification

### 3.1 Material roles

| Role | Glass? | Rule |
|---|---|---|
| Left sidebar | Yes | Frosted translucent panel on visually restrained canvas |
| Header | Yes | Frosted, sticky within content column |
| Mobile bottom navigation | Yes | Translucent surface with safe-area padding |
| Hero / featured collection card | Optional | Single prominent frosted panel where content contrast is predictable |
| Search command palette | Yes | High-opacity glass, blur, visible border and solid fallback |
| Filters and popovers | Yes | Higher-opacity overlay for legibility |
| Fragrance details, pyramid, comparison tables | Prefer solid | Never put dense notes or scores on low-contrast glass |
| Footer | Minimal | Solid or subtle translucent, never compete with content |

### 3.2 Initial material recipe

- Dark shell glass fill: `rgba(25, 43, 63, .82)`.
- Light shell glass fill: `rgba(255, 255, 255, .84)`.
- Backdrop blur: **12px default**, **16px maximum** for standard shell panels.
- Edge: subtle 1px border; mild top-left highlight if justified.
- Background behind glass: muted gradients / atmospheric color pools only, without distracting moving particles.
- Do not blur large scrollable tables, whole-page layers, or repeatedly nested glass panels.
- Overlay menus may use more opaque surfaces than navigation because they carry interactive content.

**Fallback:** if `backdrop-filter` is unsupported, blur is disabled, or the user prefers increased contrast, use fully opaque `--bg-elevated` or equivalent accessible surfaces. Avoid content visibility dependent on blur.

**Reference CSS (token-driven, not a mandate to use inline styles):**

```css
:root {
  --glass-dark: rgba(25, 43, 63, .82);
  --glass-light: rgba(255, 255, 255, .84);
  --glass-blur: 12px;
}

.glass-shell {
  background: var(--glass-dark);
  border: 1px solid rgba(226, 239, 247, .16);
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
}

[data-theme="light"] .glass-shell {
  background: var(--glass-light);
  border-color: rgba(16, 28, 43, .12);
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-shell { background: var(--bg-elevated); }
}

@media (prefers-reduced-transparency: reduce) {
  .glass-shell { background: var(--bg-elevated); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
```

`prefers-reduced-transparency` support varies by browser. Also provide an explicit **Reduce transparency** user setting, persisted locally; this is the dependable fallback.

## 4. Global application shell

### 4.1 Desktop: >= 1200px

**Persistent left sidebar + main content column + sticky header + footer below content**.

```text
┌───────────────────┬─────────────────────────────────────────────────────┐
│  F-RAY-GRANCE  🧬  │  GLOBAL HEADER                                       │
│  Search (⌘K)      │  Context / breadcrumbs    Search   Add   Theme      │
│                   ├─────────────────────────────────────────────────────┤
│  COLLECTION       │  PAGE HEADING + SINGLE PRIMARY ACTION                │
│  Discover         │                                                     │
│  Compare          │  Hero / overview (optional)                           │
│  My DNA           │                                                     │
│                   │  Main cards, scent pyramid, charts, data views       │
│  ──────────────   │                                                     │
│  Recently viewed  │  Content may scroll vertically                       │
│                   │                                                     │
│  Settings         ├─────────────────────────────────────────────────────┤
│  Collapse ◀       │  FOOTER: app version, sources, privacy, status        │
└───────────────────┴─────────────────────────────────────────────────────┘
```

- Sidebar expanded width: **260px**. Collapsed icon rail: **76px**. User choice remembered across visits.
- Sidebar is vertically sticky/full-height (`100dvh`). Its own overflowing menu scrolls independently.
- Main content has `max-width: 1440px` inside the available content column and horizontal gutters. Avoid unnecessarily wide text.
- Header height: **72px**, sticky at top of the main content column. Header does not overlay the sidebar.
- Header background becomes slightly more opaque when content scrolls beneath it; no abrupt change.
- Footer is **in normal document flow**, following the page content. Do **not** pin it over collection cards or forms.
- Use semantic landmarks: `aside/nav`, `header`, `main`, `footer`.
- Content should remain functional with the sidebar collapsed.

**Left sidebar order:**

1. Product logo/wordmark and compact collapse control.
2. Global fragrance search trigger, with `⌘K` (Mac) / `Ctrl+K` (Windows/Linux) hint where supported.
3. Primary routes: Collection, Discover, Compare, My DNA.
4. Optional Recent fragrances area, displayed only when populated and not overloading the sidebar.
5. Bottom utility area: Settings, Theme toggle, app/environment status. No unnecessary user avatar until multi-user exists.

Active route shows a restrained gold/blue indicator plus readable label, never color alone. Compare may show a small selection count, but not an attention-grabbing badge on every route.

**Header content:**

- Left: breadcrumb or current section label. On detail pages: `Collection / Brand / Fragrance` in desktop view.
- Center (if space): search affordance.
- Right: global Search, Scan/Add Fragrance, Theme toggle, and optional Help.
- **One primary action per view**. In Collection, use `Add fragrance`. In detail, use `Add to collection` or `Edit collection status` depending on ownership state.
- Header actions do not duplicate every navigation item from the sidebar.

**Footer content:**

- Left: `F-Ray-grance` and app version (e.g. `v0.1.3`).
- Center: `Data sources`, `Privacy & provenance`, optional documentation.
- Right: compact `Local / Sync status`, only if truthful and useful. No fake security or freshness claims.
- Footer must collapse into stacked/centered text on narrow widths and must not introduce a second navigation system.

### 4.2 Tablet: 768px to 1199px

- Sidebar becomes a persistent **76px icon rail**, expandable as an overlay if necessary; labels available through tooltip and accessible name.
- Main header remains sticky at **64px**.
- Two-column collection where image/card widths permit. Charts and detailed comparison may use horizontal scroll **within their own region**.
- If space is insufficient, collapse filters into a filter sheet instead of squeezing the content.

### 4.3 Mobile: < 768px

- **No permanently visible left sidebar**, to protect content width.
- Top header **60px**, with wordmark / page title, search icon and menu button.
- Bottom navigation contains **Collection, Discover, Compare, My DNA**, always reachable and labeled. Settings lives in a drawer opened from the header.
- Opening the menu presents a left-side **glass drawer** containing the same navigation categories, secondary settings and shortcuts. Drawer's overlay traps focus, locks background scrolling, closes on Escape / backdrop press, restores focus to trigger.
- Primary add action is clearly available in the header or the context area, **not** obscured behind a floating button over bottom navigation.
- Respect `env(safe-area-inset-bottom)` for devices with a home indicator and `100dvh` for mobile dynamic chrome.
- Sticky compare tray appears only when ≥1 fragrance is selected, positioned **above** the bottom navigation, with a visible clear action; never blocks page content.
- Minimum interactive hit area **44 x 44 CSS px preferred**, with WCAG AA minimum target-size rules as a floor.
- Do not force two-column data-density on phone screens. Favor stacked note sections and swipeable comparison panels with visible position indicators.
- No horizontal page overflow at 320px or wider.

### 4.4 Responsive quick reference

| Range | Navigation | Header | Collection columns | Compare |
|---|---|---|---|---|
| 320-479 | Bottom + drawer | 60px | 1-2, depending on card minimum | One focused card + explicit switch |
| 480-767 | Bottom + drawer | 60px | 2 | Swipeable / stacked differences |
| 768-1199 | Collapsed left rail | 64px | 2-3 | Two visible when possible |
| >=1200 | Expanded/collapsible sidebar | 72px | 3-4 | 2 aligned columns in v0.1 |

Breakpoints are design defaults, not a substitute for container queries and actual content measurements.

## 5. Navigation, routes and information architecture

| Route | Label | Purpose | Primary action |
|---|---|---|---|
| `/collection` | My Collection | Current, previous, sampled, wanted, rejected | Add fragrance |
| `/fragrances/:slug` | Fragrance Detail | Rich notes, provenance, personal state, DNA | Add/Edit status |
| `/discover` | Discover | Name/brand/GTIN search and similar/contrasting scents | Explore fragrance |
| `/compare` | Compare | 2 fragrances in v0.1; 4 in v0.2 | Change selection |
| `/dna` | My DNA | Seasonal preferences and collection profile | Edit seasonal preferences |
| `/settings` | Settings | Appearance, data export, source/AI diagnostics | Manage preferences |

A deep-linked fragrance page should render meaningfully without navigating through Collection first. Unknown fragrance slug → useful not-found state with search action.

## 6. Screen-by-screen UX specification

### 6.1 My Collection

**Above the fold:** `My Collection` title, owned count (truthful), prominent search, and Add Fragrance action. Avoid charts and banners that push the perfumes below the fold.

- Gallery is default, optionally switch to list view; preference persisted locally.
- Cards show bottle image (licensed/permitted or placeholder), brand, full fragrance name, concentration if available, relationship status, and optional seasonal tags.
- Status filters: `Owned`, `Previously owned`, `Samples`, `Wishlist`, `Rejected`, `All`.
- Search by normalized brand, fragrance name, aliases, and EAN/GTIN when linked.
- Filters by family, character, season, year if known. Never prefill a missing value to improve a filter count.
- Empty collection: one high-quality onboarding surface explaining `Search → Verify → Add`.
- Unknown photo: elegant bottle silhouette / neutral material, never a mismatched generic branded bottle.
- Historical statuses must remain visible when desired; do not permanently hide past fragrances.

### 6.2 Fragrance Detail

Desktop: image/identity on left, note pyramid and scent narrative central, personal state/season sidebar on right as space allows. Mobile: stacked identity, personal state, notes pyramid, characteristics, provenance.

Required sections in order:

1. **Identity:** Brand, canonical fragrance name, concentration, optional year, variant confirmation; do not confuse 50/100/150ml packaging with distinct scent identity.
2. **Collection relationship:** Owned, Previously owned, Sample, Wishlist, Rejected, or not in collection; explicit edit history where available.
3. **Olfactory pyramid:** Top, Heart, Base. Show note names, accessible icons/short labels, and confidence/source distinctions. Do not use official terms if only inferred.
4. **Scent character:** Concise human-readable paragraph of verified facts and clearly labeled derived interpretation.
5. **DNA signature:** Shared normalized trait axes, with legend and source/estimation tooltip.
6. **Seasonal fit:** Four seasons, grounded in explicit user preferences and clearly marked provider suggestions, if any.
7. **Compare / Similar / Different:** Strongly separated actions and explanations.
8. **Provenance:** Source URLs, fetched date, field origin and corrections. Display expandable detail, not clutter on every card.

No numerical fragrance compatibility percentage without a validated calibration. Favor labels like `Shares saffron and amber characteristics`, `More aromatic`, or `Not enough data`.

### 6.3 Compare

- Compare **exactly two verified fragrance identities in v0.1** (up to four in v0.2), never ambiguous search strings.
- Comparison tray stays available while browsing and supports removing or replacing individual entries.
- Desktop: aligned cards with each note tier, common/unique notes, stable shared 0-5 trait axes, character descriptions.
- Mobile: show two selected fragrances at a time or a clear card-switching pattern. Do not make users pinch-zoom a full desktop matrix.
- Use consistent axes and chart ranges across all fragrances.
- Text/table equivalents accompany radar visualization. Never ask users to decode shape/color alone.
- Sections: Shared notes, Unique notes, Trait differences, Family, Seasonal preferences, Provenance.
- Similarity is an evidence-based comparison; semantic vector score is optionally exposed as `Semantic relatedness`, not objective olfactory truth.

### 6.3.1 Compare: required v0.1 interaction specification

The complete functional and visual contract lives in [`COMPARE_SPEC.md`](COMPARE_SPEC.md) and takes precedence over any shorthand in this document.

**Fixed comparison order:**

1. Sticky selectors labelled *Scent A* and *Scent B* with search-and-select; selected identity includes house, complete name and concentration.
2. Identity cards with image or neutral fallback, collection state and provenance. Don't imply a verified image when none is licensed.
3. Compact scent pyramid (one **representative** top, heart and base note, chosen only from known source data), with a switch to the complete source-listed pyramid. If a tier is unknown, show `Not available` rather than choosing a fabricated note.
4. Family and character summary, including a clear distinction between provider taxonomy and our normalized terminology.
5. Relative scent-trait bars using the **same axes and scale across both fragrances**. In v0.1 the default five: sweet, fresh, spicy, woody and warm. Advanced view can add aromatic, fruity, gourmand, smoky, green and marine/mineral.
6. `What differs?` text explanation driven by known notes, traits and source evidence; meaningful omissions and ambiguities are disclosed.
7. `Which season or moment?` personal seasonal preference context when available; source-defined wear recommendations otherwise, clearly attributed. Do not infer daily habits.

**Screen behavior:** At desktop >=1200px use two fixed aligned scent columns and a trait bar section with both values on each row. At mobile 320-767px use a *paired stacked layout*: each trait row keeps A and B side by side, but pyramids and prose can stack beneath sticky compact selectors. Avoid page-wide horizontal scrolling, and never force side-scrolling to understand every score. Keep the footer in document flow and account for the bottom navigation safe area. Mobile search, replace, swap, clear and deep link are reachable via keyboard/touch.

**Uncertainty semantics:** Trait scores are heuristics, not official measurements; label as indicative 0–5 and show method/version and whether source-backed. Render unknown values as `—`, not 0. Do not output fake `Similarity: 62%` or a made-up calibrated score.

**Access:** compare selection is reflected in the canonical URL query for deep links and restored within the current session; an invalid, absent, duplicate or deleted ID triggers a safe selection state instead of a broken page.

### 6.3.2 Comparison-specific usability tests

- Switch A/B and preserve alignment of each trait and pyramid tier.
- Compare two long names at 320px, 375px, 390px, 768px, 1280px and 1440px; no overlapping labels.
- Test both known and unknown notes; partial source data stays truthful.
- Test keyboard-only selector/reorder, VoiceOver, 200% zoom, reduced motion and strong contrast behind glass.
- Check source captions and visible explanation of score provenance.


### 6.4 My DNA

- Four season selector controls: Spring, Summer, Autumn, Winter.
- Keep seasonal **personal choices** separate from provider-recommended wearing seasons.
- Explicit input: Love / Neutral / Avoid for families, notes, accords and qualities. Unknown/Not rated is distinct from Neutral.
- Show derived preference signature only when sample size/feedback supports it; use `Not enough evidence yet` otherwise.
- Present `Common in your collection` and `Rare in your collection` without claiming either predicts liking.
- Show one intelligible explanation for a seasonal suggestion, using source-backed traits and explicit preferences.
- No requirement to mark morning/evening wears; seasonal profile remains useful without usage events.

### 6.5 Discover

- Global search by name/brand/alias; scan EAN/GTIN or paste digits where available.
- Search results separate **exact**, **probable**, and **unverified** matches. No auto-merge based only on similar titles.
- If Scento does not have a specific 2026 flanker, offer `Create source-backed record` rather than substituting an older scent with similar wording.
- Auto-enrichment is asynchronous from the user's perspective: show clear `Searching`, `Verifying`, `Enriching`, `Partially enriched`, `Ready`, or `Needs review` states.
- Never display an infinite spinner without explanation and a retry option.
- Similarity/novelty suggestions disclose a brief explanation and the evidence source.

### 6.6 Settings and system health

- **Security:** authenticated owner identity, logout from every viewport, session-expired prompt that preserves unsaved draft text, access-denied and re-authentication screens. Avoid displaying tailnet membership or a glass padlock as proof of an authenticated application session.
- **Connection:** distinguish `Online through private HTTPS`, `Mac unreachable`, `Application session expired`, and `Enrichment temporarily unavailable`; never present all as a generic offline indicator.

- Theme: System / Dark / Light; Reduce transparency; Reduce motion (respects OS defaults).
- Data: manual export, backup freshness and last verified restore, protected import and restore entry points, deletion confirmation. Always distinguish a generated backup from a successfully tested restoration.
- Source diagnostics: Scento reachable/unreachable; timestamps of latest data; no API keys or secret values in client responses.
- AI diagnostics: embedding model identifier/version, vector availability; no raw credentials.
- Connection status wording must not imply a live security verification unless it actually happened.
- Persistence status: last successful off-VM backup timestamp, whether restore was last tested, and explicit warnings if protection is overdue; hide detailed operator controls behind Advanced settings. Never show a green "protected" status merely because a Podman volume exists.

## 7. Component inventory and contracts

### Global shell

| Component | Responsibilities | Key states |
|---|---|---|
| `AppShell` | Layout grid, theme, responsive regions | Desktop/tablet/mobile |
| `AppSidebar` | Navigation, recent items, collapse | Expanded/collapsed/active |
| `AppHeader` | Context, search, add action, drawer trigger | Default/scrolled |
| `AppFooter` | Version, provenance/privacy links, operational status | Wide/stacked |
| `MobileNav` | Four primary destinations + safe area | Active route |
| `MobileDrawer` | Primary + secondary controls | Open/closed/focus trap |
| `GlobalSearch` | Name/brand/EAN query, exact match review | Idle/loading/results/error |

### Domain UI

| Component | Content / interaction | Key rule |
|---|---|---|
| `FragranceCard` | Visual identity + collection status | Entire card keyboard actionable; not nested conflicting controls |
| `FragranceHero` | Large product image + canonical identity | Graceful licensed image fallback |
| `NotePyramid` | Top / Heart / Base | Screen reader titles; unknown stays unknown |
| `ScentTraitBars` | Fixed 0-5 axes | Text labels and legends, no color-only encoding |
| `ScentRadar` | Optional graphical comparison | Never the only representation |
| `SeasonSelector` | Four states | Local/user preference distinct from provider recommendation |
| `CollectionStatusPicker` | Owned/previous/sample/wishlist/rejected | Reversible action + history |
| `SourceAttribution` | Publisher/source, fetched date, derivation status | Expandable, precise and visible |
| `CompareTray` | 1-2 in v0.1; 1-4 in v0.2 | Add/remove/clear, persistent while navigating |
| `EmptyState` | No items, no data, no matches | Next useful action, no fake examples |
| `StatusBanner` | Partial enrichment, outage, sync issue | Neutral and actionable |
| `GlassPanel` | Shared glass surface variant | Tokens + fallback, not per-page recipes |

### Shared states for interactive components

Each interactive component must have default, hover (pointer only), focus-visible, active/pressed, disabled, loading, error, and success/confirmation as appropriate. Avoid an inert `Edit`, `Compare`, or `Scan` control in production UI.

## 8. Interaction details

- **Search:** desktop `⌘K` / `Ctrl+K`, with clear visible button and accessible label. Mobile search uses full-width sheet. Debounce queries (~200-350ms), cancel stale requests, and never show out-of-order results.
- **Add fragrance:** search → exact variant selection → inspect enriched facts → choose collection status → save. If auto-enrichment partially fails, allow a user-corrected partial entry.
- **Barcode scanning:** camera permission only after explicit scan action; HTTPS or localhost browser requirement; manual EAN input always available.
- **Selection:** compare selection persists across navigation within the active app session; user can clear at any time.
- **Undo:** use undo for reversible simple relationship updates; destructive import/replacement requires confirmation.
- **Notifications:** small, accessible status messages that can be announced to assistive tech; never show misleading `Saved` before server acknowledgement.
- **Transitions:** 120-200ms typical, eased; no animation on chart data updates that hides numerical changes. Honor `prefers-reduced-motion`.
- **Loading:** skeletons only where the layout is predictable; avoid fake bottle content and shimmering indefinitely.

## 9. Visual semantics of fragrance data

### 9.1 Pyramid

Three horizontally segmented columns on desktop if space permits; vertically stacked on mobile. Use `Top`, `Heart`, `Base` with accessible text, not just triangular decoration. Each note can show a short glossary definition. Long notes wrap without clipping.

### 9.2 Trait visualization

Start with labeled horizontal bars and a shared scale for each compared fragrance. Support a secondary radar chart only after it improves comprehension in usability tests.

Default axes: **Fresh, Sweet, Spicy, Woody, Warm, Aromatic, Fruity, Gourmand**. Keep the same ordering across screens. Values are heuristic, method-versioned and marked `Derived`; missing values show `Unknown`, **not 0**.

### 9.3 Source language

- `Official` means an actual manufacturer source for that specific formulation/variant.
- `Scento` indicates a third-party catalog record, attributed by name/URL.
- `Derived` indicates the application has calculated a characteristic.
- `Personal` indicates the user's subjective preferences or corrections.
- `Unknown` indicates no adequate evidence. Do not invent a plausible substitute.

Avoid bright badges for every fact. Use compact metadata labels, with status emphasis only for errors or data review needed.

### 9.4 Brand labels

Normalize display identities while retaining aliases, e.g. `Rabanne` / `Paco Rabanne`, `Jean Paul Gaultier` / `Gaultier` / `JPG`, `Hugo Boss` / `BOSS`. Preserve the source's exact marketing title where necessary for variants. Do not normalize one flanker into another.

## 10. Photography and image usage

- Photography style: premium editorial product still life with controlled reflections, precise glass and metal textures, soft blue and warm-gold edge lighting.
- Bottle photos must represent the **actual product variant**. Do not use AI-generated images to masquerade as an official bottle photo.
- Render bottles consistently: transparent or restrained neutral stage, `object-fit: contain`, no clipping of atomizer/cap.
- Prefer approved/copyright-cleared retailer/manufacturer-supplied imagery according to source rights; cache only within allowed usage. Record photo source metadata.
- If there is no usable licensed product photo, render a tasteful branded-neutral placeholder; do not invent a look-alike.
- Hero art may be conceptual and atmospheric. It must never interfere with legible controls or make a product fact claim.
- Optimize with responsive sizes, lazy loading outside the first viewport and stable image aspect ratios.

## 11. Accessibility and inclusion

**Target:** WCAG 2.2 AA where applicable. Test composited translucent states, not only flat-color screenshots.

- Full keyboard navigation, skip-to-content link, visible 2px+ focus indicator.
- Screen reader semantics for route changes, dialogs, collection statuses, comparison results and chart data.
- Label all icon-only actions (Search, Expand sidebar, Menu, Remove, Scan, Theme).
- Controls sized for touch; aim for >=44px, avoid accidental taps.
- Text remains readable at 200% zoom and reflow at 320px CSS viewport without horizontal page scroll.
- No meaning communicated by color alone, hover alone, or animation alone.
- Reduced motion and reduced transparency options both work independently.
- Trap focus in dialogs and drawers, support Escape, restore focus on close.
- In a comparison, communicate differences as text in addition to visual bars/radar.
- Contrast tests must cover default/hover/focus/disabled states in both themes and over actual backdrops.

## 12. Performance and graceful degradation

Performance is part of the visual design. The interface must feel lightweight despite glass layers and high-quality images.

- Limit backdrop filters to shell surfaces and essential overlays; avoid `backdrop-filter` on every item of a virtualized/scrolled grid.
- Reserve image space to prevent layout shifts. Optimize hero and thumbnail asset sizes.
- Render static information quickly even while enrichment/Ollama/vector search is unavailable.
- Budget and measure Core Web Vitals on target iPhone + desktop, with **LCP <= 2.5s**, **CLS <= 0.1**, **INP <= 200ms** as aspirational good-experience targets for representative pages, not falsely guaranteed before testing.
- No blocking full-page loading state for auxiliary similarity calculations.
- Error states must preserve existing saved collection and user-entered corrections.
- Browser support: current iOS Safari, macOS Safari, Chromium and Firefox. Validate PWA/camera separately. On iPhone, validate HTTPS and session cookies through Tailscale Serve; service workers and camera APIs require an acceptable secure context.

## 12.1 Data-durability UX and collection trust

Data durability is part of the interface, not only infrastructure documentation:

- All successful collection changes return an authoritative server acknowledgement. Never call a change "Saved" on optimistic UI state alone.
- If an API write fails, restore the previous value or retain the draft visibly with a retry action. Never silently discard personal edits or ratings.
- Import and restore are explicit, previewable, irreversible-impact operations. Present record counts, conflicts and the target environment before confirmation.
- The collection UI must retain historical entries and ratings when a current bottle is marked empty or previously owned; such transitions are not hard deletes.
- On a fresh app version with existing database content, preserve collection IDs and historical statuses. Do not show first-run onboarding solely because an application cache is empty.
- Settings offers **Export my collection** as a portable, machine-readable artifact, distinct from the operator-level PostgreSQL backup.
- If offline, read-only cached content may be displayed where valid, but show accurate connectivity state; do not imply writes are safely synchronized unless an offline queue with tested conflict resolution actually exists.
- Operational backup status is displayed only if populated by validated server-side checks, never mock data in production. The UI must label it **Last manual backup** and **Last manually verified restore**. Never imply scheduled automatic protection; an old backup should show age, not falsely claim an RPO.
- Security-sensitive notes and secrets never appear in client-side console logs or analytics.

See [`DATA_PERSISTENCE.md`](DATA_PERSISTENCE.md) for retention, recoverability, and restore acceptance criteria, and [`OPERATIONS.md`](OPERATIONS.md) for Make command contracts.

## 13. Frontend implementation contract

- Nuxt 4 filesystem conventions: `app/layouts/default.vue`, `app/components`, `app/pages`, `app/assets/css`; verify against the installed Nuxt minor release.
- Keep navigation defined once in a typed `navigation.ts` (route, icon, label, primary/secondary flag); render desktop and mobile views from the same source.
- Define CSS variables and Tailwind v4 theme integrations centrally; avoid arbitrary per-component hex colors.
- Use typed component props and stable variants (`solid`, `glass`, `overlay`, `subtle`) instead of duplicated Tailwind recipes.
- SSR/hydration safe: theme and sidebar state must not cause layout hydration mismatches. Persist browser preferences only after client initialization or use an SSR-safe approach.
- Keep domain logic outside presentation components. UI receives validated API models and provenance metadata.
- Keep route/page components focused on composition and state, not direct database or Vault access.
- Never call Vault, PostgreSQL, Ollama, or private internal services directly from browser components; go through the authenticated backend.
- Use Nuxt error boundaries for error recoverability and accessible inline states.

Suggested structure:

```text
app/
  app.vue
  layouts/default.vue
  pages/
    collection/index.vue
    discover/index.vue
    compare/index.vue
    dna/index.vue
    fragrances/[slug].vue
    settings/index.vue
  components/
    shell/{AppSidebar,AppHeader,AppFooter,MobileNav,MobileDrawer}.vue
    fragrance/{FragranceCard,FragranceHero,NotePyramid,ScentTraitBars}.vue
    compare/{CompareTray,CompareMatrix}.vue
    dna/{SeasonSelector,PreferenceEditor}.vue
    search/{GlobalSearch,GTINScanner}.vue
    ui/{GlassPanel,EmptyState,StatusBanner,IconButton}.vue
  composables/
    useCollection.ts
    useCompare.ts
    useTheme.ts
  assets/css/
    tokens.css
    main.css
shared/
  types/
  navigation.ts
```

File paths are a starting suggestion; verify against the actual repository and chosen code conventions.

## 14. Design quality gates and acceptance tests

### 14.1 Visual and responsive

1. Desktop at 1440px: expanded left sidebar, sticky header, main content, normal-flow footer visible without overlaps.
2. Desktop sidebar collapses to 76px and expands; state persists and all destinations remain keyboard accessible.
3. Tablet at 834px: rail navigation works, content has adequate space, filters are usable.
4. iPhone-sized viewports at 375px and 430px: top header and labeled four-item bottom nav function, drawer is accessible, safe-area padding is correct.
5. At 320px: no *page-wide* horizontal scroll. Compare may scroll only inside a clearly marked panel.
6. Both light and dark themes work, including source metadata, form errors and empty states.
7. Blur fallback renders opaque, readable surfaces when unsupported or disabled.
8. Footer never overlays save buttons, forms, comparison tray or content.

### 14.2 Experience and domain

9. Can find an exact fragrance and add it to current, historical or sampled collection without inventing metadata.
10. Recognizes a previously-owned fragrance even when a different GTIN/package size is scanned.
11. If enrichment returns a near match rather than an exact match, the UI asks for verification; never auto-substitutes an older flanker.
12. Detail page labels manufacturer, Scento, derived and personal facts accurately; null is not turned into zero or an assumption.
13. Compare shows common/different notes plus textual descriptions, with identical scale axes and meaningful mobile behavior.
14. Seasonal preference controls work without recording any daily wearing events.
15. API/embedding/source outages have actionable partial-data states and do not erase saved personal data.

### 14.3 Accessibility and engineering

16. Automated accessibility checks (axe or equivalent) plus manual keyboard and screen-reader spot checks pass on all key views.
17. Contrast audit verifies text and controls on actual glass compositing in both themes.
18. Playwright covers desktop, tablet, mobile, sidebar/drawer, theme switching, search, add, detail, compare and DNA.
19. No unexplained layout shift when imagery loads; no browser console errors in happy path.
20. Versioned visual baselines for at least one viewport per major breakpoint and both themes.
21. No secrets, raw source auth tokens, internal database connections or Vault metadata leak to the client or UI logs.
22. Collection edits are acknowledged by the backend and survive a page reload, restart and application container recreation.
23. A failed save presents a visible error and preserves or restores user data instead of falsely claiming success.
24. Import/restore flows show a preview and do not overwrite personal history without explicit acknowledgement.
25. Settings backup status distinguishes last completed off-VM backup from last tested restoration and warns on stale/unavailable protection.

**Definition of Done:** all P0 shell components and four primary journeys pass their design review and tests. A screenshot looking attractive is not a substitute for working keyboard/touch flows.

## 15. UX anti-patterns to reject

- Applying frosted glass to every card, field, table, chart and modal.
- Header and left sidebar both carrying identical full menus.
- A floating action button that obscures bottom navigation.
- Hover-only interactions on a mobile-first product.
- AI-like prose fillers and meaningless confidence scores.
- Invented bottle images or unverified fragrant notes used as facts.
- Separated "scientific" and "personal" scores without explanatory labels.
- Truncating long designer fragrance names until they become indistinguishable.
- Decorative badges everywhere, including each note, each heading or each status.
- False real-time system health indicators or misleading `synced` promises.

## 16. Roadmap and review sign-off

### Phase 00, design foundation (P0)

- Confirm this DESIGN.md and app shell wireframes at desktop, tablet and mobile widths.
- Establish tokens, glass styles, solid fallback, dark/light modes and core component variants.
- Implement actual responsive shell with sidebar, header, footer, bottom nav and drawer using stub data.
- Validate WCAG/contrast and navigation/focus before backend integration.

### Phase 01, vertical slice (P0)

- Collection gallery → Search/Verify → Fragrance Detail → Add to Collection → Compare.
- Seed real source-backed Phantom In Red plus one additional confirmed exact fragrance, retaining provenance.
- Establish responsive regression tests and semantic trace of data states.

### Phase 02, intelligence interface (P1)

- My DNA seasonal editor, trait visualization, similarity and novelty explanation, graceful partial results.
- Add vector model/derivation version disclosures without exposing implementation internals to normal users.

### Approval checks

- [ ] Dark + light visual tokens reviewed.
- [ ] Desktop sidebar/header/footer behavior approved.
- [ ] Tablet icon rail behavior approved.
- [ ] Mobile bottom navigation and drawer approved.
- [ ] Glass density and transparency accessibility reviewed.
- [ ] Collection / Detail / Compare / My DNA wireframes approved.
- [ ] Component library and acceptance criteria adopted.

## 17. Source references

- Nuxt 4 documentation: https://nuxt.com/docs/4.x/
- Nuxt layouts concept: https://learn.nuxt.com/en/concepts/layout
- Tailwind backdrop filter: https://tailwindcss.com/docs/backdrop-filter
- MDN `backdrop-filter`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C Focus Appearance: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance

---

**Architecture note:** ADR-001 confirms **PostgreSQL 18 + pgvector**. This file is the canonical design contract for v0.1.6; `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `DATA_PERSISTENCE.md` and `OPERATIONS.md` define complementary requirements. Designs do not imply application code has been implemented.
