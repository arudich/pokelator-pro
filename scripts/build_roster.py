"""Reduce a downloaded Champions index to the fields used by the static app.

Download https://championsbattledata.com/data/pokemon-index.json, then run:
    python3 scripts/build_roster.py /path/to/pokemon-index.json /path/to/usage-cache
The upstream 'baseStats' values are uninvested level-50 stats, not species bases.
"""
import json
import csv
import sys
from pathlib import Path


def build(index, usage_dir=None):
    roster = {}
    priorities = {}
    fields = {'hp': 'hp', 'atk': 'attack', 'def': 'defense',
              'spa': 'sp_attack', 'spd': 'sp_defense', 'spe': 'speed'}
    for record in index['pokemon']:
        summary = record['summary']
        usage = summary.get('battleSummary', {}).get('Current', {}).get('Doubles', {})
        moves = usage.get('values', {}).get('move', [])[:4]
        learnset = record.get('learnableMoveNames', [])
        reference = {}
        if usage_dir:
            for source in record.get('battleDataCsvs', []):
                if source['season'] != 'Current' or source.get('daily'):
                    continue
                path = Path(usage_dir) / source['format'] / Path(source['path']).name
                with path.open() as file:
                    rows = list(csv.DictReader(file))
                # This is species usage order, not a move/item's conditional rank.
                positions = {int(row['column_position']) for row in rows if row.get('column_position')}
                if len(positions) > 1 or any(position < 1 for position in positions):
                    raise ValueError(f'Invalid species usage rank in {path}')
                def usage_rows(category):
                    result = []
                    for row in rows:
                        if row['category'] != category or not row['name']:
                            continue
                        value = row['percentage'].strip().rstrip('%')
                        percent = float(value) if value else None
                        if percent is not None and not 0 <= percent <= 100:
                            raise ValueError(f'Invalid percentage in {path}')
                        result.append({'name': row['name'], 'percent': percent,
                                       'rank': int(row['rank'])})
                    return sorted(result, key=lambda row: row['rank'])
                spreads = []
                spread_fields = {'hp': 'hp_points', 'atk': 'attack_points', 'def': 'defense_points',
                                 'spa': 'sp_atk_points', 'spd': 'sp_def_points', 'spe': 'speed_points'}
                for row in rows:
                    if row['category'] != 'stat_points':
                        continue
                    investment = {stat: int(row[column]) for stat, column in spread_fields.items()}
                    if any(value < 0 or value > 32 for value in investment.values()) or sum(investment.values()) > 66:
                        raise ValueError(f'Invalid stat spread in {path}')
                    value = row['percentage'].strip().rstrip('%')
                    percent = float(value) if value else None
                    if percent is not None and not 0 <= percent <= 100:
                        raise ValueError(f'Invalid spread percentage in {path}')
                    spreads.append({'investment': investment, 'percent': percent, 'rank': int(row['rank'])})
                reference[source['format']] = {'name': record['showdownName'],
                    'rank': next(iter(positions), None),
                    'source': 'https://championsbattledata.com/' + source['path'],
                    'moves': usage_rows('move'), 'items': usage_rows('held_item'),
                    'abilities': usage_rows('ability'),
                    'natures': usage_rows('stat_alignment'),
                    'spreads': sorted(spreads, key=lambda row: row['rank'])}
        for form in summary['forms']:
            name = form['saved_name']
            stats = {key: form[source] for key, source in fields.items()}
            if not all(isinstance(value, (int, float)) and value > 0 for value in stats.values()):
                raise ValueError(f'Invalid stats for {name}')
            image = form['image_path']
            if not image.startswith('pokemon_champions_assets/pokemon/') or not image.endswith('.png'):
                raise ValueError(f'Invalid image path for {name}')
            record_name = record.get('showdownName', '')
            form_name = form['showdown_name']
            parent_name = form_name.split('-Mega')[0]
            priority = (record_name == form_name,
                        record_name == parent_name or (record_name == 'Meowstic' and parent_name == 'Meowstic-M'),
                        -len(record_name))
            if name in priorities and priorities[name] > priority:
                continue
            priorities[name] = priority
            roster[name] = dict(name=name, id=form['showdown_name'],
                                form=form.get('form_kind') or 'Base',
                                isMega=form.get('form_kind', '').startswith('Mega'),
                                types=form['types'], stats=stats, image=image,
                                abilities=form['abilities'].split('|'),
                                moves=moves or learnset[:4], learnset=learnset,
                                usage=reference)
    return {'source': 'https://championsbattledata.com/data/pokemon-index.json',
            'generatedAt': index['generatedAt'], 'statModel': 'Champions uninvested level 50',
            'pokemon': sorted(roster.values(), key=lambda p: p['name'])}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: build_roster.py INDEX_JSON USAGE_CACHE_DIRECTORY')
    data = build(json.loads(Path(sys.argv[1]).read_text()), sys.argv[2])
    target = Path(__file__).resolve().parents[1] / 'data' / 'champions-roster.js'
    target.write_text('// Generated by scripts/build_roster.py; see docs/DATA-SOURCES.md.\n'
                      'window.CHAMPIONS_ROSTER = ' + json.dumps(data, ensure_ascii=False,
                                                               separators=(',', ':')) + ';\n')
    print(f"Wrote {len(data['pokemon'])} species/forms to {target.name}")
