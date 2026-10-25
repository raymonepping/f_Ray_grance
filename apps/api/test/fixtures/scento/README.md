# Scento contract-test fixtures

Five responses captured on 2026-10-25 from the public, keyless Scento Perfume API
(`https://www.scento.com/api/perfume/v1`, terms §22: read-only use permitted; no overloading,
no wholesale copying). They are used **only** as offline test inputs for the adapter and
resolver — not as a catalogue — and keep Scento's attribution (`cite`, `scento_page`).

Source: Scento Perfume API, scento.com — https://www.scento.com/developers/perfume-api

## Phase 11 educational fixtures (captured 2026-10-25, live HTTP 200)

`material-lavender` (note-portrait), `lexicon-sillage` (perfumery-lexicon), `families`
(family-map), `family-green-leaf` (family-detail) and `journal-vetiver` (journal-search):
five on-demand lookups used only as offline adapter tests. Scento content is English.

## Phase 12 untiered-notes fixture (captured 2026-10-25, live HTTP 200)

`profile-boss-bottled-elixir-hugo-boss`: Scento gives no pyramid and no concentration for this
fragrance, only an untiered `notes` list, signature materials and a character line. It guards the
adapter against dropping those facts and against inventing tiers for them.
