"""Keep the last two observed results per species from Voice Lab exports.

Usage: python3 scripts/update_voice_validation.py export.json [export.json ...]
Only recorded outcomes are used; replaying learned aliases cannot manufacture passes.
"""
import json
import re
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'debug/voice-validation-data.js'


def update(paths):
    if not paths:
        raise ValueError('Supply one or more Voice Lab export files')
    groups={}
    for path in paths:
        run=json.loads(Path(path).read_text())
        for index,attempt in enumerate(run['attempts']):
            identity=attempt['expected']['id']
            # Mega pronunciations count toward their ordinary species.
            identity=re.sub(r'-Mega(?:-[XYZ])?$','',identity)
            stamp=attempt.get('at') or run['startedAt']
            key=f"{run['startedAt']}|{attempt.get('at',index)}|{attempt['expected']['id']}"
            row={'id':identity,'key':key,'at':stamp,'correct':bool(attempt.get('correct'))}
            groups.setdefault(identity,{})[key]=row
    rows=[row for identity in sorted(groups) for row in sorted(groups[identity].values(),key=lambda r:(r['at'],r['key']))[-2:]]
    OUTPUT.write_text('// Recorded validation outcomes; no transcripts or audio.\nwindow.VOICE_VALIDATION_DATA='+json.dumps(rows,separators=(',',':'))+';\n')
    stable=sum(len(group)>=2 and all(row['correct'] for row in sorted(group.values(),key=lambda r:(r['at'],r['key']))[-2:]) for group in groups.values())
    print(f'Saved {len(rows)} outcomes; {stable} species have two consecutive successes.')


if __name__=='__main__':update(sys.argv[1:])
