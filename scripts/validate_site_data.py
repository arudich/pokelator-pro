"""Validate snapshots and engine integrity without network access."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
STATS=['hp','atk','def','spa','spd','spe']


def payload(path):
    text=Path(path).read_text();start=text.index(' = ')+3
    return json.loads(text[start:].strip().rstrip(';'))


def validate(root=ROOT):
    root=Path(root);roster=payload(root/'data/champions-roster.js')
    if len(roster.get('pokemon',[]))<100:raise ValueError('Unexpectedly incomplete roster')
    ids=set()
    for species in roster['pokemon']:
        if species['id'] in ids:raise ValueError('Duplicate species id')
        ids.add(species['id'])
        if not species.get('learnset') or not species.get('abilities'):raise ValueError('Missing moves or abilities')
        if any(not isinstance(species['stats'].get(stat),int) or species['stats'][stat]<=0 for stat in STATS):raise ValueError('Invalid species stats')
        for usage in species.get('usage',{}).values():
            for category in ['moves','items','abilities','natures','spreads']:
                for row in usage.get(category,[]):
                    if row.get('percent') is not None and not 0<=row['percent']<=100:raise ValueError('Invalid usage percentage')
                    if category=='spreads':
                        values=[row['investment'][stat] for stat in STATS]
                        if any(not isinstance(n,int) or not 0<=n<=32 for n in values) or sum(values)>66:raise ValueError('Invalid spread')
    meta=payload(root/'data/meta-usage.js')
    if set(meta['formats'])!={'Singles','Doubles'}:raise ValueError('Missing meta format')
    for value in meta['formats'].values():
        if not value['species']:raise ValueError('Empty meta usage')
        if any(not 0<=row['percent']<=100 for row in value['species'].values()):raise ValueError('Invalid meta usage')
    for line in (root/'vendor/SHA256SUMS').read_text().splitlines():
        digest,name=line.split(maxsplit=1);path=root/name
        if path.parent!=root/'vendor' or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Engine integrity mismatch')
    moves=payload(root/'data/balance-moves.js')['moves']
    if not all(name in moves for name in ['overheat','lastrespects','expandingforce']):raise ValueError('Missing move effects')
    print(f'Validated {len(ids)} species, both usage formats and engine checksums')


if __name__=='__main__':validate()
