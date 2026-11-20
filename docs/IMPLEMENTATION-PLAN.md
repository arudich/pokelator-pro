# Implementation plan

Updated November 16, 2026. See [PROJECT-STATE.md](PROJECT-STATE.md) for the canonical handoff and [DATA-SOURCES.md](DATA-SOURCES.md) for verified data/mechanics sources.

## Completed foundation

- Static battle-first UI, no framework or build system.
- Pinned local Smogon Champions engine; source-derived roster and exact image paths.
- Correct SP stat model, 66 total / 32 per stat; nature pairing and numerical commit validation.
- Outgoing damage with optimal opponent HP/defense spreads at budgets 0/35/64 and an optional opponent defensive nature; incoming damage against our fixed selected build.
- Our known items/abilities, Singles/Doubles, weather, editable own-team sets and percentage damage. Weather-dependent damage abilities are verified with Sand Force and Solar Power.
- Sole/common (≥75% usage) opponent ability assumptions, grey-by-default damage-affecting alternatives, mutually exclusive selection, persistent disable/manual choice, and accurate engine suppression.
- Incoming full-movepool threat ranking: strongest move first, then top five common damaging moves in usage order, with overlaps removed.
- Complete reported stat-spread damage scenarios and source frequencies, expandable spread comparisons, separate maximum-offense ceiling, and move-specific offensive-nature comparison.
- No filled opponent sets; informational common damage-item sprites with descriptions. Multipliers/bypass and opponent comparison flags persist per Pokémon.
- Usage-based offensive/defensive nature defaults at a combined per-stat 75% share, mixed-state flags, persistent overrides and reset to usage defaults.
- Four opponent-relative Speed categories and minimum neutral-nature investment thresholds; our build stays fixed.
- Keyboard opponent search with Mega/form entries, selection, ordering, removal and first-six window.
- Team auto-save/reload, damaged-storage handling, HTML escaping.
- Real browser regression tests and online image smoke check; overlapping cards fixed.
- Team Builder button visibly disabled and labeled planned.

## Next work, in order

1. Expand battle-state controls and document exact supported assumptions; preserve engine ownership of mechanics.
2. Weather/ability/stage speed conditions; preserve the existing four opponent-relative outputs.
3. Team creation/removal and import/export, then opposing-team persistence.
4. Firefox verification and keyboard/focus improvements across dynamic editors; keep laptop density usable.
5. Regulation/legality scope and reviewed data updates.

Do not tune formulas to historical screenshot values. Do not replace actual mechanics with approximate modifiers to make output look plausible. The old screenshot ranges are executable regression cases; their full assumptions are documented separately.

Cloudflare Pages deployment, branch previews and nightly validated data/engine refresh are prepared; see [HOSTING.md](HOSTING.md). This is a Git repository. The production Pages project still requires the owner’s one-time Cloudflare account connection.
