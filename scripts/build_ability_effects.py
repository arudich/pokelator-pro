"""Extract Showdown short ability descriptions from a downloaded abilities.ts.

Usage: python3 scripts/build_ability_effects.py /tmp/abilities.ts
Source: https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/abilities.ts
License: MIT; retained in vendor/SHOWDOWN-LICENSE.
"""
import json
import re
import sys
from pathlib import Path

source = Path(sys.argv[1]).read_text()
effects = {}
for match in re.finditer(r'^\t([a-z0-9]+): \{(.*?)(?=^\t\},)', source, re.M | re.S):
    description = re.search(r'^\t\tshortDesc: ("(?:\\.|[^"\\])*"),', match[2], re.M)
    if description:
        effects[match[1]] = json.loads(description[1])
if not effects:
    raise ValueError('No ability descriptions found')
target = Path(__file__).resolve().parents[1] / 'data/ability-effects.js'
target.write_text('// Short descriptions: Pokemon Showdown data/text/abilities.ts (MIT; vendor/SHOWDOWN-LICENSE).\nwindow.ABILITY_EFFECTS = ' + json.dumps(effects, separators=(',', ':')) + ';\n')
print(f'Built {len(effects)} ability descriptions')
