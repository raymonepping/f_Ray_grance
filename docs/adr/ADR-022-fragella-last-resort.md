# ADR-022: Fragella as the last-resort fragrance source

Status: Accepted by explicit operator instruction, 2026-10-27.

The operator added the Fragella API (`https://api.fragella.com/docs.html`), with its key in `.env`. It is to be used only as a last resort, because the free plan allows 20 calls per month (prompt `20_fragella_source.md`).

## Decision

- **Order.** Scento, NoteboxD, ScentRev, Fragella, web research. Migration `0009` adds provider `fragella` at rank 33 in `app.claim_rank`, moves other providers to 34, and leaves every other rank unchanged.
- **Last resort, enforced by the server.** A Fragella check is refused (`409`) unless a gap remains for its rank and NoteboxD has been checked for the fragrance in the last 24 hours, or NoteboxD is off. ScentRev is skipped while it has no adapter (ADR-020).
- **Budget.**
  - A check costs one call (`GET /fragrances?search=` returns full profiles).
  - Before it, the client reads the free `/usage` endpoint and refuses when the remaining monthly calls are at or below a reserve (default 2).
  - Fragella's `429`, `402` and `503` are surfaced and never retried, and only `2xx` responses are counted by Fragella.
  - An observation is reused for 30 days.
- **Identity and mapping.**
  - Fragella's search is fuzzy, so exactly one hit must be the same house and pass `checkExactIdentity`.
  - `OilType` maps to concentration (empty means none), and `Year` (a string) to launch year.
  - Tiered `Notes` become a pyramid when all three tiers are present; otherwise `General Notes` become an untiered list.
  - Values are owner-reviewed and gap-only, stored as origin `provider`, source `fragella`, attribution "Fragella API".
- **Shared code.** NoteboxD and Fragella share one gap-source module (profile shape, exact pick, mapping); each provider has only its own client.
- **Secret handling.** The key moves into Vault at `kv/fray/fragella` (`make fragella-key`, rendered by Vault Agent, read only by the API) and is removed from `.env`. Four third-party keys (TinyFish, ScentRev, NoteboxD, Fragella) now follow one reviewed path: hidden-prompt or stdin storage, one read-only policy line each, Agent-rendered files, rotation without restarts, and no secret in `.env`, Git, logs or process arguments.
- Fragella's terms page redirected to its landing page and could not be read programmatically. The operator should review the Terms of Use linked from `https://api.fragella.com`.
