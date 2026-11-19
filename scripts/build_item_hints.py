"""Build damage-item hint metadata from Showdown text and Champions sprite links.

python3 scripts/build_item_hints.py /tmp/items.js /tmp/items-text.ts /tmp/items.html
"""
import html
import json
import re
import sys
from pathlib import Path


def build(items_js, text_ts, index_html):
    entries=list(re.finditer(r'(?:^exports.BattleItems = \{|(?<=\}),)([a-z0-9]+):\{name:("(?:\\.|[^"\\])*")',items_js))
    descriptions={}
    for match in re.finditer(r'^\t([a-z0-9]+): \{(.*?)(?=^\t\},)',text_ts,re.M|re.S):
        description=re.search(r'^\t\tshortDesc: ("(?:\\.|[^"\\])*"),',match[2],re.M)
        if description:
            descriptions[match[1]]=json.loads(description[1])
    sprites={}
    for path, name in re.findall(r'<img class="static-item-icon" src="([^"]+)"[^>]*\s*/><a [^>]+>([^<]+)</a>',index_html):
        sprites[html.unescape(name)]= 'https://championsbattledata.com'+html.unescape(path)
    result={}
    for i, match in enumerate(entries):
        key,name=match[1],json.loads(match[2])
        body=items_js[match.start():entries[i+1].start() if i+1<len(entries) else len(items_js)]
        boost=bool(re.search(r'onBasePowerPriority|onModifyAtkPriority|onModifySpAPriority|isGem:true|boosts:\{[^}]*\b(?:atk|spa):',body))
        boost=boost or key in ['lifeorb','expertbelt','metronome','scopelens','razorclaw']
        if boost and name in sprites:
            if key not in descriptions:
                raise ValueError(f'Missing description for {name}')
            result[key]={'name':name,'description':descriptions[key],'image':sprites[name]}
    for key in ['lifeorb','fairyfeather','blackglasses']:
        if key not in result:
            raise ValueError(f'Missing expected item {key}')
    return result


if __name__=='__main__':
    result=build(*(Path(path).read_text() for path in sys.argv[1:4]))
    path=Path(__file__).resolve().parents[1]/'data'/'item-hints.js'
    path.write_text('// Item descriptions: Pokemon Showdown (MIT); sprites: Champions Battle Data.\n'
                    'window.ITEM_HINTS = '+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n')
    print(f'Built {len(result)} damage-boosting item hints')
