# Screenshots for article 02

Eight real browser captures accompany `article/02.md`. No images were generated or retouched. All collections, ratings and Academy progress shown belong to temporary synthetic demo owners, not the operator.

Seven images are byte-for-byte copies from `../01/`, captured against application commit `08ee5364c49f121128e708d4af48657f3ea1d5cf` on 2026-10-26:

- `collection-desktop.png`
- `discover-ean-desktop.png`
- `detail-desktop.png`
- `research-panel.png`
- `compare-desktop.png`
- `academy-desktop.png`
- `collection-mobile.png`

`reused-captures.json` retains their original capture metadata, with hashes checked against these copies. These are historical initial-build screenshots, not recaptures of phase 16. In particular, catalogue gaps shown reflect their original capture time. The research panel was captured at rest; no research was started for that image.

`spectrum-desktop.png` is a new, full-page capture of the running application after phase 16. `spectrum-capture.json` records its application commit, timestamp, viewport and hash. It uses one owned Layton on a temporary demo account to show the new single-fragrance qualification. The capture also checks that its plotted tick opens Layton's actual detail page.

To recapture Spectrum, with the stack running, dependencies installed and Node 24 on PATH:

```sh
node article/screenshots/02/capture-spectrum.mjs
```

The script uses the real API and authentication, marks the existing catalogue, creates a temporary synthetic owner, and uses an existing verified Layton if available. If necessary it enriches that exact identity through the normal Scento endpoint. It purges its owner and removes any unreferenced catalogue additions in `finally`. It does not run a clean slate or start a TinyFish research job. Do not enrich other fragrances concurrently: catalogue undo follows the same single-writer rule as the browser suite.

Desktop viewports are 1440 × 900; the phone viewport is 390 × 844. Full-page images can be taller. Reduced motion is enabled. All eight images use the dark theme.
