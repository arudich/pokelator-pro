# Testing Changing Usage Data

Usage rankings, movesets, items, abilities, natures, and reported stat spreads are inputs, not constants. A valid change in the meta must not fail the nightly updater just because a named Pokémon crossed a cutoff or changed its most common build.

- Use fresh downloaded data for integration invariants: complete, valid, calculable builds; sorting and cutoff membership derived from current data; cache/direct consistency; preservation of saved teams.
- Use `self.load(frozen_usage=True)` for a named regression scenario with specific common moves, items, abilities, or expected matchup outcomes. `usage_fixtures.json` is deliberate test input, not a statement about today's ladder. Fixtures are applied before app initialization and on reload.
- Explicitly choose opponents when testing a particular move, tier boundary, preview improvement, or layout. Do not assume the current Top N happens to contain the necessary example or offers a beneficial move swap.
- Keep game mechanics and data-integrity checks. Missing ranks, broken downloads, invalid values, and unexplained loss of coverage still require attention.

Run the normal suite, then test an extreme alternative meta:

```sh
python -m unittest discover -s tests -v
POKELATOR_TEST_META=shifted python -m unittest discover -s tests -v
```

The second mode reverses ranks and usage frequencies and swaps physical/special allocations while keeping mechanics and legality intact. Named fixtures stay fixed; integration cases see the shifted data. Both modes run in CI. Do not automatically regenerate fixtures during nightly refreshes.

Large real changes belong in the health report, not a test failure. Reports retain the top 20 from both the in-game popularity source and measured Showdown usage. Compared with the historical report, half of the top ten changing, a rank change of at least 10 places, a usage change of at least 10 percentage points, or a new top-ten entry from outside the previous top 20 is flagged for review. This does not block publication. Older reports without these fields establish a baseline without inventing a trend.
