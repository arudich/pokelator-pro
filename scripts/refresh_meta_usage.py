"""Cache primary Smogon Champions usage percentages; no runtime API dependency.

.venv/bin/python scripts/refresh_meta_usage.py --month latest
Update explicit format IDs when regulations change; never mix rulesets silently.
"""
import argparse
import datetime
import hashlib
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORMATS = {'Doubles': 'gen9championsvgc2026regmc', 'Singles': 'gen9championsbssregmc'}

def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'PokelatorPro usage snapshot'}),timeout=40).read()

def parse_usage(text):
    records={}
    for line in text.splitlines():
        columns=[part.strip() for part in line.split('|')]
        if len(columns)>4 and columns[1].isdigit() and columns[3].endswith('%'):
            value=float(columns[3][:-1]);name=columns[2]
            if not 0<=value<=100: raise ValueError('Invalid usage percentage')
            records[re.sub('[^a-z0-9]','',name.lower())]={'name':name,'percent':value,'rank':int(columns[1])}
    if not records: raise ValueError('No species usage data')
    return records

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--month',default='latest');parser.add_argument('--cutoff',type=int,default=1630)
    parser.add_argument('--doubles-format',default=FORMATS['Doubles']);parser.add_argument('--singles-format',default=FORMATS['Singles'])
    args=parser.parse_args();formats={'Doubles':args.doubles_format,'Singles':args.singles_format}
    if args.month=='latest':
        index=fetch('https://www.smogon.com/stats/').decode()
        months=sorted(set(re.findall(r'href="(\d{4}-\d{2})/"',index)),reverse=True)[:3]
    else: months=[args.month]
    for month in months:
        datasets={}
        try:
            for label,format_id in formats.items():
                url=f'https://www.smogon.com/stats/{month}/{format_id}-{args.cutoff}.txt'
                raw=fetch(url);text=raw.decode()
                datasets[label]={'source':url,'month':month,'format':format_id,'ratingCutoff':args.cutoff,
                    'totalBattles':int(re.search(r'Total battles:\s*(\d+)',text)[1]),
                    'sha256':hashlib.sha256(raw).hexdigest(),'species':parse_usage(text)}
        except Exception:
            if args.month!='latest': raise
            continue
        payload={'provider':'Smogon / Pokémon Showdown','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 'population':'Champions Showdown ladder; not in-game ladder','formats':datasets}
        target=ROOT/'data/meta-usage.js'
        temp=target.with_suffix('.tmp');temp.write_text('window.META_USAGE = '+json.dumps(payload,separators=(',',':'))+';\n');temp.replace(target)
        print('Saved',month,{label:len(data['species']) for label,data in datasets.items()});return
    raise RuntimeError('No complete matching snapshot found; previous snapshot retained')

if __name__=='__main__': main()
