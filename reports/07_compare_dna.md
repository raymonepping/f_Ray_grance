# Phase 07 — Structured DNA and two-fragrance Compare

Prompt FRAY-CODEX-07. Agent Codex. Date 2026-10-25.

## Prerequisite and scope

Phase 06 commit `c390d5e1bf47655fd2ee49d5a4a3ef9ac70ab2e1` was confirmed on GitHub main before beginning. Its GitHub Detect secrets check was separately observed successful. Single Codex writer; unrelated untracked configuration excluded.

## Implementation

- `domain/dna.ts`: eleven stable trait axes, conservative explicit note aliases, sparse versioned `sourced-notes-v1` rules, source metadata and per-axis evidence. Unknown remains null; no numerical smell similarity. `docs/trait-method.md` documents limitations and rule semantics.
- Authenticated `GET /api/v1/fragrances/:id/dna` and `POST /api/v1/compare`, exactly two distinct verified canonical IDs. Deterministic shared/unique notes, up to three known-score contrasts, owner-scoped relationship states and personal seasons. Reads never mutate history; no personal notes enter comparison links or responses.
- Responsive Compare: searchable library selectors, replace/swap/clear, canonical query links, session selection and tray, neutral bottle fallback, compact/full pyramids, family/character, separately labelled personal/provider season context, paired A/B trait rows, optional extended axes, explanation and expandable provenance.
- Entry points from collection, fragrance detail and verified Discover results. Detail exposes structured DNA.

## Verification and findings

- `make test`: PASS including typecheck, disposable PostgreSQL API integration, existing provenance/identity/credential/history regression tests, UI tests, infrastructure checks and secret scan.
- New API tests reject duplicate, missing, invalid, deleted and draft identities; verify aliases without merging distinct notes, unknown traits, deterministic reversal, unchanged history, CSRF and owner isolation.
- Live source anomaly: Scento's `invictus-victory-elixir-rabanne` URL returned **Invictus Victory / eau de parfum**. Enrichment correctly refused the requested Victory Elixir identity (409). No record was saved or silently substituted. A live-verified **Layton / Parfums de Marly / eau de parfum** profile is used alongside Phantom in Red instead.
- Built/deployed through `make images` / `make provision AUTO_APPROVE=YES`. Gateway, Vault, PGDATA and API health passed.
- Final browser suite covers all earlier shell/collection tests plus Compare at **320/375/390/768/1280/1440** with real API data, full pyramids, swap, reload/deep links, duplicate/invalid links, no horizontal overflow, axe serious/critical checks and no happy-path console errors. Screenshot evidence: `reports/evidence/07/`.
- An initial browser assertion used the wrong ARIA role for a status banner; corrected the assertion without changing app semantics. Visual review replaced raw provider season objects with readable labels.

## Limits

Trait strength is a transparent editorial heuristic, not a calibrated sensory measurement. Provider-specific data quality stays visible. No official bottle photo is fabricated. Real iPhone/VoiceOver and Tailscale checks remain Phase 10; Chromium axe is not a substitute for those tests. No schema migration or personal-history import was required.

Next: Phase 08, pinned Ollama embeddings and explainable discovery with structured fallback.

Further audit finding: System theme mode resolved only at initial page load. Live OS-theme switching failed at all six comparison widths. Added one app-level `matchMedia` change listener and reactive resolved theme state; explicit Dark/Light choices remain respected. The final browser assertions switch actual OS-emulated themes without reloading and audit both composited themes.

Final results: `make test` PASS; `make test-e2e` **26/26 PASS**, including real OS-theme changes, both settled themes at all six Compare widths, axe and previous shell/collection regression. The targeted comparison suite also passed 7/7. Contrast audits wait for actual CSS transitions to finish instead of sampling intermediate theme colours.
