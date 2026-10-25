# Phase 12: Perfume images

Prompt FRAY-CLAUDE-12 (accepted under [ADR-011](../docs/adr/ADR-011-phase12-perfume-images.md)). Agent Claude (claude-opus-5-5). Date 2026-10-25. Prerequisite verified: Phase 11 completed and pushed as `1674a32`, CI Gitleaks green. Phase 10 stays **blocked**; `last_successful_phase` stays 09.

## State

`scripts/state.py` and `prompts/STATE_CONTRACT.md` admitted phase 12 on the same terms as Phase 11; the validator previously stopped at 11. Phase 12 was checkpointed `in_progress` with baseline `1674a32` and planned scope, then completed (below).

## Image source verification

- **Scento:** the live OpenAPI was fetched once on 2026-10-25 (`/api/perfume/v1/openapi.json`, v1.0.0, 14 paths). It contains no image, photo, picture, bottle, thumbnail or media field. The perfume profile payload has none either. Scento therefore stays in the chain as an explicit `SOURCE_UNSUPPORTED` slot. No page extraction or scraping was built, and no image URL was invented.
- **Approved remote provider and manual external URL:** both are implemented, and both are **off** until the operator approves hosts (`FRAY_IMAGE_PROVIDER_HOSTS`, `FRAY_IMAGE_EXTERNAL_HOSTS`). The live stack has none configured. The UI and API say so, and live requests return `SOURCE_DISABLED` with a durable failed record. Remote fetch success, failure, dedupe and refresh are proven in integration tests behind the real allowlist check, using a fake transport. No external image host was contacted.
- **Owner upload:** the approved source in use, with precedence 1. Verified live with synthetic images.

## Implemented

- **Source chain** (`apps/api/src/images/sources.ts`): typed adapters for upload, approved remote, Scento (unsupported) and manual external. The precedence is upload > approved remote > Scento > manual external, mirrored exactly by SQL `app.primary_image()`.
- **Secure ingestion** (`net.ts`, `signature.ts`, `process.ts`):
  - https only, port 443 only, no credentials and no IP literals;
  - exact or `*.domain` host allowlist;
  - every DNS answer checked against private, loopback, link-local, CGNAT, multicast, reserved and mapped/NAT64 ranges inside the connection's own lookup, so rebinding cannot bypass it;
  - manual, re-validated redirects (at most 3), a 10 s deadline and a 10 MB streaming cap;
  - the declared type must be JPEG, PNG or WebP;
  - magic bytes must match, HTML and SVG are refused, and a full decode must succeed;
  - edges between 64 and 12000 px;
  - a WebP display derivative of at most 1200 px, with EXIF and GPS dropped.
- **Persistence:** migration `0005_perfume_images` (expand-only) adds `app.image_assets` with the spec's fields plus `byte_size`, `failure_code` and `failure_detail`. It includes:
  - integrity checks: an available image must have its checksum, type, dimensions and storage; only available images can be primary;
  - one explicit primary per owner and fragrance/variant;
  - per-context checksum dedupe;
  - an updated-at trigger and `app.primary_image()`.
  Binaries live on the new protected Terraform data-root volume `fraygrance_image_assets`, which has `prevent_destroy` and is mounted in `fray-api` at `/var/lib/fray/images`. Files are content-addressed, written atomically, and deleted only when no record references them.
- **API** (`routes/v1/images.ts`, owner-protected and CSRF-checked):
  - `GET /fragrances/:id/images` returns the images, the effective primary and the source chain status;
  - `POST /fragrances/:id/images/upload` takes a raw JPEG, PNG or WebP body (10 MB limit, 20/min);
  - `POST /fragrances/:id/images/remote` (10/min);
  - `POST /images/:id/refresh`: a failed check keeps the stored copy and the primary, and records the failure;
  - `PUT` and `DELETE /images/:id/primary`, and `DELETE /images/:id`;
  - `GET /images/:id/display|original` serves with `nosniff` and `private, max-age=86400`.
  Rejected uploads and failed remote imports are recorded durably with a typed code. Another owner's image behaves as missing.
- **Read adapters:** the effective primary image id is added to the collection list, fragrance profile, Compare profiles, Discover recommendations and Academy practice list.
- **UI:**
  - `FragranceImage` has a stable 4:5 frame, lazy loading, and a placeholder that says "No verified image yet" instead of showing a broken image. It falls back to the placeholder on load error.
  - It renders in Collection rows, the fragrance detail hero, Compare cards, Discover suggestions and Academy practice.
  - `ImageManager` on the detail page lets the owner upload (with attribution and an optional "make primary"), attach from an approved host (shown only when enabled), set or clear the primary, refresh, and remove with confirmation. It also shows source, attribution, licence notes, dimensions, last check, failure diagnostics and the four-step source chain with each step's on/off reason.
- **Operations:**
  - `make backup` archives the image volume (read-only, no network) after the dump, with its own checksum JSON. A quoting bug in the new summary line was found and fixed by the drill below.
  - `make restore-test` verifies that archive and that every referenced image file is present.
  - `make health` checks that the volume is mounted and writable.
  - The synthetic purge deletes image rows and the files only that owner used.
  - The restore smoke test proves image metadata is writable and that a failed image is never primary.
  - Docs: `docs/recovery.md`, `docs/runbook.md`, and the `spec/PERFUME_IMAGE_SPEC.md` implementation notes.

## Owner-reported fix during this phase: untiered Scento notes

The owner reported that Discover showed an exact match for **Hugo Boss Boss Bottled Elixir** with every tier "Not listed" and no concentration. The live Scento profile (fetched once) has `pyramid: null` and `concentration: null`, so those parts were truthful. But it also lists untiered `notes` (Incense, Vetiver, Cedarwood), `signature_materials` and a character line, and the adapter was dropping the notes and materials.

Fix:
- The adapter now keeps them as their own provenance-labelled claims, `listed_notes` and `signature_materials`. They are never put into a tier or drawn as chromatogram peaks.
- An unchanged observation stored earlier gains these claims on its next fetch.
- Indicative traits and Compare's "what differs" now use these known notes.
- The import validator accepts the two fields with strict list validation.
- Discover and the detail view show "Listed notes: Scento lists these without top, heart or base tiers", plus the character line.
- A captured contract fixture, an API test and a live browser test cover it.

## Validation

| Check | Result |
|---|---|
| `make test` (typecheck, API/DB tests on fresh PG18 incl. 17 image tests + 2 untiered-notes tests, web unit 35/35, infra/secret checks) | PASS |
| `make validate-docs` (71 frozen docs rehashed after the spec update) | PASS |
| `impeccable detect --json app` | `[]` |
| `make backup` before migration, `make provision AUTO_APPROVE=YES` (data: +1 volume; app: api/web replaced, 0 data destroyed), `make configure` (`0005_perfume_images` applied once) | PASS |
| `make health` (incl. image volume mounted + writable) | PASS |
| `make drift` | NO_DRIFT data and app |
| `make test-e2e` | **40/40 PASS**. Covers: placeholders on every surface without images; owner upload becomes and stays primary; a second upload doesn't replace it; set or remove the primary; HTML upload rejected; both remote kinds `SOURCE_DISABLED`; anonymous image request 401; images in Collection, detail, Compare and Academy practice at 1440 and 390 px, axe-clean in both themes with no overflow; live Boss Bottled Elixir listed notes. |
| Image backup/restore drill (temporary `probe-` owner, synthetic 320×400 PNG) | `IMAGES_OK files=2`, `RESTORE_SMOKE_PASS`, `RESTORE_TEST_PASS tables=23`, `IMAGES_CHECK_PASS referenced=1`; probe owner and its file purged |
| Live security probe `p03` | 39/39 PASS |
| No binaries in Git | No JPEG, WebP, tar or dump files tracked or staged; the only PNGs are e2e evidence screenshots of synthetic images |

Synthetic owners and their image files are purged after every run (asset volume verified empty of their files). The real owner account was not touched, and no real perfume photograph was used.

## Security and persistence

There is no crawler, search or catalogue mirroring: remote adapters fetch exactly one owner-given URL on an approved host. Image binaries are outside Git and outside disposable containers, in a protected volume that survived api/web replacement. The volume is not a backup; the manual backup now archives it, and the restore rehearsal checks it. The browser never fetches untrusted origins: images are served same-origin, and CSP `img-src 'self'` is unchanged.

## Open issues and residual risks

- Remote sources stay unproven against a real external host until the operator approves one. Use only hosts whose terms allow storing a personal copy, and record the licence notes.
- A real recovery restores images by extracting the archive into a fresh volume. Like production promotion in general, this is documented but not yet exercised.
- The JSON export carries no image metadata or binaries; images are protected by the backup archive.
- The image upload control uses the browser's native file input (styled), and the Images panel starts collapsed.
- Phase 10 recovery blockers, deferred Tailscale (ADR-009) and disabled import are unchanged. No release-ready claim.

## Next phase / handoff

There are no further accepted phases. Outstanding work is the operator-dependent Phase 10 recovery gates. Optional next steps: approve an image provider host, and configure `FRAY_TUTOR_MODEL` if a local generative model is wanted.
