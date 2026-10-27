# ADR-021: NoteboxD as a second source, and an explicit source order

Status: Accepted by explicit operator instruction, 2026-10-27.

The operator added the NoteboxD API (`https://docs.noteboxd.com`) as another fragrance source, with its key in `.env`, and set the source order: **Scento, then NoteboxD, then ScentRev** (prompt `19_noteboxd_source.md`).

## Decision

- **Source order, enforced in one place.** Migration `0008` adds the providers `noteboxd` and `scentrev` and an immutable `app.claim_rank(origin, provider)`: your own entry, official data, Scento, NoteboxD, ScentRev, other providers, derived values, web research. Every effective-value query ranks claims with it instead of an inline `CASE`, so claim time only breaks ties within the same rank.
- **NoteboxD role.** NoteboxD fills gaps in concentration, launch year, note pyramid and listed notes. Use is owner-started and owner-reviewed, field by field, after exactly one search result passes the exact-identity rule (ADR-016, R4). Accepted values are origin `provider`, source `noteboxd`, with attribution and a link. A pyramid is proposed only when NoteboxD gives every note a tier; otherwise the notes are proposed as an untiered list.
- **Observed contract.** The live API differs from its published docs (brand in `subtitle`; notes as a flat list with a per-note `pyramid` tier; `launchYear`; `concentration`). The adapter follows observed responses, kept as fixtures without the key.
- **Cost.** NoteboxD is pay-per-call with a 50-call daily free tier. Only the 1¢ search and profile endpoints are used. A local daily budget (default 40) and the server's rate-limit headers are respected. Billing (`402`) and quota (`429`) errors are surfaced, and a profile observed in the last 24 hours is reused. Caching is explicitly encouraged by the NoteboxD docs.
- **Secret handling.** The key moves into Vault at `kv/fray/noteboxd` (`make noteboxd-key`, rendered by Vault Agent, read only by the API) and is removed from `.env`.
- The NoteboxD website's legal pages sit behind a bot challenge and could not be read programmatically. Use stays within the developer docs' guidance: per-call API use with caching, no scraping of the website. The operator should review `https://www.noteboxd.com/legal/terms` in a browser.
