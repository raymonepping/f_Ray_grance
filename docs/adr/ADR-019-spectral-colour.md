# ADR-019: Add a spectral colour accent (amends ADR-012)

Status: Accepted by explicit operator instruction, 2026-10-27.

The operator likes the "Scent Spectrometer" console and asked for "a little touch of color": warm orange, vibrant lime and similar, keeping it classy and stylish, so it sparkles a little more (prompt `17_spectral_colour.md`).

## Decision

- Add a **spectral ramp** from vibrant lime (fresh) to warm orange (warm), as semantic tokens in both themes: `--spectrum-fresh` and `--spectrum-warm` for graphics, and `--spectrum-fresh-text` and `--spectrum-warm-text` for text. Lab paper uses deeper values that keep WCAG contrast.
- Colour follows the scent. It is used only for:
  - scent data: chromatogram traces from top to base; the My Spectrum Fresh ↔ Warm track, pole labels and ticks; trait bars of the fresh-pole and warm-pole traits;
  - the brand: the Spectral F's arms and the favicon;
  - the current place: the active navigation marker;
  - the sign-in backdrop.
- **"The One Signal Rule" of ADR-012 is amended.** Lime remains the only colour that states something: verified identity or a live connection, always as a dot plus a word. The spectral ramp may include lime, but it never marks a status, an action or decoration outside the uses above, and it is never the only carrier of meaning.
- Readouts and counters stay ink. A warm "Owned" count was tried during implementation; beside the lime "Verified" count it read as a status, so it was removed.
- Unchanged: graphite and ice-white surfaces, ink primary actions, warn/bad status colours, focus rings, typography, layout and motion. No gradients on surfaces or buttons, no glows, no new animation.
