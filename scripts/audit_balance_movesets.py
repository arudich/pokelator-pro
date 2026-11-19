#!/usr/bin/env python3
"""Audit the two-fixed-move Balance assumption against the bundled usage snapshot."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--top', type=int, default=100)
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for filename in ['vendor/smogon-data-0.12.0.min.js', 'vendor/smogon-calc-0.12.0.min.js',
                         'battle.js', 'offense.js', 'balance.js', 'data/champions-roster.js']:
            page.add_script_tag(content=(ROOT / filename).read_text())
        report = page.evaluate('''() => {
          const result={};
          for(const format of ['Doubles','Singles']) {
            const refs=new Map();
            for(const species of CHAMPIONS_ROSTER.pokemon) {
              const usage=species.usage[format];if(!usage) continue;
              if(!refs.has(usage.name)) refs.set(usage.name,{name:usage.name,rank:usage.rank,forms:[],...Balance.movesetModel(usage.moves)});
              refs.get(usage.name).forms.push(species.name);
            }
            result[format]=[...refs.values()].sort((a,b)=>a.rank-b.rank);
          }
          return result;
        }''')
        generated_at = page.evaluate('CHAMPIONS_ROSTER.generatedAt')
        browser.close()
    (ROOT / 'docs/BALANCE-CORE-AUDIT.json').write_text(json.dumps(report, indent=2) + '\n')
    lines = ['# Balance fixed-core audit', '', f'Roster/usage snapshot: {generated_at}.', '',
             'Rule: lock the two most common reported moves; sample two other distinct moves by relative usage. '
             'This is an explicit approximation, not observed co-occurrence. Coverage inclusion rates change after conditioning on the fixed pair.', '',
             'References are deduplicated across forms. The JSON contains every reference and all affected forms; '
             f'the tables below cover the top {args.top} usage references in each format.', '',
             'Cautions distinguish a weak second anchor (≤50%), a variable second anchor (<75%), '
             'cores without a repeatable supported attack, and missing coverage. These are warning signs, not proof that a particular pair never co-occurs.', '',
             'Regenerate: `.venv/bin/python scripts/audit_balance_movesets.py --top 100`.', '']
    for fmt, rows in report.items():
        selected = [r for r in rows if r['rank'] <= args.top]
        weak = [r for r in selected if len(r['core']) < 2 or r['core'][1]['percent'] <= 50]
        nonattacking = [r for r in selected if any('repeatable' in w for w in r['warnings'])]
        cautions = [r for r in selected if r['warnings']]
        lines += [f'## {fmt}', '', f'{len(selected)} references: {len(weak)} have a missing/≤50% second anchor; '
                  f'{len(nonattacking)} have no repeatable supported attack in the core; {len(cautions)} have at least one caution.', '',
                  '| Rank | Pokémon reference | Locked moves | Caution |', '| --- | --- | --- | --- |']
        for row in cautions:
            core = ' + '.join(f"{m['name']} ({m['percent']}%)" for m in row['core']) or 'None'
            lines.append(f"| {row['rank']} | {row['name']} | {core} | {' '.join(row['warnings'])} |")
        lines += ['']
        print(fmt, {'weak_pair': [r['name'] for r in weak], 'no_core_attack': [r['name'] for r in nonattacking], 'caution_count': len(cautions)})
    clefable = next(r for r in report['Doubles'] if r['name'] == 'Clefable')
    core_text = ' + '.join(f"{m['name']} ({m['percent']}%)" for m in clefable['core'])
    lines += ['## Clefable example', '', f'Doubles Clefable always brings {core_text} under this rule. '
              'The remaining two slots vary. Attacks in the fixed core can no longer be omitted, '
              'though recovery/support strategies and joint item/nature/spread correlations remain outside this model.', '']
    (ROOT / 'docs/BALANCE-CORE-AUDIT.md').write_text('\n'.join(lines))


if __name__ == '__main__':
    main()
