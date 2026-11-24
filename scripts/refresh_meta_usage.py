"""Refresh measured Smogon Champions usage; standalone --discover-formats follows new regulations."""
import argparse
import datetime
import hashlib
from html.parser import HTMLParser
import json
import re
import urllib.request
import urllib.parse
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FORMATS={'Doubles':'gen9championsvgc2026regmc','Singles':'gen9championsbssregmc'}


class IncompleteFormatPair(ValueError):
    """A month was published without a complete Champions pair yet."""


def links(markup):
    class Anchors(HTMLParser):
        def __init__(self):super().__init__();self.paths=[]
        def handle_starttag(self,tag,attrs):
            if tag=='a':self.paths.extend(urllib.parse.urlsplit(value).path for key,value in attrs if key=='href' and value)
    parser=Anchors();parser.feed(markup);return parser.paths


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'PokelatorPro usage snapshot'}),timeout=40).read()


def validate_usage_records(records):
    if not records:raise ValueError('No species usage data')
    ranks=[];names=set()
    for key,row in records.items():
        name=re.sub('[^a-z0-9]','',row['name'].lower())
        if not name or name in names or key!=name:raise ValueError('Duplicate or inconsistent usage species identity')
        names.add(name)
        rank=row.get('rank')
        if type(rank) is not int or rank<1:raise ValueError('Invalid usage rank')
        ranks.append(rank)
        if not 0<=row['percent']<=100:raise ValueError('Invalid usage percentage')
    if sorted(ranks)!=list(range(1,len(ranks)+1)):raise ValueError('Usage ranks must be unique and consecutive starting at one')


def parse_usage(text):
    records={}
    for line in text.splitlines():
        columns=[part.strip() for part in line.split('|')]
        if len(columns)>1 and columns[1].isdigit():
            if len(columns)<=4 or not columns[3].endswith('%'):raise ValueError('Malformed ranked usage row')
            value=float(columns[3][:-1]);name=columns[2]
            key=re.sub('[^a-z0-9]','',name.lower())
            if key in records:raise ValueError('Duplicate usage species identity')
            records[key]={'name':name,'percent':value,'rank':int(columns[1])}
    validate_usage_records(records)
    return records


def discover_formats(index,cutoff):
    pairs={}
    for link in links(index):
        filename=link.rsplit('/',1)[-1]
        match=re.fullmatch(r'(gen(\d+)champions(bss|vgc)(\d{4})?(reg[a-z0-9]+))-'+str(cutoff)+r'\.txt',filename)
        if not match:continue
        key=(int(match[2]),match[5]);label='Singles' if match[3]=='bss' else 'Doubles'
        pairs.setdefault(key,{})[label]=match[1]
    complete=[(key,value) for key,value in pairs.items() if set(value)=={'Singles','Doubles'}]
    if not complete:raise IncompleteFormatPair('No matching Singles/Doubles Champions regulation pair')
    return max(complete,key=lambda row:row[0])[1]


def snapshot(month='latest',cutoff=1630,formats=None,discover=False,fetcher=fetch,minimum_species=100):
    months=sorted({path.rstrip('/').rsplit('/',1)[-1] for path in links(fetcher('https://www.smogon.com/stats/').decode()) if re.fullmatch(r'\d{4}-\d{2}',path.rstrip('/').rsplit('/',1)[-1])},reverse=True)[:3] if month=='latest' else [month]
    skipped=[]
    for candidate in months:
        datasets={}
        url=f'https://www.smogon.com/stats/{candidate}/'
        try:
            if discover:
                index=fetcher(url).decode()
                if not any(path.endswith('.txt') for path in links(index)):raise ValueError('Archive listing contains no usage tables; source completeness cannot be verified')
                try:selected=discover_formats(index,cutoff)
                except IncompleteFormatPair as error:
                    if month!='latest':raise
                    skipped.append({'month':candidate,'reason':str(error),'source':url})
                    continue
            else:selected=formats or FORMATS
            for label,format_id in selected.items():
                url=f'https://www.smogon.com/stats/{candidate}/{format_id}-{cutoff}.txt'
                raw=fetcher(url);text=raw.decode()
                species=parse_usage(text)
                if len(species)<minimum_species:raise ValueError(f'Incomplete usage table: {len(species)} species, expected at least {minimum_species}')
                datasets[label]={'source':url,'month':candidate,'format':format_id,'ratingCutoff':cutoff,
                    'totalBattles':int(re.search(r'Total battles:\s*(\d+)',text)[1]),
                    'sha256':hashlib.sha256(raw).hexdigest(),'species':species}
            return {'provider':'Smogon / Pokémon Showdown','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'population':'Champions Showdown ladder; not in-game ladder','formats':datasets,
                'discovery':{'latestArchiveMonth':months[0],'skippedUnpublishedFormats':skipped}}
        except Exception as error:
            raise RuntimeError(f'{candidate} source check failed at {url}; refusing silent fallback: {error}') from error
    raise RuntimeError('No complete matching snapshot found; previous snapshot retained. '+json.dumps(skipped))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--month',default='latest');parser.add_argument('--cutoff',type=int,default=1630)
    parser.add_argument('--discover-formats',action='store_true')
    parser.add_argument('--doubles-format',default=FORMATS['Doubles']);parser.add_argument('--singles-format',default=FORMATS['Singles'])
    args=parser.parse_args()
    data=snapshot(args.month,args.cutoff,{'Doubles':args.doubles_format,'Singles':args.singles_format},args.discover_formats)
    target=ROOT/'data/meta-usage.js';temp=target.with_suffix('.tmp')
    temp.write_text('window.META_USAGE = '+json.dumps(data,separators=(',',':'))+';\n');temp.replace(target)
    print('Saved', {label:(value['month'],value['format']) for label,value in data['formats'].items()})
