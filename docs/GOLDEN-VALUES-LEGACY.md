# Pokelator Pro Golden Validation Set

These values are a fixed regression set taken from the verified reference screenshot. They are intended for testing only and should not be used to derive or tune the damage formula itself.

Important: all examples below assume both Pokémon are level 50.

## Reference formula

Use the canonical Pokémon formula from Smogon/official game logic:

- Stat value from EVs/investment:
  - `stat = floor((2 * Base + 31 + EV / 4) * NatureMod / 100) + 5`
  - `HP = floor((2 * Base + 31 + EV / 4) / 100) + Level + 10`
- In this app, the conversion from EVs to stat investment is:
  - `investment = EV / 4`
- Damage formula (core):
  - `damage = floor(((2 * Level + 10) / 250) * (Attack / Defense) * Power + 2)`
- Apply all relevant modifiers after that: STAB, type effectiveness, target, item, weather, critical, and move-specific effects.

## Verified screenshot values

### 1) Sneasler vs Kingambit — Dire Claw
- Attacker: Sneasler
- Level: 50
- Nature: Jolly (+Atk, -SpA)
- Item: Focus Sash
- Move: Dire Claw
- Defender: Kingambit
- Level: 50
- Defense: 0 HP / 4 Def
- Result: `0-0%`

### 2) Sneasler vs Kingambit — Close Combat
- Attacker: Sneasler
- Level: 50
- Nature: Jolly (+Atk, -SpA)
- Item: Focus Sash
- Move: Close Combat
- Defender: Kingambit
- Level: 50
- Defense: 0 HP / 4 Def
- Result: `201.1-240%`

### 3) Sneasler vs Kingambit — Fake Out
- Attacker: Sneasler
- Level: 50
- Nature: Jolly (+Atk, -SpA)
- Item: Focus Sash
- Move: Fake Out
- Defender: Kingambit
- Level: 50
- Defense: 0 HP / 4 Def
- Result: `5.7-6.8%`

### 4) Sneasler vs Kingambit — Acrobatics
- Attacker: Sneasler
- Level: 50
- Nature: Jolly (+Atk, -SpA)
- Item: Focus Sash
- Attack: 252 Atk EVs => 63 investment
- Move: Acrobatics (55 BP)
- Defender: Kingambit
- Level: 50
- Defense: 0 HP / 4 Def
- Result: `14-16 damage` and `8-9.1%`
- Exact roll set from screenshot: `14, 14, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16`
- Gold assertion: `14-16 (8-9.1%)`

### 5) Kingambit vs Sneasler — Sucker Punch
- Attacker: Kingambit
- Level: 50
- Nature: Adamant (+Atk, -SpA)
- Item: Leftovers
- Move: Sucker Punch
- Defender: Sneasler
- Level: 50
- Result: `32.6-38.4%`

### 6) Kingambit vs Sneasler — Kowtow Cleave
- Attacker: Kingambit
- Level: 50
- Nature: Adamant (+Atk, -SpA)
- Item: Leftovers
- Move: Kowtow Cleave
- Defender: Sneasler
- Level: 50
- Result: `39.1-46.1%`

### 7) Kingambit vs Sneasler — Iron Head
- Attacker: Kingambit
- Level: 50
- Nature: Adamant (+Atk, -SpA)
- Item: Leftovers
- Move: Iron Head
- Defender: Sneasler
- Level: 50
- Result: `75-88.4%`

### 8) Kingambit vs Sneasler — Swords Dance
- Attacker: Kingambit
- Level: 50
- Nature: Adamant (+Atk, -SpA)
- Item: Leftovers
- Move: Swords Dance
- Result: `0-0%` (status/boost move; not damage)

## Recommended testing notes

- Use these values as a fixed golden set for regression checks.
- Keep them independent from any formula-tuning logic.
- All examples assume level 50, matching the approved reference sheet.
- The EV-to-investment conversion is still `EV / 4` before rounding and clamping.

## Short version for test cases

```text
Sneasler / Dire Claw / Level 50 / vs Kingambit 0 HP / 4 Def / expected 0-0%
Sneasler / Close Combat / Level 50 / vs Kingambit 0 HP / 4 Def / expected 201.1-240%
Sneasler / Fake Out / Level 50 / vs Kingambit 0 HP / 4 Def / expected 5.7-6.8%
Sneasler / Acrobatics / Level 50 / 252 Atk / Focus Sash / vs Kingambit 0 HP / 4 Def / expected 14-16 (8-9.1%)
Kingambit / Sucker Punch / Level 50 / vs Sneasler / expected 32.6-38.4%
Kingambit / Kowtow Cleave / Level 50 / vs Sneasler / expected 39.1-46.1%
Kingambit / Iron Head / Level 50 / vs Sneasler / expected 75-88.4%
Kingambit / Swords Dance / Level 50 / vs Sneasler / expected 0-0%
```
