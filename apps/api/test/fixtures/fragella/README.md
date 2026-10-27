# Fragella fixtures

A live response recorded on 2026-10-27 from `https://api.fragella.com/api/v1` (ADR-022), with no key or headers stored. It cost one of the free plan's 20 monthly calls.

- `search-phantom-in-red.json`: `GET /fragrances?search=Phantom in Red&limit=5`

Observed: a non-paginated search returns a plain array, and the search is fuzzy (4 of the 5 results are other fragrances). `OilType` is an empty string when unknown, `Year` is a string, and `Notes` has `Top`, `Middle` and `Base` lists of `{ name, imageUrl }` next to a flat `General Notes` list. The free `/usage` endpoint returns `{ plan, billing_period, limit, usage: { requests_made, requests_remaining } }`.
