# Pokelator Pro

A static Pokémon Champions matchup calculator. No build step, framework, Node installation or API key is needed. Battle math uses a pinned local Smogon engine; roster and art paths come from a reviewed Champions data snapshot.

Run from this directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000. Art needs internet access; the roster and calculator are bundled locally. The roster snapshot is not a tournament legality filter.

Use **Add Pokémon** under Our Team to add members without a team-size cap; select a member and use × to remove it. Use each row’s up/down arrows to change the saved order. Team Offense starts with the first two members active. New members start with the most popular reported nature and spread for the selected format, ready to edit. Mega forms show their required stone and have no editable item slot; saved invalid items are repaired. Type an opponent's name, use arrows, then Enter. Edit our selected set with its “Edit” controls; opponents have no filled moves or investment. Stat fields use Champions points: 66 total, 32 max per stat. Outgoing moves sort by maximum damage in the 0 SP comparison, highest first. Outgoing damage compares optimized opponent HP/defense spreads at budgets 0/35/64; the defensive-nature toggle boosts the opponent’s defense. Incoming damage uses our exact build and the opponent’s full movepool: the single strongest move first, followed by five most common damaging moves sorted by damage, with duplicates removed. Each move compares reported complete SP spreads and their original usage percentages against our exact build, with more spreads expandable and a separate maximum-offense ceiling. Offense and defense nature flags default from the combined usage of natures boosting the stat each move uses (≥50%); mixed flags indicate different defaults across moves. Saved manual flags remain overrides, and “Use usage defaults” restores automatic behavior. The compact Speed panel shows Normal, Choice Scarf and Tailwind scenarios, each using one of four categories describing what the opponent needs to outspeed our fixed build. Tabs switch attack direction. Doubles is the default format; Singles, weather and terrain remain selectable. Electric, Grassy, Misty and Psychic Terrain affect both damage directions, including grounded Expanding Force and its Doubles spread behavior. Team edits save automatically when browser storage is available. Offense and defense stat-stage selectors (−6 to +6) persist per Pokémon; both opponent nature flags persist per opponent. Right-side item sprites (≥5% usage) show descriptions on hover/focus. Click to activate one item per opponent; its bright border marks selection, and its effect applies to damage calculations. Click again to deactivate. Item choices persist per Pokémon and start unset. Ability icons assume a sole ability or one with ≥50% usage; less-common damage-affecting alternatives start grey/off. Click to toggle an assumption, with only one active at a time and the choice remembered per opponent. Selected weather interacts with our chosen ability and the assumed opposing ability, including Sand Force in Sand.

For browser tests (the existing `.venv` already has Playwright/Chromium):

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m playwright install chromium
.venv/bin/python -m unittest discover -s tests -v
# Separate online check of representative real images:
.venv/bin/python scripts/verify_assets.py
```

Tests use a temporary loopback server and close it afterward. No pytest is required.

- [Hosting, branch previews and nightly updates](docs/HOSTING.md)
- [Project state and next priorities](docs/PROJECT-STATE.md)
- [Data sources, mechanics and limitations](docs/DATA-SOURCES.md)
- [Executable damage reference](docs/GOLDEN-VALUES.md)

Team Builder switches between Speed and Offense panels in the same space. Speed uses larger grouped icons and a centered base-Speed tie row. Offense groups opponents by KO tier using an internal usage-weighted result across reported SP spreads, sorts by that result without displaying it, and exposes the data caveat under its assumptions note. It defaults to the top 100 usage-ranked Pokémon; change the Top field to adjust the cutoff. The cutoff is remembered, and base-Speed matches stay visible. Open **Other Teams** for named autosaved teams, JSON export/import and snapshot share links. Existing saves migrate automatically. Showdown text pastes, regulation filtering and richer battle-state/ability-speed controls remain unfinished. Firefox verification is still pending.

To package the static site for Cloudflare Pages, run `python3 scripts/build_site.py`; the public output is `dist/`. See the hosting guide above for the one-time GitHub/Cloudflare connection. Nightly refreshes validate usage snapshots, released engine updates and move metadata before publishing.
