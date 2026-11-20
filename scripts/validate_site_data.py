"""Validate snapshots and engine integrity without network access."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
STATS=['hp','atk','def','spa','spd','spe']


def payload(path):
    text=Path(path).read_text();start=text.index(' = ')+3
    return json.loads(text[start:].strip().rstrip(';'))


def validate(root=ROOT,baseline_root=ROOT):
    root=Path(root);roster=payload(root/'data/champions-roster.js')
    baseline=payload(Path(baseline_root)/'data/champions-roster.js') if baseline_root else {'pokemon':[]}
    previous={p['id']:p for p in baseline['pokemon']}
    if len(roster.get('pokemon',[]))<100:raise ValueError('Unexpectedly incomplete roster')
    ids=set()
    for species in roster['pokemon']:
        if species['id'] in ids:raise ValueError('Duplicate species id')
        ids.add(species['id'])
        if not species.get('learnset') or not species.get('abilities'):raise ValueError('Missing moves or abilities')
        if any(not isinstance(species['stats'].get(stat),int) or species['stats'][stat]<=0 for stat in STATS):raise ValueError('Invalid species stats')
        usage_by_format=species.get('usage',{})
        expected=set(species.get('expectedUsageFormats',['Singles','Doubles'])) | set(previous.get(species['id'],{}).get('usage',{}))
        if expected-set(usage_by_format):raise ValueError(f'{species["id"]}: missing expected usage formats {sorted(expected-set(usage_by_format))}')
        for format,usage in usage_by_format.items():
            for category in ['moves','items','abilities','natures','spreads']:
                if not usage.get(category):raise ValueError(f'{species["id"]} {format}: empty {category}; source {usage.get("source","unknown")}')
                old_rows=previous.get(species['id'],{}).get('usage',{}).get(format,{}).get(category,[])
                rows=usage[category]
                if len(old_rows)>=5 and len(rows)<len(old_rows)*0.5 and (category=='moves' or sum(row.get('percent') or 0 for row in rows)<95):
                    raise ValueError(f'{species["id"]} {format}: {category} sharply reduced from {len(old_rows)} to {len(rows)} rows; review source {usage.get("source","unknown")}')
                for row in usage.get(category,[]):
                    if row.get('percent') is not None and not 0<=row['percent']<=100:raise ValueError('Invalid usage percentage')
                    if category=='spreads':
                        values=[row['investment'][stat] for stat in STATS]
                        if any(not isinstance(n,int) or not 0<=n<=32 for n in values) or sum(values)>66:raise ValueError('Invalid spread')
    missing=set(previous)-ids
    if missing:raise ValueError('Previously supported species missing; review before publishing: '+', '.join(sorted(missing)))
    meta=payload(root/'data/meta-usage.js')
    prior_meta=payload(Path(baseline_root)/'data/meta-usage.js') if baseline_root else {'formats':{}}
    if set(meta['formats'])!={'Singles','Doubles'}:raise ValueError('Missing meta format')
    for format,value in meta['formats'].items():
        if not value['species']:raise ValueError('Empty meta usage')
        previous_count=len(prior_meta['formats'].get(format,{}).get('species',{}))
        if previous_count and len(value['species'])<previous_count*0.9:raise ValueError(f'{format}: meta coverage fell from {previous_count} to {len(value["species"])} species; review before publishing')
        if any(not 0<=row['percent']<=100 for row in value['species'].values()):raise ValueError('Invalid meta usage')
    for line in (root/'vendor/SHA256SUMS').read_text().splitlines():
        digest,name=line.split(maxsplit=1);path=root/name
        if path.parent!=root/'vendor' or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Engine integrity mismatch')
    moves=payload(root/'data/balance-moves.js')['moves']
    if not all(name in moves for name in ['overheat','lastrespects','expandingforce']):raise ValueError('Missing move effects')
    print(f'Validated {len(ids)} species, both usage formats and engine checksums')


if __name__=='__main__':validate()
