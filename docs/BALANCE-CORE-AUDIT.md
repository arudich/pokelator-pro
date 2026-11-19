# Balance fixed-core audit

Roster/usage snapshot: 2026-11-16T17:15:21.915Z.

Rule: lock the two most common reported moves; sample two other distinct moves by relative usage. This is an explicit approximation, not observed co-occurrence. Coverage inclusion rates change after conditioning on the fixed pair.

References are deduplicated across forms. The JSON contains every reference and all affected forms; the tables below cover the top 100 usage references in each format.

Cautions distinguish a weak second anchor (≤50%), a variable second anchor (<75%), cores without a repeatable supported attack, and missing coverage. These are warning signs, not proof that a particular pair never co-occurs.

Regenerate: `.venv/bin/python scripts/audit_balance_movesets.py --top 100`.

## Doubles

100 references: 7 have a missing/≤50% second anchor; 6 have no repeatable supported attack in the core; 40 have at least one caution.

| Rank | Pokémon reference | Locked moves | Caution |
| --- | --- | --- | --- |
| 3 | Garchomp | Protect (67.4%) + Rock Slide (64.9%) | Variable fixed pair: Rock Slide appears on 64.9% of sets. |
| 7 | Indeedee-F | Follow Me (98.9%) + Helping Hand (80.6%) | Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |
| 8 | Raichu | Fake Out (82.3%) + Protect (71.8%) | Variable fixed pair: Protect appears on 71.8% of sets. Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |
| 11 | Archaludon | Electro Shot (96.2%) + Protect (92.3%) | Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |
| 14 | Farigiraf | Trick Room (94.2%) + Psychic (55.7%) | Variable fixed pair: Psychic appears on 55.7% of sets. |
| 21 | Sylveon | Hyper Voice (99.7%) + Detect (68.1%) | Variable fixed pair: Detect appears on 68.1% of sets. |
| 27 | Indeedee | Expanding Force (99.1%) + Trick Room (51.5%) | Variable fixed pair: Trick Room appears on 51.5% of sets. |
| 28 | Volcarona | Protect (56.9%) + Struggle Bug (50.9%) | Variable fixed pair: Struggle Bug appears on 50.9% of sets. |
| 30 | Dragonite | Protect (74.7%) + Dragon Pulse (69.8%) | Variable fixed pair: Dragon Pulse appears on 69.8% of sets. |
| 32 | Metagross | Psychic Fangs (94.4%) + Protect (67.1%) | Variable fixed pair: Protect appears on 67.1% of sets. |
| 40 | Politoed | Protect (81.3%) + Weather Ball (74.2%) | Variable fixed pair: Weather Ball appears on 74.2% of sets. |
| 44 | Sableye | Encore (53.5%) + Light Screen (47.7%) | Weak fixed pair: Light Screen appears on only 47.7% of sets. Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |
| 46 | Blastoise | Water Spout (85.9%) + Protect (61.3%) | Variable fixed pair: Protect appears on 61.3% of sets. |
| 47 | Annihilape | Rage Fist (60%) + Protect (49.5%) | Weak fixed pair: Protect appears on only 49.5% of sets. |
| 48 | Drampa | Dragon Pulse (68.5%) + Protect (67.8%) | Variable fixed pair: Protect appears on 67.8% of sets. |
| 49 | Absol | Night Slash (95.6%) + Close Combat (74.3%) | Variable fixed pair: Close Combat appears on 74.3% of sets. |
| 50 | Blaziken | Detect (73.8%) + Close Combat (50.8%) | Variable fixed pair: Close Combat appears on 50.8% of sets. |
| 51 | Ninetales-Alola | Blizzard (93.6%) + Aurora Veil (67.2%) | Variable fixed pair: Aurora Veil appears on 67.2% of sets. |
| 53 | Talonflame | Tailwind (96.3%) + Flare Blitz (62%) | Variable fixed pair: Flare Blitz appears on 62% of sets. |
| 54 | Lucario | Aura Sphere (84.1%) + Flash Cannon (71.5%) | Variable fixed pair: Flash Cannon appears on 71.5% of sets. |
| 55 | Maushold-Four | Follow Me (82.9%) + Protect (75%) | Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |
| 56 | Dragapult | Protect (50.9%) + Dragon Darts (48.7%) | Weak fixed pair: Dragon Darts appears on only 48.7% of sets. |
| 58 | Corviknight | Brave Bird (72.2%) + Roost (68%) | Variable fixed pair: Roost appears on 68% of sets. |
| 60 | Alakazam | Expanding Force (90.1%) + Protect (74.4%) | Variable fixed pair: Protect appears on 74.4% of sets. |
| 63 | Hydreigon | Dark Pulse (85.1%) + Draco Meteor (74.6%) | Variable fixed pair: Draco Meteor appears on 74.6% of sets. |
| 65 | Zoroark-Hisui | Icy Wind (48.3%) + Bitter Malice (45%) | Weak fixed pair: Bitter Malice appears on only 45% of sets. |
| 70 | Meowscarada | Flower Trick (93.7%) + Triple Axel (72.5%) | Variable fixed pair: Triple Axel appears on 72.5% of sets. |
| 72 | Rotom-Wash | Hydro Pump (94.8%) + Will-O-Wisp (65.7%) | Variable fixed pair: Will-O-Wisp appears on 65.7% of sets. |
| 73 | Tsareena | Triple Axel (83.7%) + Power Whip (61.6%) | Variable fixed pair: Power Whip appears on 61.6% of sets. |
| 74 | Kangaskhan | Fake Out (94.3%) + Double-Edge (46%) | Weak fixed pair: Double-Edge appears on only 46% of sets. |
| 75 | Gyarados | Waterfall (94.5%) + Protect (74.4%) | Variable fixed pair: Protect appears on 74.4% of sets. |
| 79 | Clefable | Follow Me (81.6%) + Moonblast (70.1%) | Variable fixed pair: Moonblast appears on 70.1% of sets. |
| 80 | Mimikyu | Play Rough (79.5%) + Trick Room (58.7%) | Variable fixed pair: Trick Room appears on 58.7% of sets. |
| 83 | Weavile | Fake Out (81.7%) + Knock Off (60.3%) | Variable fixed pair: Knock Off appears on 60.3% of sets. |
| 90 | Scrafty | Fake Out (80%) + Knock Off (68.6%) | Variable fixed pair: Knock Off appears on 68.6% of sets. |
| 91 | Malamar | Superpower (93%) + Knock Off (59.4%) | Variable fixed pair: Knock Off appears on 59.4% of sets. |
| 93 | Overqwil | Throat Chop (67.3%) + Minimize (53%) | Variable fixed pair: Minimize appears on 53% of sets. |
| 94 | Greninja | Dark Pulse (73.9%) + Ice Beam (69.8%) | Variable fixed pair: Ice Beam appears on 69.8% of sets. |
| 95 | Snorlax | Protect (65.6%) + Fissure (34%) | Weak fixed pair: Fissure appears on only 34% of sets. Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |
| 99 | Goodra-Hisui | Shelter (49%) + Body Press (47.6%) | Weak fixed pair: Body Press appears on only 47.6% of sets. |

## Singles

100 references: 6 have a missing/≤50% second anchor; 5 have no repeatable supported attack in the core; 44 have at least one caution.

| Rank | Pokémon reference | Locked moves | Caution |
| --- | --- | --- | --- |
| 1 | Garchomp | Earthquake (75.4%) + Stealth Rock (38.4%) | Weak fixed pair: Stealth Rock appears on only 38.4% of sets. |
| 4 | Archaludon | Draco Meteor (68.3%) + Flash Cannon (63.3%) | Variable fixed pair: Flash Cannon appears on 63.3% of sets. |
| 6 | Lucario | Dark Pulse (81.7%) + Aura Sphere (71.7%) | Variable fixed pair: Aura Sphere appears on 71.7% of sets. |
| 7 | Golisopod | Sucker Punch (67.9%) + Leech Life (66.3%) | Variable fixed pair: Leech Life appears on 66.3% of sets. |
| 8 | Charizard | Solar Beam (65.5%) + Flamethrower (43.3%) | Weak fixed pair: Flamethrower appears on only 43.3% of sets. |
| 10 | Salamence | Dragon Dance (74.5%) + Earthquake (71.8%) | Variable fixed pair: Earthquake appears on 71.8% of sets. |
| 13 | Corviknight | Roost (99.1%) + U-turn (72.7%) | Variable fixed pair: U-turn appears on 72.7% of sets. |
| 14 | Dragonite | Flamethrower (67.9%) + Extreme Speed (57.2%) | Variable fixed pair: Extreme Speed appears on 57.2% of sets. |
| 15 | Rillaboom | Grassy Glide (97.6%) + Drum Beating (71.4%) | Variable fixed pair: Drum Beating appears on 71.4% of sets. |
| 19 | Glimmora | Power Gem (80.4%) + Stealth Rock (59.9%) | Variable fixed pair: Stealth Rock appears on 59.9% of sets. |
| 20 | Gyarados | Earthquake (72.9%) + Dragon Dance (62.2%) | Variable fixed pair: Dragon Dance appears on 62.2% of sets. |
| 25 | Gengar | Shadow Ball (80.1%) + Sludge Wave (67.2%) | Variable fixed pair: Sludge Wave appears on 67.2% of sets. |
| 31 | Tyranitar | Knock Off (77.3%) + Stealth Rock (49%) | Weak fixed pair: Stealth Rock appears on only 49% of sets. |
| 37 | Ninetales-Alola | Aurora Veil (95.3%) + Freeze-Dry (74%) | Variable fixed pair: Freeze-Dry appears on 74% of sets. |
| 38 | Clefable | Moonblast (83.6%) + Moonlight (66.3%) | Variable fixed pair: Moonlight appears on 66.3% of sets. |
| 41 | Toxapex | Recover (98%) + Toxic (83.2%) | Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |
| 42 | Slowking-Galar | Sludge Bomb (73.9%) + Flamethrower (72.8%) | Variable fixed pair: Flamethrower appears on 72.8% of sets. |
| 43 | Scizor | Bullet Punch (99.7%) + U-turn (74.4%) | Variable fixed pair: U-turn appears on 74.4% of sets. |
| 46 | Starmie | Aqua Jet (88.5%) + Liquidation (73.8%) | Variable fixed pair: Liquidation appears on 73.8% of sets. |
| 48 | Delphox | Flamethrower (70.7%) + Nasty Plot (55.9%) | Variable fixed pair: Nasty Plot appears on 55.9% of sets. |
| 51 | Venusaur | Earth Power (83.7%) + Sludge Bomb (62%) | Variable fixed pair: Sludge Bomb appears on 62% of sets. |
| 52 | Grimmsnarl | Reflect (88.1%) + Light Screen (85.7%) | Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |
| 55 | Goodra-Hisui | Flamethrower (68.3%) + Ice Beam (60.9%) | Variable fixed pair: Ice Beam appears on 60.9% of sets. |
| 56 | Hatterene | Trick Room (75%) + Draining Kiss (66.4%) | Variable fixed pair: Draining Kiss appears on 66.4% of sets. |
| 59 | Sylveon | Hyper Voice (96.7%) + Yawn (71.9%) | Variable fixed pair: Yawn appears on 71.9% of sets. |
| 61 | Empoleon | Ice Beam (80.4%) + Yawn (60.6%) | Variable fixed pair: Yawn appears on 60.6% of sets. |
| 62 | Ditto | Transform (100%) | Fewer than two reported moves; a fixed pair is unavailable. Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. Fewer than two reported coverage options; the four-move set is incomplete. |
| 63 | Dragapult | Dragon Darts (53.3%) + Shadow Ball (38.6%) | Weak fixed pair: Shadow Ball appears on only 38.6% of sets. |
| 64 | Snorlax | Earthquake (65.2%) + Yawn (50%) | Weak fixed pair: Yawn appears on only 50% of sets. |
| 68 | Lopunny | Fake Out (71.8%) + Close Combat (63.5%) | Variable fixed pair: Close Combat appears on 63.5% of sets. |
| 69 | Kleavor | Stone Axe (100%) + X-Scissor (73.9%) | Variable fixed pair: X-Scissor appears on 73.9% of sets. |
| 71 | Zoroark-Hisui | Flamethrower (63.9%) + Bitter Malice (62.4%) | Variable fixed pair: Bitter Malice appears on 62.4% of sets. |
| 74 | Skarmory | Roost (67.8%) + Stealth Rock (61.8%) | Variable fixed pair: Stealth Rock appears on 61.8% of sets. |
| 77 | Victreebel | Strength Sap (95.4%) + Giga Drain (68%) | Variable fixed pair: Giga Drain appears on 68% of sets. |
| 78 | Politoed | Encore (88.9%) + Perish Song (84.5%) | Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |
| 80 | Sableye | Foul Play (67.4%) + Encore (64.8%) | Variable fixed pair: Encore appears on 64.8% of sets. |
| 84 | Whimsicott | Moonblast (85.2%) + Encore (69.2%) | Variable fixed pair: Encore appears on 69.2% of sets. |
| 86 | Kangaskhan | Ice Punch (68.9%) + Earthquake (67.9%) | Variable fixed pair: Earthquake appears on 67.9% of sets. |
| 89 | Armarouge | Armor Cannon (95.1%) + Destiny Bond (66.6%) | Variable fixed pair: Destiny Bond appears on 66.6% of sets. |
| 90 | Scolipede | Baton Pass (59.1%) + Earthquake (54.2%) | Variable fixed pair: Earthquake appears on 54.2% of sets. |
| 95 | Tinkaton | Gigaton Hammer (94.6%) + Encore (69.9%) | Variable fixed pair: Encore appears on 69.9% of sets. |
| 97 | Incineroar | Flare Blitz (75.5%) + Parting Shot (74.9%) | Variable fixed pair: Parting Shot appears on 74.9% of sets. |
| 98 | Arboliva | Giga Drain (78.1%) + Earth Power (65.4%) | Variable fixed pair: Earth Power appears on 65.4% of sets. |
| 99 | Vaporeon | Wish (63.6%) + Yawn (52.4%) | Variable fixed pair: Yawn appears on 52.4% of sets. Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies. |

## Clefable example

Doubles Clefable always brings Follow Me (81.6%) + Moonblast (70.1%) under this rule. The remaining two slots vary. Attacks in the fixed core can no longer be omitted, though recovery/support strategies and joint item/nature/spread correlations remain outside this model.
