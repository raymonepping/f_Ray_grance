# Phase 11: Scent Academy, local tutor and console redesign

Prompt FRAY-CODEX-11 (accepted under [ADR-010](../docs/adr/ADR-010-phase11-local-development.md)). Agent Claude (claude-opus-5-5), taking over from Codex at `7c64e94` after Codex's lock went idle. Date 2026-10-25. Phase 10 stays **blocked** on its operator-dependent recovery gates; this phase does not move `last_successful_phase` past 09.

## Takeover verification

Before building, the Codex phases 06 to 10 were re-verified on a clean tree at `7c64e94`: `make test` PASS, `make health` PASS, `make drift` NO_DRIFT, live security probe 39/39, CI Gitleaks green on every pushed commit, and e2e 27/28 on the first run. The one failure was a transient: an owner CLI session revoke raced a Vault Agent re-render. It passed on rerun. Codex's in-progress files (academy domain, routes, migration 0004) were reviewed and kept. The six lessons, migration and route set were extended rather than duplicated.

## Delivery

**Learning (API).** Six original, versioned lessons, all local and available without Scento or Ollama. A glossary of short original definitions, each linked to its lesson, plus an Explain-this map. Owner-scoped progress (not started, in progress, completed) with a resume position checked against the lesson's content version; a stale version returns a conflict. Routes: `GET /academy/lessons`, `GET /academy/glossary`, `PATCH /academy/lessons/:slug/progress`.

**Provider references.** The existing server-only Scento client gained on-demand educational folios: material, lexicon term, family map, family detail and journal search. They are validated per route (`scento-folio.ts`), plain-text only, with a 256 KB body cap, a 300-entry cache with eviction, the existing timeouts, backoff and rate bucket, and allowlisted `https://www.scento.com` links. `GET /academy/reference` has a per-owner budget of 15 per minute and returns a typed `available: false` fallback instead of failing. Only a public concept term leaves the Mac, never observations, collection state, ratings or questions. Five captured fixtures cover the folio shapes.

**Local tutor.** `POST /academy/tutor` (6 per minute per owner) builds a bounded prompt from the original lesson text plus, optionally, one explicitly requested public reference. Context is passed as data, not instructions. `FRAY_TUTOR_MODEL` is optional and validated. With no generative model the tutor returns `NO_GENERATIVE_MODEL` and the curated lesson text. It also detects `EMBEDDING_ONLY_MODEL`, `MODEL_NOT_INSTALLED` and `TUTOR_UNAVAILABLE`, and never fabricates an answer. No model is downloaded and no external model is used. The deployment has no tutor model configured, so the live tutor honestly reports that.

**Private practice (Train My Nose).** Exercises use the owner's own owned or sampled entry, or a generic blotter. There are three stages (opening, about 20, about 60 minutes) with adjustable elapsed minutes, descriptors and private text. Saves are accepted only while the exercise is active. Exercises can be paused, resumed, completed and reopened. There are no timers and no scoring. Another owner's entry behaves as missing.

**Schema and portability.** Forward-only migration `0004_scent_academy` (academy_lessons, academy_progress, training_exercises, training_observations). Export moves to format version 2 with an `academy` section; version 1 files still import. Import has conflict and foreign-owner checks for academy rows. The synthetic-owner purge and the restore smoke check cover the new tables.

**Academy UI.** Academy entry in the secondary navigation and the mobile drawer. Pages:

- landing page with the learning path, resume state and progress readout;
- lesson reader, section by section, with resume, completion, key term, lexicon lookup and the tutor panel;
- note explorer (suggestions come from the owner's own sourced pyramids);
- family explorer;
- glossary with filter;
- Train My Nose list and exercise.

Explain-this links appear on fragrance detail (pyramid, character, traits) and on Compare (what differs, traits).

**Console redesign** ([ADR-012](../docs/adr/ADR-012-scent-spectrometer-visual-world.md)). At the owner's request, the visual world was replaced. The new "Scent Spectrometer" world has a graphite canvas, ice-white ink, Geist and Geist Mono, and one phosphor-lime signal reserved for verified state. A light lab-paper theme mirrors it. Built with the impeccable and design-taste skills and verified with Playwright:

- **Logo.** The Spectral F, a geometric F whose arms are spectral lines. It replaces the written name in the top-left of the sidebar and drawer, and is also the favicon.
- **Collection.** Now a fixed-column sample table: micro-chromatogram, status glyph, rating, verified identity and compare. A read adapter returns each entry's effective pyramid, using the same precedence as the detail profile.
- **Fragrance detail.** Leads with a full chromatogram: labelled peaks on a tier luminance ramp, and a one-time scan animation that is instant under reduced motion. Every chromatogram states that peak height follows listed order, not concentration. Unlisted tiers stay flat and say "Not listed".
- **Compare, Discover, My DNA, Settings and Login** were rebuilt in the same grammar.
- **Controls and copy.** Segmented controls for status, rating, season and theme. Drawn chevrons on selects and disclosures. No em-dashes in visible copy, except the spec-mandated "—" for an unknown value.

## Design finish (impeccable)

- Direction contract: `apps/web/.impeccable/surfaces/app-layouts-default-vue.md` (seed key `11469ade`). Product brief: `apps/web/PRODUCT.md`.
- `impeccable detect --json app`: `[]` after three findings were fixed: a width transition, a multi-layer ruler, and a light-theme graticule (removed as decorative).
- Finish reviewer, round 1: disposition **fix**, with 8 material fixes. All 8 were applied in one batch.
- Verdict pass: 6 resolved, 2 partial, 3 regressions. Disposition still **fix**.
- The 3 regressions were then fixed but not re-scored, because the skill caps verification at one confirm round:
  - the compare tray competed with the primary action;
  - an empty readout slab appeared on My DNA;
  - the mobile Sort value was clipped.
- Open, by the reviewer's account:
  - Discover suggestions are rows without a micro-chromatogram, because the recommendation API does not return pyramids;
  - My DNA's per-season choices are still a stacked form, not a fixed-column readout;
  - the Collection bay is sparse below short tables;
  - the light theme has no lab-paper texture beyond its colours.
- `apps/web/DESIGN.md` and `.impeccable/design.json` were written by the documenter from the built code. It flagged three drifts from the documented rules, which were then fixed in code:
  - lime was used on generic save messages and the success banner;
  - a "Channels" label sat above the sidebar nav, reading as an eyebrow;
  - the detail view had three filled buttons, breaking the one-primary rule.
- With DESIGN.md in place, the detector also checks font sizes against its type ramp. 16 off-ramp sizes were snapped to the ramp, and `impeccable detect` is `[]` again.

## Final observed evidence

- `make validate-docs`: PASS. 71 frozen documents hash-verified, 38 prompts, 262 local links; phase 12 prompts and ADR-011/012 are registered.
- `make test`: PASS. This includes the workspace typecheck and the API/database tests on disposable PostgreSQL 18 (new `academy.test.ts`, portability v1/v2). Web unit tests: 33/33, covering chromatogram truthfulness, the new contrast audit for both themes, navigation and trait bars.
- `make images`, `make recreate SERVICE=api|web`, `make configure`: PASS. Migration `0004_scent_academy` was applied once (`MIGRATIONS_OK`, 3 skipped, `changed=1`).
- Briefly between the API deploy and `make configure`, the console showed "Partly unavailable". `/api/health/ready` correctly returned 503 because the schema version lagged; it was 200 after the migration.
- `make health`: PASS. `make drift`: NO_DRIFT for both data and app roots.
- `make test-e2e`: **36/36 PASS** (57 s). New tests:
  - desktop and mobile learning journey (navigation, resume after reload, completion, honest no-tutor state);
  - Explain-this from fragrance detail;
  - keyboard navigation in the glossary;
  - Train My Nose save, pause read-only, reload resume and complete;
  - design-review captures of every main screen at 1440 and 390 px, in both themes, each axe-clean with no page overflow.
- Bounded live educational lookup (`reports/evidence/11/live-lookup.json`), observed 2026-10-25T12:15Z:
  - one request, `kind=material&term=Lavender`, carried only the public term;
  - Scento returned folio `note-portrait` with 6 facts and 5 related references;
  - `sourceUrl` `https://www.scento.com/note/lavender`, attribution "Scento Perfume API, scento.com".
  - This is separate from the fixture-based contract tests.
- Live security probe `p03`: 39/39 PASS.
- Synthetic e2e owners are purged after every run; the only remaining owner is the real owner account, untouched. One run's teardown failed before migration 0004 existed, because the purge touches the new tables. Its two synthetic owners were purged by hand.

## Residual risks and boundaries

- The tutor stays unavailable until the operator sets `FRAY_TUTOR_MODEL` to an installed local generative model. No model was downloaded.
- Reference lookups depend on Scento's public API. Failures degrade to a typed fallback and lessons keep working.
- Phase 10 remains blocked (independent off-device copy, separate restore environment). Real-data import stays disabled. Tailscale stays deferred (ADR-009). No release-ready claim.
- Next: Phase 12 (perfume images) per `spec/PERFUME_IMAGE_SPEC.md` and ADR-011.
