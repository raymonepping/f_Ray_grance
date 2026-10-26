# ADR-013: Web research and owner-started image lookups (TinyFish, Open Beauty Facts)

Status: Accepted by explicit operator instruction, 2026-10-26.

## Context

Scento is the identity and fact source (ADR-004, `spec/DATA_SOURCES.md`). It has gaps: for example, Boss Bottled Elixir has no pyramid and no concentration in Scento. Scento also exposes no images (`spec/PERFUME_IMAGE_SPEC.md`, Phase 12 notes). The operator asked for three things:

- fill Scento's gaps as a new, lower-trust source labelled "web research";
- look images up by the bottle's barcode instead of pasting a URL;
- use TinyFish for web search, since this is a personal collection used within personal-use limits.

The operator supplied a TinyFish API key and asked that it live in Vault.

## Decision

1. **Web research is its own, lowest-trust origin.**
   - Facts found on the web are stored as `source_claims.origin = 'research'`, with a `source_records` row (`provider = 'tinyfish'`) citing the page URL, site and check time.
   - Precedence is `user > official > provider (Scento) > derived > research`. A claim that states nothing (for example an all-unknown pyramid) no longer hides a lower source.
   - Research never changes a fragrance's verified identity, including its identity concentration column. The UI labels research values "Web research".

2. **Research is owner-started and owner-reviewed.**
   - One run uses TinyFish Search with only brand, name and concentration. Result pages count only when their title contains the exact fragrance name as a contiguous phrase, so a flanker does not qualify. The brand's own site is tried first; video and social sites are skipped.
   - At most two pages are read by a TinyFish Agent run with a typed output schema.
   - Output is validated strictly: the exact identity is confirmed, conflicting concentrations are reported and never proposed, notes are sanitised.
   - Proposals are shown with the page and a supporting quote. Only the values the owner ticks are stored, and the server accepts them by proposal id, never by value.
   - The limit is three runs per ten minutes per owner. Agent runs may use TinyFish credits, and the UI says so.

3. **Image lookups produce candidates; the owner picks.**
   - *Barcode:* the Open Beauty Facts product API (`world.openbeautyfacts.org`) for the bottle's GTIN. Only its own image host, `images.openbeautyfacts.org`, is used. Attribution and the CC BY-SA licence note are stored. The product name is shown so a wrong or shared barcode is visible. These images are `approved_remote`.
   - *Web search:* TinyFish Search for the exact fragrance. TinyFish Fetch then reads each exact-name result page's `og:image`/`twitter:image` (free tiers: 12,000 searches and 1,000 fetched URLs per day). These images are a new `image_assets.source_kind = 'web_search'`, the lowest image precedence.
   - Candidates are kept server-side for 30 minutes and addressed by an opaque id. The client never supplies a URL to fetch.
   - Previews and the final download go through the existing SSRF-guarded fetcher, limited to the candidate's own host, with signature, decode and size checks. Stored images keep their page as the source.

4. **The secret lives in Vault.**
   - The key is stored at `kv/fray/tinyfish` (`make tinyfish-key`: hidden prompt or stdin, never echoed, never in argv). Ansible creates an empty placeholder, so the Agent template always renders.
   - Policy `fray-api` gains read on that path only. Vault Agent renders `/vault/rendered/tinyfish.json`, which the API re-reads on each call.
   - An empty key means the features are off and say so. The API still refuses `FRAY_*TOKEN` environment variables.

## Consequences

- `spec/PERFUME_IMAGE_SPEC.md` is amended. Open-ended crawling, bulk mirroring and automated scraping stay out of scope. An owner-started search for one fragrance, with an owner-picked result, is allowed.
- Privacy: only public identity text and result-page URLs go to TinyFish. Ratings, notes, observations and collection data never do.
- Migration `0006` widens three CHECK constraints and updates `app.primary_image()`. It is expand-only.
- Export/import accepts the new origin and provider.
- Web pages can be wrong or inconsistent; the brand's own page labelled Boss Bottled Elixir both "eau de toilette" and "Eau de Parfum". That is why research is the lowest-trust origin and why every value is reviewed and cited.
