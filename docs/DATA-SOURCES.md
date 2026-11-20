# Data and mechanics sources

Original review: November 16, 2026. The current accepted source dates, engine version and hashes are recorded in `data/refresh-status.json` and `vendor/engine.json`; see the automated-refresh section below.

## Champions roster and art

Source: [Champions Battle Data static index](https://championsbattledata.com/data/pokemon-index.json), documented by its [API guide](https://championsbattledata.com/api_guide). This is a fan-maintained Champions source, not an official Pokémon API.

The bundled snapshot was generated upstream at `2026-11-16T17:15:21.915Z`. It contains 263 indexed records and reduces to 347 unique species/forms after expanding `summary.forms` and deduplicating by `saved_name`. The source includes cosmetic forms and Mega forms. Each form's own stats, types, abilities, Showdown name, and exact `image_path` are retained. When records share metadata, a form's own record takes precedence for its move suggestions and learnset. No generic fallback species are merged in. Mewtwo and its Mega forms are absent.

This is a snapshot of the source's Champions roster, **not a tournament regulation eligibility list**. Current regulation filtering remains future work. Roster updates are explicit; the app never silently replaces its data at runtime.

The source's `hp`, `attack`, `defense`, `sp_attack`, `sp_defense`, and `speed` describe **uninvested level-50 stats**. They are not raw species bases, even where the API calls them `baseStats`. Garchomp, for example, reports HP 183 and Attack 150; Mega Garchomp reports Speed 112 (raw species base 92), rather than the old app's erroneous base Speed 128.

Move suggestions are used only for editable **our-team** defaults. Opponents have no filled moves, investment, item, nature or ability. Incoming comparisons use the full source learnset. Full move/item/team legality validation is outside the current scope.

Art remains linked to `https://championsbattledata.com/` using exact metadata paths, with URL encoding performed by `URL`. No PokeAPI artwork or guessed names are used. Art requires network access; the roster and calculator work without external requests. Online verification on November 16 loaded 11 representative 128×128 PNGs, including all default images, featured Mega forms, Aegislash Shield Forme, and Vivillon Icy Snow Pattern. This does not assert availability of every image indefinitely.

To refresh:

```sh
curl -fL https://championsbattledata.com/data/pokemon-index.json -o /tmp/pokemon-index.json
python3 scripts/download_usage.py /tmp/pokemon-index.json /tmp/pokelator-usage --refresh
python3 scripts/build_roster.py /tmp/pokemon-index.json /tmp/pokelator-usage
```

Review the generated diff and run both browser tests and the online asset smoke check before accepting a refresh. The script validates required positive stats and the Champions PNG path prefix; new upstream schema changes require review.

## Battle engine

Use the upstream [Smogon damage calculator](https://github.com/smogon/damage-calc), package `@smogon/calc` **0.12.0**, with **generation 0 (Champions)**, level 50. Browser bundles are stored locally in `vendor/`; no framework, build step, CDN, or Node installation is needed to run the app.

- [Engine bundle](https://unpkg.com/@smogon/calc@0.12.0/dist/production.min.js)
- [Matching data bundle](https://unpkg.com/@smogon/calc@0.12.0/dist/data/production.min.js)
- [Upstream stats implementation, including Champions](https://github.com/smogon/damage-calc/blob/master/calc/src/stats.ts)
- [Upstream mechanics](https://github.com/smogon/damage-calc/tree/master/calc/src/mechanics)
- MIT notice: `vendor/SMOGON-LICENSE`.

`battle.js` adapts the roster and set model to this engine. It converts metadata's uninvested stats to species bases only when constructing engine Pokémon (`HP − 75`, other stats `− 20`, preserving the 1-HP exception). This prevents the upstream metadata naming mistake from inflating stats. Two naming aliases bridge cosmetic/form conventions: Aegislash → Aegislash-Shield; Vivillon-Icy Snow → Vivillon. Their source types and stats remain intact.

Unknown moves or unsupported species return an explicit unavailable result. There is no guessed 70-BP attack. Engine updates must be pinned, reviewed, and regression tested. Bundle SHA-256 values are recorded in `vendor/SHA256SUMS`.

## Application assumptions

- Stat budget: 66 total, max 32 per stat, whole numbers. Older numerical allocations are retained within these bounds; invalid species are discarded when loading. Corrupt/blocked storage cannot crash startup.
- Damage: our selected ability/item/nature and build, no automatic optional opponent item (manual sprite selection applies the chosen item, and Mega forms have their required stone); opponent ability follows the visible single/≥50%-usage/manual selection, full HP, selected stat stages, selected Singles/Doubles, weather and terrain. No screens, allies, status, or turn simulation. Weather and terrain must be selected explicitly; ability activation and battle-state controls remain incomplete.
- Variable multi-hit comparisons request one hit and are labeled accordingly. This is not a hit-count or KO-probability calculator.
- We know our own team completely. Outgoing uncertainty is modeled on the opponent; incoming damage always uses our exact selected build.
- The outgoing 0/35/64 tiers are **comparison scenario budgets**, not game limits. Every integer HP/relevant-defense allocation totaling the budget is evaluated through the engine, with a maximum of 32 per stat. Choose the lowest maximum damage percentage, then the lowest minimum on a tie; show both endpoints from that one spread. Unrelated scenario investments are zero. In automatic mode the opponent’s relevant defense is boosted only when natures raising that stat total ≥50% reported usage; otherwise it is neutral. Manual on/off overrides force a boosted/neutral comparison (Bold for Defense, Calm for Special Defense). No selected-opponent-build reference is displayed because there is no assumed opponent investment. Psyshock-style defense overrides are respected.
- The defensive-nature checkbox never modifies our attacker or our own set. It is disabled for incoming damage. The adjacent offensive-nature checkbox applies only to incoming comparisons: each reported full stat spread is evaluated with a stat-specific automatic or manually chosen neutral/boosting nature (Atk for physical, SpA for special, Def for Body Press). A separate maximum-offense comparison uses 32 SP in the relevant offensive stat; HP is also maximized for Final Gambit and Speed for Electro Ball, which depend on those stats. No sampled set is stored. HP cannot be nature modified.
- Battle View has mutually exclusive −6…+6 offense (Atk/SpA) and defense (Def/SpD) stage choices, saved per Pokémon and side. +0 is neutral; +1 boosts the relevant stat by 50%; negative stages use 2/(2−stage), and positive stages (2+stage)/2. Both stage settings are applied as real engine boosts, including move-specific stat use and Unaware, to both sides in damage and builder calculations. Subsequent self-drops start at the selected stage and respect the ±6 cap. Old arbitrary multipliers/bypass preferences are ignored and migrate to neutral stages. Reset Battle clears stages; investments, nature, ability and actual held items remain exact saved-build inputs. Nature and opponent ability/item preferences keep their existing independent behavior.
- Speed holds our selected build fixed and classifies the opponent. If their neutral-nature Speed at 0 SP strictly exceeds ours, show “Always faster”. Otherwise find the first neutral-nature investment from 1–32 SP strictly exceeding ours and show “Faster with [num_points] points invested”. If only their Speed-boosting maximum exceeds ours, show “Faster only with speed-boosted nature”; if it cannot, show “Always Slower”. Ties are not faster and get no fifth category. Speed-lowering natures are excluded from this envelope. The panel repeats this classification for three independent opponent scenarios, in order: Normal (no item), Choice Scarf (Speed ×1.5, rounded down), and Tailwind (Speed ×2, no Scarf). Choice Scarf is unavailable for Mega opponents. Our selected speed item (Choice Scarf, Iron Ball, Macho Brace) applies in every comparison. These scenarios do not change either saved team or damage calculations. Selected weather/terrain and assumed abilities now apply to both sides: Swift Swim, Chlorophyll, Sand Rush, Slush Rush and Surge Surfer double Speed in their matching field. Air Lock/Cloud Nine suppress weather boosts. Stage/status and other conditional ability effects remain unmodeled in these panels.


## Downloaded usage reference and incoming threat selection

Current per-format move/item/stat-spread/ability/nature percentages were downloaded from **524 CSVs** on November 16, 2026. Source paths are taken from the index’s `Current` entries, not guessed. The generator retains move/item/ability/nature names, percentages, source ranks, reference species and source URLs, plus complete six-stat allocations and frequencies for 5,240 `stat_points` records. Each allocation is validated as integer SP from 0–32 per stat with total ≤66. It excludes unrelated raw battle rows. All 347 bundled species/forms have reference data, with parent-form references explicitly named in the UI. Data is a replaceable current-use cache for this calculator, not an archival or standalone data service.

The refresh helper uses three requests at a time and reuses cached files unless `--refresh` is passed. Rebuild the roster with the usage directory to include actual CSV percentages. Do not substitute the index’s name-only top-move lists for percentages. [Source API rules](https://championsbattledata.com/api-rules/) permit reasonable caching and require attribution; the app links “Battle data provided by Pokémon Champions Battle Data.”

For incoming damage, evaluate supported moves from the opponent’s full learnset against our exact build. Pin the single strongest calculable move at maximum offensive investment, then append the five most common **damaging** moves sorted by maximum-offense damage, highest first (minimum damage breaks ties). Select common-move membership by usage before sorting for display; moves requiring unavailable context follow calculable moves. Remove overlap without replacing that slot with a sixth common move: normally five or six rows result. Usage ties use source rank, then name. Status moves never qualify. If fewer than five damaging moves are reported, show only those available plus the strongest reference; no extra moves or frequencies are invented. Ditto has only Transform and therefore displays no damaging moves.

For each selected move, calculate damage separately for every reported SP spread. Display the most common reported spread and its frequency immediately, alongside the explicit maximum-offense ceiling; expand “Other reported spreads” to inspect remaining allocations and damage. Preserve all six source allocations across mixed physical/special moves, including HP-dependent attacks. The same spread can produce different damage by move. The nature flag is a per-stat comparison assumption informed by marginal nature frequencies, not a sampled full nature or a joint nature/spread probability. No spread is assigned to the opponent record, and our team is never modified.

Spread frequencies describe **all reported sets**; move frequencies describe move usage. The source does not provide their joint distribution, so frequencies are not multiplied, interpreted as conditional probabilities, or renormalized over the top spreads. Unreported spreads remain unknown. If spread usage is absent, state that explicitly and retain only the separately labeled maximum-offense reference. If move frequency is absent, display “Usage not reported”; never invent a zero.

Maximum-offense ranking uses the highest damage percentage, followed by minimum damage percentage, usage, then name to break ties. Counter/OHKO moves can still qualify among common damaging moves, but require turn context or separate accuracy handling and are labeled accordingly rather than given invented damage ranges. Nature, full-HP, item/ability and field assumptions apply equally to reported spreads and the ceiling comparison.

## Informational item sprites

`data/item-hints.js` contains 26 damage-related items identified from [Pokémon Showdown item metadata](https://play.pokemonshowdown.com/data/items.js), with descriptions from [its item text](https://github.com/smogon/pokemon-showdown/blob/master/data/text/items.ts). The MIT license is included as `vendor/SHOWDOWN-LICENSE`. Sprite links are extracted from the [Champions item index](https://championsbattledata.com/items/); all 26 PNGs were verified in the live browser (40×40 pixels).

The right roster displays items with at least **5%** usage for the selected format, sorted in the source’s item order. Tooltip text provides item name, reference species, percentage, effect and whether the item is active. Both mouse hover and keyboard focus reveal it. No optional item is selected automatically. Click a sprite or activate its native button with Enter/Space to select it, replacing the previous item for that opponent; activating the current item clears it. Bright cyan borders/glow and aria-pressed distinguish the active item. The selected item is passed into all engine damage calculations for that opponent in either direction, including defense optimization, incoming spreads/ceilings and move ranking. Engine conditions and item-specific effects are retained rather than replacing them with a generic multiplier. The opponent identity record and our exact team are unchanged. Mega forms do not inherit base-species item hints. The current data reports Life Orb for Kingambit and Fairy Feather for Sylveon; Pixie Plate is not inserted as a substitute.

To rebuild item metadata, download the two Showdown sources above and the Champions item-index HTML, then run:

```sh
python3 scripts/build_item_hints.py /tmp/items.js /tmp/items-text.ts /tmp/items.html
```

Item hints include direct type/power boosts, supported offensive stat boosts, conditional offensive boosts, and critical-rate hints where reported. Descriptions retain conditions; displaying a hint is not a claim that its condition is active.


## Opponent ability assumptions and weather

`usage[format].abilities` comes from the downloaded CSV `ability` rows; every row retains its actual percentage and rank. Legal choices are filtered to the selected form’s metadata ability list, so parent-species usage cannot assign an invalid ability to a Mega or other form. The user-requested common threshold is **50%**, inclusive. A sole available ability is assumed without requiring usage data. When several choices exist, the most-used legal ability reaching 50% is assumed; below that threshold there is no automatic choice.

Other damage-affecting abilities supported by the pinned engine appear in the same ability area grey and off by default. `Battle.isDamageAbility` identifies the engine-supported offensive/defensive/type/stat/weather effects eligible as alternatives. Selecting an alternative disables the previous assumption; selecting the active icon disables all assumptions for that opponent. No two abilities are combined. Tooltips and accessible labels provide the full assumption text; visible labels include assumed/not assumed, source usage or sole-ability reason, and grayscale distinguishes off states. Choice is retained per opponent across direction changes, switching and reload. Manual selections take precedence over the automatic rule until changed. Older saved disable flags are migrated.

The ability name is passed into all incoming spread/ceiling scenarios and all outgoing opponent defense comparisons. It also affects the strongest-move ranking. Resolved move types are taken from the engine, so Pixilate changes Hyper Voice’s type badge as well as its damage. Item choices start unset and are applied only after explicit selection; a selected item affects the same calculations as the ability choice.

Our selected ability is always preserved. The same selected weather is passed to the engine with both sides’ applicable abilities: Sand Force boosts Ground/Rock/Steel damage in Sand, Solar Power boosts special damage in Sun, and immunity/type modifiers remain engine-owned. Ability selection does not force conditional activation, infer switch-in weather, or overwrite the selected weather. Full HP, selected initial stat stages and other currently exposed battle assumptions still apply. The separate Speed panel now applies Swift Swim, Chlorophyll, Sand Rush, Slush Rush and Surge Surfer under the selected field, using our exact ability and the opponent’s visible assumption; disabling an assumption removes its Speed effect.

When an ability is absent or disabled, the adapter passes **`No Ability`** into the engine. Empty strings are unsafe because the pinned engine’s Pokémon clone constructor replaces them with the species default. Regression tests verify that disabling Levitate permits Ground damage and disabling Sand Force removes its Sand boost, with no default ability silently restored.


## Usage-based nature defaults

The roster generator retains the current CSV `stat_alignment` rows as `usage[format].natures`, with name, original percentage and source rank. The engine’s canonical nature definitions identify each raised and lowered stat; the source’s raw stat labels are not used as a second rules table. Neutral natures (raised stat equals lowered stat) contribute no boost share.

For each stat, sum the reported percentages of natures boosting that stat, round the sum to the source’s one-decimal precision, and apply the user’s **50% threshold inclusively**. For example, Bold/Impish/Relaxed contribute together to Defense. Do not combine Attack and Special Attack into one offensive percentage, or Defense and Special Defense into one defensive percentage. Do not count Speed-boosting natures as Attack/SpA boosts. Missing nature data yields no automatic boost and is labeled “not reported”; no frequencies are fabricated or renormalized over the top rows.

Outgoing automatic defense uses each move’s actual defensive stat (including Psyshock’s Defense override); incoming automatic offense uses its actual offensive stat, including Body Press’s Defense. Physical and special moves may receive different automatic decisions for the same opponent. The native checkbox shows a mixed/indeterminate state when only some relevant stats qualify, and the label lists stat-specific shares. The same decision is used for ceiling ranking and every reported SP scenario. Nature, SP spread and move percentages are marginal reference data, not a supplied joint distribution.

`defenseNatureChoice` and `offenseNatureChoice` are `auto`, true or false. Fresh opponents use `auto`; manual checking/unchecking overrides that role for the opponent across formats and reloads. Existing saved legacy booleans are preserved as manual choices because their provenance cannot distinguish an old saved default from an explicit user choice. “Use usage defaults” clears both nature overrides and resumes live format/stat-specific defaults. Our known team is never changed, and no complete nature is assigned to the sparse opponent record.


## Selected terrain

The global Terrain selector defaults to None and supports Electric, Grassy, Misty and Psychic. Its value is passed as `Field.terrain` to the bundled engine for both damage directions, defense optimization, incoming reported spreads/ceilings and move ranking. No terrain is inferred from switch-in abilities. The field remains selected when changing direction or Pokémon; own builds and opponent identities are unchanged.

Grounded checks and terrain mechanics belong to the pinned engine, including Electric/Grassy/Psychic boosts, Grassy Earthquake reduction, Misty Dragon reduction, Psychic priority protection, and Terrain Pulse type changes. In Psychic Terrain a grounded Expanding Force user receives its power boost and targets all adjacent foes, so Doubles spread reduction applies. Flying types, Levitate and Air Balloon are respected. Move badges use the engine-resolved type and target instead of static move data, including Expanding Force’s conditional spread tag. Status prevention and end-of-turn healing remain outside the displayed damage calculation.


## Required Mega items and team editing

Mega forms use a fixed required Mega Stone instead of an editable held-item field. The mapping comes from the pinned engine item metadata (`item.megaStone` form IDs), with complete coverage of all 81 Mega forms in the roster. Sanitization repairs previous saved optional items, startup saves the repaired team, and the adapter independently enforces the required stone for either side in damage and Speed calculations. This preserves held-item mechanics such as Acrobatics while preventing Life Orb, Choice Band, Choice Scarf or other optional item effects on Mega forms. Opponent records remain identity-only; a Mega form’s required stone is derived from its form. Its Scarf speed scenario is marked unavailable. Switching our member from a Mega to a base form clears the required stone and restores an editable item field.

The Our Team panel supports adding roster species/forms with an autocomplete field and Add/Enter without a member-count cap, and removing selected members, including the last member of an empty draft team. New entries use neutral nature and zero SP; moves are editable suggestions, not a downloaded competitive set. Existing members are preserved. Every addition/removal/edit saves locally; invalid species are rejected. Named teams, JSON import/export, snapshot links and the Speed Builder are implemented; full regulation validation and Showdown text paste import remain future work.


## Opponent item selection persistence

`itemChoice` in per-opponent preferences stores one optional item name, or an empty string for none. Manual selections survive Pokémon/direction changes, removal/re-addition, reload and format changes. A selected item remains visible even if no longer among items at ≥5% usage in the chosen format; the tooltip uses the available selected-format frequency or says usage is not reported. Clicks on compact-row sprites update that Pokémon’s preference without changing the selected opponent. Unknown saved item names are ignored, and Mega forms reject optional choices and retain their required stones. All 26 bundled item choices are supported by the pinned engine.


## Named teams and portable snapshots

The primary library is `pokelator-pro-teams-v1` in localStorage: `{version:1, activeId, teams:[{id,name,pokemon,updatedAt}]}`. The old `pokelator-pro-team` array is migrated as My team and remains a mirror of the active working team. Individual teams can be empty drafts or hold any number of members. Saved array order is preserved through loading, exports/imports and links; row up/down buttons edit that order. Team Offense initially activates the first two entries; custom selections remain attached to members during reordering. Switching teams clones builds so later edits do not mutate another team; all model edits update the active record and save the library. Optional damage controls remain in their existing per-Pokémon preferences.

Portable JSON uses `{type:"pokelator-pro-teams",version:1,teams:[{name,pokemon}]}` for both individual and whole-library exports. Team IDs, timestamps and experimental damage multipliers are excluded; species, ability, item, nature, moves and all SP allocations are included. The parser validates the complete file before adding any records, rejects unsupported versions/species/moves/abilities/natures and illegal investment totals, and never replaces existing teams during import. Mega items still follow the mandatory-stone rule. Share links carry a UTF-8 base64url-encoded single-team snapshot in `#team=`; the fragment is removed only after a successful import, preventing repeated imports on reload. Clipboard failures expose the link for manual copying. All operations work on a static host without an account or server.

## Team Builder Speed column

The selected Pokémon’s exact effective Speed is the comparison target, with its current investment, nature and supported speed item. Opponents use the same 0–32 neutral/boosting-nature envelope as the Battle View’s Normal scenario. Selected weather/terrain and the five supported Speed-doubling abilities apply to both sides, with opponent abilities following existing usage/manual assumptions. Stages, status and remaining conditional Speed effects remain outside this panel’s model. The Top input defaults to 100 and filters on the selected format’s overall usage rank; base-Speed matches are always included to preserve the anchor. Values are clamped to 1–262 in this snapshot and saved under pokelator-pro-builder-v1. Forms share their reference species rank and appear once, sorted by base Speed descending; all categories use compact wrapping icon groups, including the 1–16 investment, 16–32 investment and boosting-nature-only thresholds. Individual base-Speed rows are omitted; hover text retains each Pokémon’s exact relationship. Exactly 16 required SP belongs to the higher-investment group to resolve the requested overlapping labels without duplication. Tooltips show the exact threshold.

The user explicitly defined **Speed Tie as equal species base Speed**, not equal effective stats after nature/investment/items. It is a visual base-stat anchor, distinct from the strict outspeeding classification used elsewhere. Source uninvested Speed equals raw species Speed + 20 in this level-50 adapter, so the column displays `stats.spe - 20`. All same-base forms enter the highlighted tie row at their natural base-Speed position; automatic centering uses only the inner scroll container and clamps to its natural start/end. No artificial blank padding is added to force centering of edge tiers. Selected Speed changes and viewport resizes recenter that anchor. No own-team investment or nature is changed to construct comparisons.


## Overall usage rank metadata

`usage[format].rank` is the positive `column_position` value in the downloaded current-format battle CSV. The generator rejects conflicting species positions in one file. This rank is distinct from each move/item/ability/nature/spread row’s conditional rank. The metadata comes from the same November 16 snapshot as the bundled move and build statistics; no unrelated data were refreshed. Mega/cosmetic forms retain their reference record’s rank rather than being assigned invented independent popularity. The API guide confirms that overall species percentages are unavailable, so Top N is a ranking filter, not a measured encounter-coverage percentage.


## Team Builder Offense panel

Offense shares the Speed panel’s space and Top-N setting. It includes exactly the usage-ranked forms at that cutoff; the extra base-Speed matches are specific to Speed. All 100 top-ranked Doubles reference records have reported SP spreads in this snapshot. Offense uses every reported full spread, not just the modal spread; their summed source frequencies cover 29.9%–92.6% of sets across these reference records. This coverage is shown per opponent on hover. Unknown/unreported builds are excluded, not assigned guessed allocations or weights.

For each calculable move from our known set, the engine evaluates each spread with our exact build and the selected format, weather and terrain. Opposing nature/ability flags and selected optional items/required stones follow existing controls. Mean damage is computed from the actual engine rolls (summing expectations for nested hit arrays), divided by that spread’s actual HP, then weighted by its reported usage and normalized by the sum of reported weights. Selected stat stages apply inside the engine before rolls are summarized. Nature, ability, item and SP frequencies are separate marginals; no joint build distribution is fabricated.

The user specified **one usage-weighted average result**, not a weighted majority vote among per-build KO buckets. The internal result selects Probable OHKO at ≥1, Probable 2HKO at ≥1/2, Probable 3HKO at ≥1/3, or The rest. Guaranteed OHKO requires the minimum roll to KO every modeled spread. The move selection prefers such a guarantee; otherwise it chooses the highest internal result. Icons within a tier sort by that result, then usage rank/name on ties. **The synthetic score is never displayed**, either visibly or in hover/alt text. It is not an actual KO probability.

A collapsible assumptions note exposes the method, incomplete data coverage and field context. Hover text shows the chosen move, reported coverage and reference species. Missing spread frequencies and moves requiring turn/OHKO context are not assigned fabricated damage. Raw engine rolls do not simulate Sturdy/Disguise/Ice Face/Focus Sash/Focus Band survival states; affected moves therefore require context and enter The rest if no other move can be evaluated. The resolved engine defender ability/item is returned by the adapter so real bypasses (e.g. Mold Breaker) are respected. Accuracy, between-turn recovery/stat changes and complete multi-hit simulation are not included; variable multi-hit moves retain the existing one-hit assumption. The model is an investment comparison, not a full battle simulation.

## Balance move metadata and duel estimates

Balance optimization maximizes the sum of displayed opponents' per-trial win rates, with Meta Mode species weights when enabled and half weight per paired field scenario. It reallocates all six SP stats within 66 total/32 per stat while fixing the rest of our known build. A bounded approximate multi-start search uses only the current Top-N roster: up to 96 broad evaluations at 16 trials, then up to 64 refinement evaluations at 64 trials, with promising candidates confirmed at 256 trials. Bulk swaps/boundaries and repeated coordinate improvement address missed physical-versus-special allocations. The direct bulk swap and a same-build Defense-panel recommendation are explicitly confirmed; prior best spreads seed reruns. Prepared opponent samples and trial-prefix outcomes are reused, with bounded damage caches. Candidates whose exact upper bound cannot enter the screening shortlist stop early; full validation always evaluates every displayed opponent, including zero-weight forms for accurate previews. The original 256-trial result is retained unless a confirmed result improves it. Build-sampling and per-trial duel seeds are shared across allocations; the confirmation is still in-sample, not a guarantee of generalization. Progress/stop/preview controls keep the saved team unchanged, and calculations run in a worker.

Balance retains the pinned Champions engine and roster for stats and raw damage. Supplemental accuracy, priority, contact, recoil/drain and secondary-effect metadata is extracted from `@pkmn/dex` **0.11.0**, a Pokémon Showdown data package: <https://registry.npmjs.org/@pkmn/dex/-/dex-0.11.0.tgz>. `data/balance-moves.js` records the exact tarball SHA-256, source URL and download date. Only a 144 KB projection is shipped, not the 1.8 MB dex runtime. Its upstream MIT license is retained in `data/BALANCE-MOVE-LICENSE.txt`. Champions engine self-boost/drop metadata overrides the supplementary data where both provide it. No runtime API requests are made.

Balance samples usage spreads, natures, items and abilities as separate distributions. Reported SP coverage is normalized among included spreads and disclosed; unreported item/nature probability uses no item/neutral nature. The two most common reported moves are always included. Two more distinct moves are sampled from the remaining reported pool, proportional to usage and without replacement. These are conditional coverage weights, not original marginal inclusion percentages. More than two moves above 50% does not add extra locks. Missing second anchors, weak/variable anchors, cores without repeatable supported attacks and incomplete coverage lists are flagged; see BALANCE-CORE-AUDIT.md. Actual joint movesets remain unavailable. Required Mega Stones replace parent-reference item distributions for Mega forms.

Each field variant receives 256 reproducible seeded direct-attack duels. The four main tiers use wins across all trials: 85–100% We Win, above 50% Close But Favored, above 15% through 50% Close But Unfavored, and 0–15% We Lose. Sorting and plain percentage badges use that same value, including unresolved cases; wholly unmodeled matchups remain separate. This is an approximate direct-attack model, not full competitive battle AI: setup, status/recovery-move strategies, switching, PP, critical hits and complex effects are excluded. Included mechanics, coverage and sample counts are shown in the app. Both sides start at full HP with selected initial stat stages; fields stay fixed and the cap is 20 turns. One active foe means no spread penalty even when the chosen usage reference is Doubles.


## Meta Mode: measured species frequencies

`data/meta-usage.js` caches the primary [Smogon monthly usage archive](https://www.smogon.com/stats/), using the actual **Usage %** column rather than inverse ranks, Raw counts or Real percentages. Current snapshot: **October 2026**, 1630 rating weighting, formats [Champions Doubles Reg M-C](https://www.smogon.com/stats/2026-10/gen9championsvgc2026regmc-1630.txt) (1,649,648 battles) and [Champions Singles Reg M-C](https://www.smogon.com/stats/2026-10/gen9championsbssregmc-1630.txt) (87,848 battles). This measures the **Pokémon Showdown Champions ladder**, not the in-game ladder or tournament population. Pikalytics offers several populations; its tournament percentages need not equal these ladder percentages.

Meta Mode defaults on and weights aggregate spread/move optimization scores by measured opposing-species frequency. Weights sum to the displayed roster count so score denominators remain comparable. Paired weather/terrain scenarios each retain half the species weight. Shared cosmetic entries split weight between displayed forms (including Toxtricity, Maushold and Vivillon aliases); Mega forms never inherit parent frequency. Species absent from the snapshot have zero weight, disclosed on hover; disabling Meta Mode restores equal weights. Individual matchup calculations and classifications are unchanged. The Top-N filter and conditional move/build/item distributions still use the November Champions Battle Data snapshot, so these are explicitly mixed-source estimates rather than a single observed joint distribution.

Refresh the cached snapshot with:

```sh
.venv/bin/python scripts/refresh_meta_usage.py --month latest
```

The script selects the newest of the last three published months with a complete matching Singles/Doubles pair, validates percentages, and atomically replaces the local file only on success. Each format records its source URL, month, battle count and SHA-256; the snapshot records retrieval time. Historical monthly files and local caching avoid runtime scraping or a Pikalytics dependency. External availability is not guaranteed. Regulation changes require explicitly updating `--singles-format` and `--doubles-format` (or the script defaults); formats are never silently mixed. Review the format and snapshot date in the Meta Mode hover after refreshing.


## KO-tier probability badges

The lower-left badges in Offense/Team Offense/Defense show cumulative KO probability for the displayed tier or better, rather than converting the synthetic average damage score into a percentage. Each reported spread uses its own HP and damage-roll distributions; independent attack-roll distributions are convolved with KO as an absorbing state. Source spread weights are normalized over modeled coverage. Nested multi-hit damage arrays are convolved as independent hit components. Defense additionally uses its existing estimated strongest-present-move shares, preserving probability with no effective attack instead of renormalizing rare moves.

OHKO tiers use one attack, 2HKO uses up to two, and 3HKO uses up to three. The open-ended 4+ / Uh Oh tier includes any eventual KO under the existing no-healing/no-PP-limit model; pure immunities/no-attack mass contribute zero. Unavailable/context-dependent calculations show a dash. First-hit Multiscale/Shadow Shield, the extra Disguise turn, and Offense's modeled offensive self-drops/White Herb use the corresponding per-turn damage ranges. Accuracy, healing and Defense's other excluded turn effects remain outside these estimates. Meta Mode does not alter an individual opponent's probability. Tier placement and scoring retain the existing weighted-average rule.


## Known held-item sprites

`data/item-sprites.js` contains 199 item-name-to-image mappings extracted from the same cached Champions item-index HTML used for the item hints. Known team items, including non-damage items and Mega Stones, use those exact paths. They are passive 28 px sprites with the held item's name on hover, without an activation border or control. Unknown sprite mappings fall back to the item name; no item is inferred from usage for our team.


## Ability effect descriptions

`data/ability-effects.js` contains short ability descriptions extracted from [Pokémon Showdown's official ability text](https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/abilities.ts), downloaded November 18, 2026. The MIT license is retained in `vendor/SHOWDOWN-LICENSE`. All 215 roster ability names have descriptions. Rebuild with `python3 scripts/build_ability_effects.py /path/to/abilities.ts`. These explain ability mechanics; displaying a description does not expand the calculator's modeled battle effects.


## Automated refresh and release (November 19, 2026)

The hosting pipeline is documented in [HOSTING.md](HOSTING.md). `scripts/refresh_site_data.py` downloads source candidates into a temporary directory, checks published npm tarball integrity, regenerates usage/ability/item/move data, validates the snapshot and only then replaces local candidate files. GitHub's nightly workflow runs the complete browser/damage regression suite before it publishes those files to main. Failure leaves the production snapshot unchanged.

Engine filenames are now stable (`vendor/smogon-calc.min.js`, `vendor/smogon-data.min.js`); `vendor/engine.json` and `vendor/SHA256SUMS` pin each accepted release and its integrity. `data/refresh-status.json` records source URLs/hashes and last successful check versus actual source-generation time. Balance metadata is reproducibly extracted by `scripts/extract_balance_moves.cjs` from the latest stable published `@pkmn/dex`, using the same fields as the original projection. Node is a refresh-time dependency only.

Nightly meta refresh discovers the newest complete matching Champions Singles/Doubles regulation pair in the latest three published months. The standalone script retains explicitly pinned format defaults unless `--discover-formats` is passed. The nightly job opts into discovery via `config/refresh.json` and records selected identifiers. Upstream data/engine publication delays remain possible, especially around balance patches.

The automated Balance metadata extraction merges the official Pokémon Showdown `data/mods/champions/moves.ts` into the base dex via its custom-mod API, preserving mod inheritance. Generic dex metadata alone lacks these Champions-only overrides. Both sources and the override SHA-256 are recorded with the snapshot. This covers move accuracy/PP/secondary fields as they are published; arbitrary ability/mechanics code still depends on released damage-engine support.
