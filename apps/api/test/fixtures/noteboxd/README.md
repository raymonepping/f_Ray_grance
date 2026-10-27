# NoteboxD fixtures

Live responses recorded on 2026-10-27 from `https://api.noteboxd.com/v1` (ADR-021), with no key or headers stored:

- `search-phantom-in-red.json`: `GET /v1/search?q=Phantom in Red&type=fragrance&limit=5`
- `fragrance-phantom-in-red.json`: `GET /v1/fragrances/cmpbr4bu71awl2coocnbji4ta`

The live shape differs from the published docs: the brand is in `subtitle` (search) or `brand.name` (profile), notes are a flat list with a per-note `pyramid` tier (`TOP`, `HEART`, `BASE`, `UNSPECIFIED`), and the profile has `launchYear` and `concentration`. The adapter follows these observed shapes.
