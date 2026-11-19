# Defensive spread search

The production search uses a small coarse grid and a balanced allocation, then refines three promising starts by moving points between HP, Defense and Sp. Def. Transfer sizes shrink to one point. Final one-point moves stop at a local optimum or a hard cap of 112 distinct evaluations, including the baseline. Repeated evaluations are cached, and the search yields after every four new evaluations. Existing investment, the total budget and per-stat caps remain fixed.

The objective is opposing KO tier points first, then total weighted incoming damage to break ties. This is an approximation; it need not find the global optimum in every matchup.

## Brute-force comparisons

Run `.venv/bin/python -m unittest discover -s tests -p test_defense.py -v`.

The benchmark uses the bundled Doubles usage data, all reported moves/spreads, usage-based ability/nature defaults, no weather/terrain and no optional items. Opponents are Kingambit, Mega Medicham, Gardevoir, Garchomp, Sylveon and Basculegion. Each defender starts with 32 Sp. Atk and 2 Speed SP, leaving 32 free points. Brute force evaluates all 561 legal allocations. Its result is the reference optimum for each fixed fixture, including the continuous damage tie-breaker.

| Defender | Reference HP / Def / Sp. Def | Reference opposing tier points | Search result | Search evaluations | Brute force |
| --- | --- | --- | --- | --- | --- |
| Mega Chandelure | 28 / 4 / 0 | 10.5 | Exact match | 50 | 561 |
| Salamence | 19 / 13 / 0 | 12.5 | Exact match | 64 | 561 |
| Sylveon | 26 / 6 / 0 | 8.5 | Exact match | 49 | 561 |

These runs used 89–91% fewer spread evaluations. The regression test permits up to 1.5 additional opposing tier points across these six opponents, while also enforcing the evaluation budget, legal allocations and unchanged input builds. Current results match both reference objectives exactly. Separate tests cover a small exact fixture, nearly filled defense stats and cancellation.

The benchmark reuses damage caches between searches, so evaluation counts are the useful comparison; wall-clock timings depend on cache warmth and the machine.
