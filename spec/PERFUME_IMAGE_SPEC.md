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
