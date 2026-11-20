"""Fetch public upstream evidence outside the agent's read-only network sandbox."""
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import csv
import io
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

SOURCES={
    'roster':'https://championsbattledata.com/data/pokemon-index.json',
    'calc-package':'https://registry.npmjs.org/@smogon/calc/latest',
    'dex-package':'https://registry.npmjs.org/@pkmn/dex/latest',
    'champions-moves':'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/moves.ts',
    'champions-abilities':'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/abilities.ts',
    'base-move-reference':'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/moves.ts',
    'usage-archive':'https://www.smogon.com/stats/',
    'official-in-game-news':'https://champions-news.pokemon-home.com/en/json/list.json',
}


class NewsText(HTMLParser):
    def __init__(self):super().__init__();self.text=[];self.links=[];self.hidden=0
    def handle_starttag(self,tag,attrs):
        if tag in ['script','style']:self.hidden+=1
        if tag=='a':self.links.extend(value for key,value in attrs if key=='href' and value)
    def handle_endtag(self,tag):
        if tag in ['script','style']:self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden and data.strip():self.text.append(data.strip())


def capture(directory,name,url):
    record={'name':name,'url':url,'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat()}
    text=''
    try:
        limit=64_000_000 if name=='roster' else 2_000_000
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Pokelator maintenance evidence'}),timeout=12) as response:
            raw=response.read(limit+1);record['httpStatus']=response.status
        if len(raw)>limit:raise ValueError('Source exceeds evidence size limit')
        record['sha256']=hashlib.sha256(raw).hexdigest();text=raw.decode(errors='replace')
        if name=='roster':
            data=json.loads(text)
            record['topLevelKeys']=list(data) if isinstance(data,dict) else []
            pokemon=data['pokemon'];identities=set();summaries=[];csv_sources=[]
            for species in pokemon:
                ids=sorted({form['showdown_name'] for form in species['summary']['forms']});identities.update(ids)
                current=[source for source in species.get('battleDataCsvs',[]) if source['season']=='Current' and not source.get('daily')]
                summaries.append({'name':species['showdownName'],'formIds':ids,'learnsetCount':len(species.get('learnableMoveNames',[])),
                                  'usageFormats':sorted({source['format'] for source in current})})
                if species['showdownName'] in ['Gogoat','Furfrou','Slurpuff']:
                    for source in current:
                        url_path=urllib.parse.urljoin('https://championsbattledata.com/',source['path'])
                        parsed=urllib.parse.urlsplit(url_path)
                        if parsed.scheme=='https' and parsed.netloc=='championsbattledata.com' and parsed.path.startswith('/pokemon_champions_assets/battle_data/') and parsed.path.endswith('.csv'):
                            csv_sources.append({'name':'csv-'+species['showdownName'].lower()+'-'+source['format'].lower(),'url':url_path})
            record['generatedAt']=data['generatedAt'];record['sourceRecords']=len(pokemon);record['uniqueFormCount']=len(identities)
            record['csvSources']=csv_sources
            text=json.dumps({'generatedAt':data['generatedAt'],'formIds':sorted(identities),'records':summaries},ensure_ascii=False)
        if name.startswith('csv-'):
            rows=list(csv.DictReader(io.StringIO(text)))
            if not rows or not all(key in rows[0] for key in ['category','name','percentage']):raise ValueError('Unexpected usage CSV schema')
            record['categoryRows']={category:sum(row['category']==category for row in rows) for category in sorted({row['category'] for row in rows})}
        if name=='base-move-reference':
            blocks=[]
            for move in ['lastrespects','direclaw','growth','snaptrap','rockslide','screech','metalsound','steelwing','frostbreath']:
                start=text.find('\n\t'+move+': {');end=text.find('\n\t},',start)+len('\n\t},')
                if start>=0 and end>start:blocks.append(text[start:end])
            text='\n'.join(blocks)
            record['selectedMoveReferences']=len(blocks)
        if name=='official-in-game-news':
            data=json.loads(text)
            articles=sorted(data['data'],key=lambda row:int(row.get('pubAt',0)),reverse=True)
            link=lambda row:urllib.parse.urljoin(url,'../'+row['link'])
            record['links']=[link(row) for row in articles if row.get('link')]
            record['preferredLinks']=[link(row) for row in articles if row.get('link') and re.search(r'balance|adjustment|update|maintenance',row.get('title','')+' '+row.get('kindTxt',''),re.I)][:5]
            text=json.dumps(data,ensure_ascii=False)
        elif 'news' in name:
            parser=NewsText();parser.feed(text);record['links']=list(dict.fromkeys(parser.links))[:150]
            text='\n'.join(parser.text)
            if not text.strip():raise ValueError('No readable news text returned; this source may need browser rendering')
        if name.startswith('usage-month'):
            text='\n'.join(line for line in text.splitlines() if 'champions' in line.lower())
        (directory/(name+'.txt')).write_text(text[:80000])
        record['truncated']=len(text)>80000
    except Exception as error:record['error']=type(error).__name__+': '+str(error)[:250]
    return record,text


def collect(directory):
    directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(lambda item:capture(directory,*item),SOURCES.items()))
    records=[record for record,_ in results]
    archive=next(text for record,text in results if record['name']=='usage-archive')
    months=sorted(set(re.findall(r'href="(\d{4}-\d{2})/"',archive)),reverse=True)[:2]
    follow=[('usage-month-'+month,'https://www.smogon.com/stats/'+month+'/') for month in months]
    for record in records:
        if record['name']=='roster':follow.extend((source['name'],source['url']) for source in record.get('csvSources',[]))
    for record in list(records):
        if record['name'] not in ['official-news','official-in-game-news']:continue
        links=[]
        for href in record.get('links',[]):
            url=urllib.parse.urljoin(record['url'],href);parsed=urllib.parse.urlsplit(url)
            if parsed.scheme=='https' and parsed.netloc==urllib.parse.urlsplit(record['url']).netloc and parsed.path not in ['/en/','/en-us/news/'] and ('/news/' in parsed.path or '/page/' in parsed.path):links.append(url)
        ordered=list(dict.fromkeys(links))
        selected=ordered[:3]+record.get('preferredLinks',[]) if record['name']=='official-in-game-news' else ordered[:3]+ordered[-3:]
        for number,url in enumerate(list(dict.fromkeys(selected))):follow.append((record['name']+'-'+str(number),url))
    with ThreadPoolExecutor(max_workers=4) as pool:
        records.extend(record for record,_ in pool.map(lambda item:capture(directory,*item),follow))
    (directory/'index.json').write_text(json.dumps(records,indent=2)+'\n')
    return records
