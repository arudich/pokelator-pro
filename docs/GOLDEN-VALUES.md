# Damage regression reference

All examples below assume both Pokémon are level 50. The eight historical damage ranges are preserved in `tests/golden_cases.json` and now execute the application's real JavaScript calculator in Chromium (`tests/test_app.py`). No damage formula is tuned to these values.

The original screenshot is not present in this workspace. These fully specified sets independently reproduce every historical range with the pinned Smogon Champions engine. This verifies reproducibility, rather than the screenshot's provenance. The original note is preserved unchanged in [GOLDEN-VALUES-LEGACY.md](GOLDEN-VALUES-LEGACY.md).

## Explicit fixture sets

- Sneasler: Jolly (+Speed, −Special Attack), Focus Sash, Pressure; HP 1 / Atk 32 / Def 0 / SpA 0 / SpD 0 / Spe 32 **Champions stat points**. Actual HP 156, Attack 182, Defense 80.
- Kingambit: Adamant (+Attack, −Special Attack), Leftovers, Defiant; HP 0 / Atk 32 / Def 1 / SpA 0 / SpD 0 / Spe 0 stat points. Actual HP 175, Attack 205, Defense 141.
- Singles, no weather/terrain/screens, full HP, no stat stages or allies, outgoing multiplier 1. Neither held item directly boosts these moves. Sucker Punch is assumed to succeed; no turn simulation is performed.
- The default UI team is a demonstration set with a different defensive allocation. The fixtures above are constructed independently of the UI defaults.

| Attacker | Move | Damage | Percent of defender HP |
| --- | --- | --- | --- |
| Sneasler | Dire Claw | 0–0 | 0–0% |
| Sneasler | Close Combat | 352–420 | 201.1–240% |
| Sneasler | Fake Out | 10–12 | 5.7–6.8% |
| Sneasler | Acrobatics | 14–16 | 8–9.1% |
| Kingambit | Sucker Punch | 51–60 | 32.6–38.4% |
| Kingambit | Kowtow Cleave | 61–72 | 39.1–46.1% |
| Kingambit | Iron Head | 117–138 | 75–88.4% |
| Kingambit | Swords Dance | 0–0 | 0–0% |

Percent endpoints truncate to one decimal place; they do not round to nearest. Acrobatics is 55 BP while Focus Sash is held. Its 16 rolls are `14, 14, 14, 14, 14, 14, 15, 15, 15, 15, 15, 15, 16, 16, 16, 16`.

## Corrections to the old note

Jolly boosts Speed, not Attack. The old stat formula omitted level scaling and put nature in the wrong place. The old implementation additionally ran at level 100, divided investment twice, and applied fabricated modifiers. Its test merely searched this document for strings.

Champions uses direct stat points: HP = uninvested HP + SP; other stats = floor((uninvested stat + SP) × nature). Each Pokémon has a budget of 66, with at most 32 per stat. The exception for 1-HP Pokémon is preserved. The metadata's uninvested values are already level-50 stats despite its `baseStats` field name.

For traditional Gen III–IX mechanics (distinct from Champions), the correct stat formulas are:

```text
HP = floor((2 × base + IV + floor(EV / 4)) × level / 100) + level + 10
Other = floor((floor((2 × base + IV + floor(EV / 4)) × level / 100) + 5) × nature)
```

`EV / 4` is not a Champions-SP conversion. For example, 252 EVs with IV 31 at level 50 provides 32 additional points before nature, while 4 EVs provides 1.

See [DATA-SOURCES.md](DATA-SOURCES.md) for upstream mechanics and data sources. Core damage, modifiers, immunities, integer rounding, and random rolls are delegated to the engine rather than approximated here.
