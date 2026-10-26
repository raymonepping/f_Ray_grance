# F-Ray-grance | PERFUME_IMAGE_SPEC.md

**Version:** 1.0 · 2026-10-25  
**Status:** Accepted add-on specification for Phase 12  
**Depends on:** phases 00–11 completed and pushed

## Purpose
Add **source-attributed perfume images** to F-Ray-grance so collection cards, fragrance detail pages, Compare, Discover and Scent Academy can display a reliable bottle image for a fragrance or fragrance variant.

This feature is not a generic image-scraping project. The system must prefer trusted, explainable sources, store durable metadata, preserve attribution and operate safely.

## Desired UX
The app should show a **primary image** for a fragrance whenever available. Example placements:
- My Collection cards and detail pages
- Compare cards and selectors
- Discovery suggestions
- Scent Academy lesson references
- Search results and identity confirmation screens

If no approved image exists, the app must show a graceful placeholder and a clear state such as `No verified image yet`.

## Source strategy and precedence
Image acquisition must follow this order:
1. **User-uploaded image** (owner-provided; always preferred when set as primary)
2. **Approved remote provider image** (if explicitly configured and allowed)
3. **Scento-derived image** only if Scento exposes a usable image source via documented payload or stable page extraction allowed by terms and technical checks
4. **Manual curated external URL** saved by the owner through the admin UI

The implementation must **not** perform open-ended image crawling, arbitrary search-engine scraping or bulk mirroring of third-party catalogs.

## Data model requirements
Introduce or extend an image asset model with at least:
- `image_asset_id`
- `fragrance_id` and optional `variant_id`
- `owner_id` if user-uploaded/private
- `source_kind` (`user_upload`, `scento`, `approved_remote`, `manual_external`)
- `source_ref` (provider path/URL/page)
- `attribution_label`
- `usage_notes` / `license_notes`
- `storage_kind` (`local_persistent`, `remote_reference`)
- `storage_path` or object reference for locally persisted files
- `mime_type`, `width`, `height`, `checksum`
- `status` (`pending`, `available`, `failed`, `rejected`)
- `is_primary`
- `created_at`, `updated_at`, `last_verified_at`

Only one **primary** image should exist per fragrance/variant context.

## Storage model
Images must **not** be committed to Git. Store binaries in a persistent application asset directory or dedicated mounted volume outside the repository. PostgreSQL stores only metadata, references and integrity fields.

The app may generate thumbnails/optimized derivatives, but originals and derivatives must both remain outside Git and survive ordinary container recreation.

## Acquisition rules
- Fetch remote images **server-side** only.
- Validate MIME type, response size, dimensions and file signature.
- Apply SSRF protections and allowlist remote domains.
- Reject HTML masquerading as images.
- Optionally resize/normalize to a bounded web-safe format (e.g. WebP/JPEG), while keeping an original or canonical source copy when policy permits.
- Record attribution and verification status.
- Do not silently overwrite an owner-selected primary image.

## Rendering rules
- Responsive image component with consistent aspect ratio and placeholders.
- Use lazy loading and constrained dimensions.
- Show attribution/metadata in the admin/details UI when applicable.
- Compare and Academy must tolerate missing images without layout breakage.

## Owner controls
Provide owner-scoped actions to:
- upload an image
- set/change/remove primary image
- trigger image refresh for approved remote source
- add a manual external approved URL
- inspect source/attribution/verification state
- delete image metadata and local asset safely

## API requirements
Add protected API endpoints for:
- get fragrance image metadata
- upload image
- attach approved remote image
- refresh/revalidate remote image
- set primary image
- delete image

Keep owner authorization enforced on mutation routes.

## Quality and safety requirements
- No secrets or asset binaries in Git
- No unrestricted remote fetcher
- No direct browser fetch to untrusted origins for primary ingestion
- Explicit handling for missing image, broken remote URL, duplicate image and unsupported format
- Existing backup/restore flow must include image metadata and persistent asset directory checks in the operator procedure

## v0.1/Phase 12 scope
In scope:
- one primary image per fragrance or variant
- trusted-source acquisition chain
- local persistent storage + metadata
- responsive rendering across app surfaces
- owner upload / owner selection / safe fallback

Out of scope:
- multi-image galleries
- automatic OCR on boxes
- image similarity search
- arbitrary internet image scraping
- social sharing / CDN publishing

## Implementation notes (Phase 12, 2026-10-25)

Recorded from the built system; see `reports/12_perfume_images.md` for evidence.

- **Scento:** the Scento Perfume API (OpenAPI v1.0.0, checked 2026-10-25) documents no image, photo or media field on any of its 14 paths. The Scento slot stays in the source chain but reports `SOURCE_UNSUPPORTED`. No page extraction or scraping is performed.
- **Approved hosts:** remote sources are off until the operator lists hosts. Use `FRAY_IMAGE_PROVIDER_HOSTS` for approved providers and `FRAY_IMAGE_EXTERNAL_HOSTS` for owner-entered URLs; both are comma-separated, exact host or `*.domain`, passed through Terraform `api_env`. Remote fetches are https-only on port 443, with no credentials or IP literals. Every DNS answer must be public before a socket opens. Redirects are re-validated, with a 10 MB cap and a 10 s timeout. The declared type must be JPEG, PNG or WebP, and the file signature must match.
- **Storage:** content-addressed files on the protected `fraygrance_image_assets` volume: `<2 hex>/<sha256>` for the original and `<...>.display.webp` for the derivative (at most 1200 px, metadata stripped). `app.image_assets` holds metadata and integrity fields.
- **Primary selection:** `is_primary` is set only by an explicit owner action, with one per owner and fragrance/variant context. The effective image is `app.primary_image()`: the explicit choice, otherwise source precedence, newest first. Imports never change the owner's choice. A failed refresh keeps the stored copy and records the failure next to it.
- **Failures:** rejected uploads (`rejected`) and failed remote imports (`failed`) are stored with `failure_code` and `failure_detail`. No binary is kept for either.
- **Ownership:** every image belongs to the owner who attached it. Binaries are served only through owner-authenticated `/api/v1/images/:id/display|original`. Another owner's id behaves as missing.
- **Portability:** the JSON export does not carry image binaries or image metadata. Images are protected by the manual backup's image archive (`docs/recovery.md`).

## Amendment (ADR-013, 2026-10-26)

- Source chain, in precedence order: owner upload > approved provider (including **Open Beauty Facts by barcode**, `images.openbeautyfacts.org`, CC BY-SA with attribution) > Scento (unsupported) > manual external URL > **web search** (`web_search`).
- **Barcode lookup:** you enter or reuse a bottle GTIN, and the Open Beauty Facts product API returns the product name and front image. You see the product name before picking.
- **Web search:** you start a TinyFish search for one fragrance. Only result pages that contain the exact name are used. Each page's `og:image` becomes a candidate, and you pick one. This is not crawling or mirroring, because each search covers one fragrance and you start it.
- Candidates are held server-side for 30 minutes under an opaque id; the client never supplies a fetch URL. Previews and downloads use the SSRF-guarded fetcher restricted to the candidate's own host.
- The TinyFish key lives in Vault (`kv/fray/tinyfish`, `make tinyfish-key`). An empty key turns web search off.
