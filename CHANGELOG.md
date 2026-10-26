# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Build phases follow [`spec/PHASE_MANIFEST.md`](spec/PHASE_MANIFEST.md); evidence lives in [`reports/`](reports).

## [Unreleased]

### Added

- **Quick find in Discover:** one box for a name, part of a name, a brand, or a barcode (EAN/UPC), like ISBN for books. A barcode is checked against your verified barcodes first, then Open Beauty Facts (or a web search) for the product title; that title is cleaned into a Scento search. Similar names are never substituted. The barcode is saved to the fragrance you add, so scanning it again finds it straight away.
- **Web research and image lookups** ([ADR-013](docs/adr/ADR-013-web-research-and-image-lookup.md)):
  - fills Scento's gaps (concentration, launch year, note pyramid, listed notes) from pages that name exactly the fragrance, through TinyFish;
  - you review each proposal with its page and quote, and saved values are labelled "Web research" at the lowest precedence;
  - image lookup by barcode through Open Beauty Facts (CC BY-SA, attributed);
  - web image search through TinyFish, where you pick the result;
  - the TinyFish key lives in Vault (`make tinyfish-key`), rendered by Vault Agent;
  - migration `0006` adds the new constraints.
- `make purge USERNAME=<name>` / `make purge ALL=YES`: empties (never deletes) personal data so the app can start from scratch, keeping accounts, passwords, schema, shared catalogue and Vault. It shows a summary, requires a typed confirmation and takes a fresh backup first.
- **Phase 12: Perfume images.** Typed image source chain (owner upload > approved provider > Scento > manual external URL). Scento documents no image field, so that slot reports unsupported. Remote hosts are off until approved. SSRF-safe server-side fetching (https, allowlist, public-DNS guard, re-validated redirects, size/time caps, signature and decode checks). Migration `0005_perfume_images` adds metadata, a single explicit primary and checksum dedupe. A protected `fraygrance_image_assets` volume holds originals and EXIF-free WebP derivatives. Owner image manager plus a resilient image component in Collection, detail, Compare, Discover and Academy practice. `make backup` archives the image volume and `make restore-test` checks every referenced file.
- Untiered Scento notes and signature materials (e.g. Boss Bottled Elixir, which has no pyramid) are kept as provenance-labelled facts and shown as "Listed notes" without inventing tiers; traits and Compare use them.

- **Phase 11: Scent Academy.** Six original versioned lessons with resumable progress, a glossary and Explain-this links from fragrance detail and Compare. On-demand, attributed Scento reference lookups (material, lexicon, family map/detail, journal) with typed fallbacks, budgets and plain-text rendering. An optional local tutor that reports honestly when no generative model is configured. Private Train My Nose blotter practice (three stages, pause/resume, never scored). Migration `0004_scent_academy`, and export format v2 with academy data (v1 still imports).
- **Console redesign: "Scent Spectrometer"** ([ADR-012](docs/adr/ADR-012-scent-spectrometer-visual-world.md)):
  - graphite and ice-white tokens with lab-paper light theme;
  - Geist and Geist Mono;
  - phosphor-lime reserved for verified state;
  - the Spectral F logo and favicon replace the written name top-left;
  - Collection as a fixed-column sample table with micro-chromatograms and ratings;
  - fragrance detail led by a labelled chromatogram with a one-time scan;
  - Compare, Discover, My DNA, Settings and Login rebuilt in the same grammar;
  - design-review Playwright captures in both themes.
- ADR-011 accepts Phase 12 (perfume images) for local development; Phase 12 prompts and `spec/PERFUME_IMAGE_SPEC.md` registered.

- **Phase 10 recovery tooling.** One shared snapshot for dump/manifest consistency, strict restore compatibility and runtime smoke checks, confirmed quarantine restore, reviewed app-only upgrade with saved-plan validation, and a synthetic persistence drill. Independent off-device recovery and release approval remain pending operator evidence.

- **Phase 09 — Seasonal DNA and portability.** Four explicit seasonal profiles and fragrance affinities, season-aware collection/Compare/Discover, private versioned JSON export, validated read-only import preview and conflict-safe additive import with stable history identities. Live apply remains gated on independent recovery evidence.

- **Phase 08 — Local discovery.** Digest-pinned Ollama embeddings with model/dimension/source checks, explicit indexing, exact pgvector cosine search, preference-driven similar/different suggestions and structured offline fallback.

- **Phase 07 — DNA and Compare.** Exactly two verified identities, sourced compact/full pyramids, eleven versioned indicative traits, owner-scoped seasonal context, deterministic explanations, session selection/tray and responsive comparison with URL restoration.

- **Phase 06 — Collection and samples.** Owner-scoped collection API/UI, retry-safe creation, package/barcode records, sample promotion, repeat purchases, private ratings/notes and append-only history. Codex verified and completed Claude's draft; 19 browser tests pass.

- **Phase 05 — design system and app shell.** Nuxt 4 SPA (`apps/web`) with DESIGN.md tokens (navy/gold dark, light, system), restrained glass with opaque fallbacks and a Reduce-transparency setting, collapsible sidebar / tablet rail / mobile bottom nav and accessible drawer, ⌘K search, login and in-place session-expired flow, truthful connection states; Collection, Discover (live resolver), Fragrance detail and Settings screens; strict-CSP static build served by the gateway; `make test-e2e` (14 Playwright tests, axe-clean at 390/768/1280/1440 in both themes) and a WCAG token-contrast audit.
- **Phase 04 — Scento-first identity.** Typed Scento adapter (timeouts, bounded retries, local rate budget, TTL cache, schema validation, typed source errors); 9-brand alias registry; exact-identity resolver (`exact`/`candidate_needs_review`/`unresolved`/`conflict`) that verifies listings against profiles and never substitutes near matches; provenance-preserving enrichment, refresh, manual overrides, drafts and effective-profile API; GTIN resolution via verified local mappings only; Phantom in Red enriched live.
- **Phase 03 — Vault and owner security.** `make vault-bootstrap` (scoped `fray-operator` token, initial root token revoked); Ansible-managed Vault audit device, `database/`, `kv/`, AppRole and least-privilege policies; Vault Agent rendering 15-minute PostgreSQL leases and a session HMAC key for the API; live migrations with a single-use migrator lease; owner login/logout with Argon2id, `__Host-` Secure/HttpOnly/SameSite=Strict cookies, Origin allow-list, double-submit CSRF, lockout and rate limiting; `make owner-create/owner-reset-password/owner-revoke-sessions`; `make heal`/`make clock-sync` for Podman VM pauses; live security probe (39 checks) and `docs/runbook.md`.
- **Phase 02 — schema and API foundations.** Migration `0001_canonical_schema` (exact fragrance identity, GTIN-14 variants, provenance claims, NULL-not-zero traits, `vector(768)` embeddings, owner-scoped collection with trigger-written append-only history, four-season preferences); checksummed forward-only migrator with destructive-statement preflight; Fastify API with validated config, error envelope, request IDs, live/ready health, central owner guard on `/api/v1`, opaque hashed sessions and a rotating credential-file DB pool; 53 integration tests on disposable PostgreSQL 18; `docs/migrations.md`.
- Project-local Node 24.21.0 toolchain (`make toolchain`, `make deps`) and `apps/api/Containerfile`.
- **Phase 01 — infrastructure and persistence.** Terraform data root (`fraygrance_pgdata`, `fraygrance_vault_data`, `fraygrance_ollama_models`, `prevent_destroy`) and app root (`fraygrance` network, `fray-postgres`, `fray-vault`, `fray-ollama`, `fray-web` gateway on `127.0.0.1:8470`) with state under `~/.local/state/f-ray-grance/terraform`, outside Git.
- Ansible `site.yml` with `preflight`, `postgres_base` (database `fray`, least-privilege role model, `vector`, schema `app`), `ollama_model` and `vault_status` roles; second run is `changed=0`.
- Make targets `images`, `bootstrap`, `drift`, `recreate`, `vault-init`, `vault-unseal`, `vault-status`, `vault-snapshot`, `backup`, `backup-status`, `backup-record-copy`, `restore-test`; working `health` and `test` gates.
- Manual backup (`pg_dump -Fc` as `fray_backup`, checksum + manifest with per-table fingerprints) and isolated restore rehearsal into a network-less disposable PostgreSQL.
- **Phase 00 — preflight.** `state/BUILD_STATE.json` and atomic `scripts/state.py`; Phase 00 gate report; Vault database-engine probe (`scripts/probes/`); ADR-008 project-owned `fray-vault`.

### Changed

- After the Mac wakes from sleep, the database login can be renewed late (the Podman VM clock lags). The app now says so plainly ("Reconnecting to the database") instead of "Session store unavailable". The banner re-checks every 15 seconds, clears itself on recovery, and points to `make heal`.
- Barcode hints keep concentration words that belong to a name ("Sauvage Parfum") and drop shop clutter ("Men's", "3.4 oz", "Fragrances ..."). A suggestion matches the barcode on the full name or the core name.
- Scento search listings that link only a brand page (seen for Calvin Klein CK One) now get the profile id from Scento's `<name>-<house>` slug pattern, and the fetched profile is still verified exactly. "CK One" now resolves as an exact match instead of "needs review".
- Web research runs as a background job. TinyFish agent runs are started asynchronously and cancelled on TinyFish's side after 120 s. Every outbound call uses a strongly referenced timeout (`AbortSignal.timeout` was observed never firing, which left a request hanging 19 minutes).
- Malformed request bodies (Fastify 400s) return a validation error instead of a 500.
- Collection list API returns each entry's effective pyramid (same precedence as the profile) for the note-profile readout.
- `spec/DESIGN.md` visual tokens superseded by ADR-012; its IA, behaviour and accessibility rules stay authoritative.
- TypeScript pinned to 6.0.3 across workspaces (TypeScript 7's native compiler does not support `vue-tsc`).
- Vault runtime database lease shortened from 15 to 5 minutes so the API recovers within minutes after a Mac sleep.
- Spec documents live in `spec/`; validators, manifest hashing (frozen docs only) and 50 relative links adapted.
- `make doctor` and all Terraform targets prove the socket identifies as *Podman Engine* (replaces the manual `CONFIRM_PODMAN_SOCKET=YES`).
- `make destroy` auto-approves Terraform only after the typed confirmation phrase and `VERIFIED_BACKUP=YES`.
- `.terraform.lock.hcl` is committed (overrides the global ignore) so provider pins are reproducible.

### Removed

- `infra/terraform/foundation/` placeholder, superseded by `infra/terraform/data` and `infra/terraform/app`.

### Fixed

- Collection history now sorts by numeric event ID rather than its text output alias, preserving order across digit boundaries. Added a deterministic regression.

- Collection cards referenced an unregistered Nuxt component and rendered blank once entries existed. Corrected the component name, retained dirty private-note drafts during status changes, and prevented stale search responses.

- Anonymous or forged requests could receive 400 schema errors before 401/403: auth and CSRF checks now run in `onRequest`.
- CI gitleaks failure on the Phase 03 commit (synthetic test password literal): password generated at runtime, historical fingerprint in `.gitleaksignore`.
- Podman VM pause (Mac sleep) let Vault revoke the API's lease while Vault Agent had not renewed: `make heal` re-syncs the VM clock and re-renders credentials; `make health` fails on clock drift.
- Agent volume `driver_opts` read back with extra `UID/GID` keys forced replacement: `ignore_changes`.
- `make heal`/`make health` no longer report green when the API is expected but missing.
- Runtime role could modify `app.schema_migrations` through default privileges; now SELECT-only.
- Migration ledger owned by the migrator login would block Vault `DROP ROLE` revocation; migrations run as `fray_owner`.
- Terraform drift on Podman: custom `network_mode` reads back as `bridge` and IPAM as `host-local`; use `networks_advanced` and declare `ipam_options`.
- Vault dynamic-credential revocation on PostgreSQL 16+: `createrole_self_grant = 'set, inherit'` and terminate-then-`DROP ROLE` revocation.
- `podman build` denied access to `~/Documents` by macOS privacy controls: build contexts are staged to a clean temp copy.
- `git diff --check` rejected Markdown hard line breaks: `.gitattributes` exempts `*.md`.

### Security

- No Vault root token remains after bootstrap; the API holds no Vault token; AppRole secret-id and token bound to the private project CIDR.
- Session digests are HMAC-SHA256 with a Vault-held key: a database dump cannot be replayed as a cookie.
- PostgreSQL superuser has no network password (local socket via `podman exec` only); bootstrap secret is a host file outside Git and Terraform state.
- Vault unseal key and initial root token only in `~/.config/f-ray-grance/vault-init.json` (0600); unseal via request body on stdin, never argv.
- No host port bound to `0.0.0.0`; gateway and Vault operator port are loopback-only.
