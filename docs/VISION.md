# Pokelator Pro Vision

## Product goal
Pokelator Pro is a fast, lightweight Pokémon battle calculator designed to help a player reason through damage, matchup, and speed information without friction. The app should feel instant, intentionally narrow in scope, and optimized for real-time use at the table or in a local session.

The priorities below describe the product direction; completed behavior and remaining work are tracked in `PROJECT-STATE.md`.

## Core principles
- Keep hosting cheap and simple: static asset delivery, no server-side game logic required for the MVP.
- Make the site feel instant: local rendering, minimal loading, and no perceptible delays.
- Favor low-friction inputs: type quickly, use arrows, press Enter, and keep movement minimal.
- Keep battle planning centered around the same underlying team and opponent data across views.
- Prefer compact layout and immediate visibility over clever-but-deep menus.

## MVP experience
The MVP begins in Battle View, with a Team Builder button that exists but is intentionally marked as unimplemented. Battle View is built around the core loop of:
- selecting our active Pokémon
- setting our team investment data
- selecting an opponent and listing their team
- comparing damage ranges and speed conditions quickly

We want a very compact information layout where the user can understand the essential matchup information without scrolling on a typical computer monitor.

## Input philosophy
The app should respect the workflow described by the product brief:
- search by typing the leading characters of a Pokémon name
- navigate results with the arrow keys
- confirm with Enter
- treat distinct forms and Mega Evolutions as separate entries, with Mega Evolutions prioritized in the search list
- avoid dropdown-heavy workflows and maximize keyboard efficiency

## Guiding principle

We know everything about our own team. Treat our selected build as fixed, and model unknown investments and nature on the opposing Pokémon. Damage comparisons must not silently boost our attacker or replace our known defenses. Speed tiers describe what the opponent needs to outspeed our fixed build.

## Team data model
Our team is stable across battles and should be saved and restored easily. The app should allow users to define:
- Pokémon identity
- item
- nature
- invested stat points with a budget of 66 total Champions stat points, at most 32 per stat
- direct Champions stat points; avoid mixing them with traditional IV/EV units

The team should remain loaded until the user explicitly replaces it, with state preserved in the current session and supported by local storage.

## Opponent data model
Opposing teams should be lightweight and direct:
- add any number of Pokémon
- delete or reorder entries as needed
- keep the currently selected Pokémon at the top of the list for quick visibility
- show only the first six entries in the live battle roster as default visible entries
- never auto-fill an opposing moveset, investment, nature or held item
- pin the single most damaging movepool threat, followed by five most common damaging moves in usage order, with overlaps removed
- compare reported full stat spreads and their usage frequencies against our exact build; retain a separate maximum-offense ceiling
- show common damage-item sprites and descriptions as hints; do not automatically apply them
- remember multipliers and comparison checkboxes per Pokémon
- show sole/common (≥75% usage) opponent abilities as enabled assumptions, and less-common damage-affecting abilities as grey/off alternatives; allow one active ability at a time
- allow a user to paste or type in a team once and reuse it across the battle without reentry

## Necessary information view
The battle screen should surface the main matchup questions with minimal friction:
- Damage ranges from us to them
- Damage ranges from them to us
- Defensive investment comparisons in simple bands: no investment, half investment, full investment
- Opponent defensive investment optimization with nature flags defaulted from relevant-stat usage (≥75%), plus persistent manual overrides
- A damage multiplier entry that persists per Pokémon
- Clear toggle for showing a 1.0 multiplier without clearing the saved value
- Exactly four opponent-relative Speed outputs: “Always faster”, “Faster only with speed-boosted nature”, “Faster with [num_points] points invested”, and “Always Slower”

## Non-goals for the MVP
- Full team-building management UI
- Full move legality validation against all game-generation rules
- Full server-side storage or login
- Deep historical matchup analysis
- A polished full-screen mobile experience

## Long-term direction
If the MVP proves useful, the next step is to expand the same data model into a proper Team Builder, stronger matchup calculations, and more complete battle simulation while keeping the app fast and cheap to host.
