# Picture tutorial

Four screens introduce the app, with one caption per picture:

1. **Overview** — approximately three-second battle queries using preloaded meta data; team-building previews and browser-saved teams.
2. **Battle** — opponent selection, damage in both directions, weather/terrain, fainted allies, abilities/items, stat stages and Speed scenarios.
3. **Team building** — Speed thresholds, Offense/Team Offense coverage and move previews, Defense spread previews, Balance matchups and optimization.
4. **References** — highlights shared across views/reloads, searching outside Top N, highlighted-only calculations and named sets.

`Huh?` beside the brand opens the tour; the first visit opens it automatically. Close with ×, Escape or the backdrop. Navigate with arrows, arrow keys or dots. The seen flag is stored under `pokelator-pro-tutorial-seen-v1`; removing only that key lets you preview first-visit behavior without deleting teams.

## Before publishing UI changes

The root `AGENTS.md` tells future coding sessions to review **all four pictures** before a live UI push. Refresh every picture containing any changed UI, including pictures whose topic is unrelated to the change. Do not refresh during each local batch of edits.

Run:

```sh
.venv/bin/python scripts/capture_tutorial.py
```

The generator serves the current checkout temporarily, uses isolated browser storage, waits for calculations, captures the actual app with real sprites, then adds labels in HTML and captures four lossless 4320 × 2430 PNGs (3× resolution for both the app captures and composed pictures) into `assets/tutorial/`. It does not read or alter your saved teams. It needs Chromium/Playwright (already used by the browser tests) and network access for sprites. Inspect all four full pictures and the tour overlay before publishing, check the shown controls and captions against the final UI, and update the image version in `components/tutorial.js` when pictures change. `build_site.py` includes these pictures in the public bundle and release hash.

The “about 3 seconds” text describes the intended in-battle query workflow with preloaded data, not a guarantee for every device or a timing claim about the slower optimizers.
