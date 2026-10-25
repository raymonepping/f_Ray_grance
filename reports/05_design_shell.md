# Phase 05 — Nuxt Design System, Glassmorphism and Application Shell

**Prompt:** FRAY-CLAUDE-05 (via `prompts/launchers/Claude_START_HERE.md`) · **Agent:** Claude (claude-opus-5-5) · **Date:** 2026-10-25 · **Status:** completed

## Launcher gate

`main`, origin verified; Phase 04 `completed`, commit `6a5b57a` ancestor of `origin/main` (CI gitleaks **passed**, recorded); 0 unpushed; next eligible 05; lock acquired.

## Design authority

`spec/DESIGN.md` (dark navy + warm gold premium glass, light theme, System mode) per the owner's decision — not the Vault "daylight glass" system. The untracked `.impeccable/` brief in the repo belongs to Project Durin and was not used.

## Implemented (`apps/web`, Nuxt 4.6.1 / Vue 3.5.43 / Tailwind 4.3.3, SPA served by the Caddy gateway)

| Area | What |
|---|---|
| Tokens | `app/assets/css/tokens.css` — DESIGN §2.1 semantic tokens for dark/light, glass recipe (12 px blur, 16 px max), radii, header heights per breakpoint; Tailwind `@theme` bound to tokens (no per-component hex) |
| Glass rules | Glass only on sidebar, header, bottom nav, drawer, dialogs; solid surfaces for pyramids, tables, text; opaque fallback for no `backdrop-filter`, `prefers-reduced-transparency`, the explicit **Reduce transparency** setting, and `forced-colors` |
| Shell | `layouts/default.vue` AppShell: skip link, landmarks, route announcements; `AppSidebar` (260 px / 76 px collapsible, remembered; forced rail 768–1199, correct on first paint), `AppHeader` (sticky 72/64/60 px, opacity on scroll, one primary action), `AppFooter` (normal flow), `MobileNav` (4 labelled destinations + safe area), `MobileDrawer` (focus trap, Escape, backdrop, scroll lock, focus restore), `GlobalSearch` (⌘K / Ctrl+K) |
| Navigation | `shared/navigation.ts` single typed source for sidebar/rail/bottom nav/drawer; Samples = Collection filter |
| Auth UX | `/login` (no open redirects via `?next`), global route guard (server-verified session), in-place **Session expired** re-auth dialog that keeps the page, logout from drawer and Settings |
| Connection UX | `useConnection`: *Online through private HTTPS* / *Local connection on this Mac* / *Mac unreachable* / *Partly unavailable* — derived only from observed requests |
| Screens | Collection (status filters incl. Samples, truthful counts, onboarding empty state), Discover (live resolver: exact / review / unresolved / conflict, confirm-to-enrich, manual drafts), Fragrance detail (identity, pyramid, character, provenance), Settings (theme, reduce transparency/motion, sidebar, session, connection, data sources, privacy, **Last manual backup** / **Last manually verified restore** = "Not reported to the app"), Compare and My DNA as explicit placeholder states (Phases 07/09) |
| Components | `GlassPanel` (solid/glass/overlay/subtle), `EmptyState`, `StatusBanner` (live region), `IconButton` (always labelled), `AppIcon` (Lucide 1.75 stroke), `NotePyramid` (unknown tier = "Not listed"), `ScentTraitBars` (unknown = "—", no bar), `SourceAttribution`, `CollectionStatusBadge`, `FragranceCard` (whole-card link, neutral bottle silhouette) |
| API additions | `GET /api/v1/system/status` (Scento last check, verified count, backups `reported: false`); collection list joins fragrance identity |
| Strict CSP | `script-src 'self'` kept: Nuxt entry import map disabled; `scripts/externalize-inline.mjs` moves remaining inline scripts to `/_inline/*.js` and fails the build if any remain |
| Gateway | `try_files {path} {path}/index.html /200.html` (no directory redirects, SPA fallback); hashed `/_nuxt`, `/_inline` assets strict 404 + immutable cache; pages `no-cache` |
| Image | `apps/web/Containerfile` (Node 24 build → Caddy runtime); deployed as `localhost/fray-web:current` |
| Tooling | TypeScript pinned to **6.0.3** repo-wide (TS 7 native compiler is incompatible with `vue-tsc`); root `overrides` dedupe Vue; `make test-e2e` (runs `heal`, Playwright under `caffeinate -i`) |

## Validation (observed)

| Check | Result |
|---|---|
| `make test` | **PASS** — API Vitest 102 tests, web Vitest **24** (components + navigation + WCAG token contrast incl. glass composited over canvas, both themes), API + web typecheck, gitleaks, Terraform/Ansible static checks |
| `make test-e2e` (Playwright 1.64 Chromium vs live gateway, synthetic owner) | **14/14 PASS** |
| Responsive 390 / 768 / 1280 / 1440 | bottom nav + drawer / 76 px rail / 260 px sidebar / 260 px sidebar; first-paint width correct; **no page-wide horizontal overflow** on Collection, Discover, Compare, My DNA, Settings; footer not fixed |
| Accessibility | axe (WCAG 2.0/2.1/2.2 A+AA tags): **0 serious/critical** on Collection, Discover, Settings at all four widths in **real dark and light themes**, plus login and fragrance detail; skip link first in tab order; drawer traps focus, Escape restores focus to trigger; ⌘K opens/closes |
| Behaviour | anonymous → `/login?next=`; bad password refused; form login; theme + sidebar persist across reload; Reduce transparency → `backdrop-filter: none`; Discover → verified Phantom in Red → detail with sourced pyramid + provenance; Invictus Elixir never offered for saving; unknown id → not-found state; server-side session revoke → in-place re-auth; logout ends session; Settings backup labels honest |
| Console | no browser console errors in happy paths |
| Screenshots | `reports/evidence/05/` — collection at 390/768/1280/1440 in dark and light, detail in dark and light, mobile drawer |

## Findings during the phase

1. `vue-tsc` cannot run on TypeScript 7 (no JS `lib/tsc`) → TS 6.0.3 everywhere; a hoisted TS 7 and a duplicate Vue (3.5.44) were removed via root `overrides` and a clean reinstall.
2. Nuxt prefixes components by folder: UI primitives rendered as unknown elements (`<emptystate>`) — `vue-tsc` did not flag it; caught by E2E → `components: [{ path: '~/components/ui', pathPrefix: false }]`.
3. axe `link-in-text-block`: links distinguished by colour only → underlined text links globally.
4. The focused skip link covered the mobile menu button → moved to top centre.
5. `hidden md:inline-flex` lost to a component's own `inline-flex` (theme toggle visible on phones) → wrapper owns visibility.
6. Rail initialised in `onMounted` → visible 260→76 px animation on tablet load → synchronous init; asserted at first paint.
7. Dark-theme tests initially ran light (app re-applied the stored "system" preference) → tests use `emulateMedia({ colorScheme })` and assert `data-theme`.
8. **Operational:** the Mac idle-slept between agent commands; the Podman VM clock jumped 301 s and the API's 15-minute lease expired before the next renewal (the agent self-healed at its next renewal, ~10 min). Runtime lease shortened to **5 min** (renewal ≈ every 3 min ⇒ faster self-heal); E2E runs under `caffeinate -i` after `make heal`.
9. The per-username login lockout correctly locked a reused test username across runs → tests use fresh unknown usernames; the API's per-client login rate limit → E2E signs in once (storage state).

## Safety & persistence

- Browser never talks to Vault/PostgreSQL/Ollama; no tokens in the bundle; only `/api` on the same origin.
- No fake statuses: backup protection is shown as "Not reported to the app" until a server-side check exists (Phase 10); connection labels derive from observed responses.
- Synthetic E2E owners are created and deleted per run; no personal data.

## Residual risks / next

- iPhone Safari / Tailscale HTTPS behaviour and WebKit are verified in Phase 10 (`Secure` cookies on `http://localhost` work in Chromium).
- Add-to-collection, status history UI and the detail page's primary action arrive in **Phase 06 — Collection, historical ownership and samples**.
