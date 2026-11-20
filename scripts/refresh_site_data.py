"""Refresh candidates atomically; CI runs browser/damage checks before publishing.

Requires Python, curl, Node (build-time only), and network access.
    python3 scripts/refresh_site_data.py
"""
import base64
import hashlib
import html
import io
import json
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
from datetime import datetime,timezone
from pathlib import Path

from build_ability_effects import build as build_abilities
from build_item_hints import build as build_items
from build_roster import build as build_roster
from download_usage import download
from refresh_meta_usage import snapshot
from validate_site_data import payload,validate

ROOT=Path(__file__).resolve().parents[1]


def fetch(url):
    last=None
    for attempt in range(3):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'PokelatorPro nightly refresh (github.com/arudich/pokelator-pro)'})
            with urllib.request.urlopen(request,timeout=60) as response:return response.read()
        except Exception as error:
            last=error
            if attempt<2:time.sleep(2**attempt)
    raise RuntimeError(f'Could not download {url}: {last}')


def package(name,directory):
    metadata=json.loads(fetch('https://registry.npmjs.org/'+name+'/latest'))
    if not re.fullmatch(r'\d+\.\d+\.\d+',metadata['version']) or metadata.get('license')!='MIT':raise ValueError('Unexpected npm release or license')
    url=metadata['dist']['tarball']
    if not url.startswith('https://registry.npmjs.org/'):raise ValueError('Unexpected package host')
    raw=fetch(url);integrity=metadata['dist'].get('integrity','')
    if not integrity.startswith('sha512-') or base64.b64encode(hashlib.sha512(raw).digest()).decode()!=integrity[7:]:raise ValueError('Package integrity mismatch')
    directory.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:
        total=0
        for member in archive:
            if member.isdir():continue
            path=Path(member.name)
            if not member.isfile() or path.is_absolute() or '..' in path.parts or path.parts[0]!='package':raise ValueError('Unsafe package member')
            total+=member.size
            if total>100_000_000:raise ValueError('Unexpected package size')
            target=directory/path;target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(archive.extractfile(member).read())
    return directory/'package',{'package':name,'version':metadata['version'],'source':url,'integrity':integrity,'sha256':hashlib.sha256(raw).hexdigest()}


def write_js(path,variable,data,comment='Generated nightly; sources recorded in data/refresh-status.json.'):
    path.write_text('// '+comment+'\nwindow.'+variable+' = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')


def main():
    config=json.loads((ROOT/'config/refresh.json').read_text())
    checked=datetime.now(timezone.utc).isoformat()
    with tempfile.TemporaryDirectory(prefix='pokelator-refresh-') as directory:
        work=Path(directory);stage=work/'candidate'
        shutil.copytree(ROOT/'data',stage/'data');shutil.copytree(ROOT/'vendor',stage/'vendor')
        print('Downloading Champions roster and current usage…',flush=True)
        index_raw=fetch(config['roster']);index=json.loads(index_raw);index_path=work/'pokemon-index.json';index_path.write_bytes(index_raw)
        download(index_path,work/'usage',refresh=True)
        roster=build_roster(index,work/'usage');write_js(stage/'data/champions-roster.js','CHAMPIONS_ROSTER',roster)
        print('Refreshing published Champions meta usage…',flush=True)
        meta=snapshot(cutoff=config['usageRatingCutoff'],discover=config['discoverCurrentRegulation'],fetcher=fetch)
        previous=payload(ROOT/'data/meta-usage.js')
        if any(meta['formats'][label]['month']<previous['formats'][label]['month'] for label in ['Singles','Doubles']):raise ValueError('Refusing to move meta snapshot backwards')
        write_js(stage/'data/meta-usage.js','META_USAGE',meta)
        print('Refreshing calculator and supplemental move metadata…',flush=True)
        engine_dir,engine=package(config['enginePackage'],work/'calc')
        move_dir,moves=package(config['movePackage'],work/'dex')
        for source,target in [('dist/production.min.js','smogon-calc.min.js'),('dist/data/production.min.js','smogon-data.min.js')]:
            shutil.copy2(engine_dir/source,stage/'vendor'/target)
        (stage/'vendor/engine.json').write_text(json.dumps(engine,indent=2)+'\n')
        (stage/'vendor/SHA256SUMS').write_text(''.join(hashlib.sha256((stage/'vendor'/name).read_bytes()).hexdigest()+'  vendor/'+name+'\n' for name in ['smogon-calc.min.js','smogon-data.min.js']))
        champions_raw=fetch(config['championsMoveOverrides']);champions_path=work/'champions-moves.ts';champions_path.write_bytes(champions_raw)
        moves['championsOverrides']={'source':config['championsMoveOverrides'],'sha256':hashlib.sha256(champions_raw).hexdigest()}
        move_meta={**moves,'license':'MIT','downloadedAt':checked[:10]};meta_path=work/'move-source.json';meta_path.write_text(json.dumps(move_meta))
        subprocess.run(['node',str(ROOT/'scripts/extract_balance_moves.cjs'),str(move_dir),str(meta_path),str(stage/'data/balance-moves.js'),str(champions_path)],check=True)
        print('Refreshing ability/item descriptions and sprite references…',flush=True)
        urls={'abilities':'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/abilities.ts',
          'items':'https://play.pokemonshowdown.com/data/items.js','itemText':'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/items.ts',
          'sprites':'https://championsbattledata.com/items/'}
        source_bytes={key:fetch(url) for key,url in urls.items()};sources={key:value.decode() for key,value in source_bytes.items()}
        abilities=build_abilities(sources['abilities']);write_js(stage/'data/ability-effects.js','ABILITY_EFFECTS',abilities,'Descriptions: Pokemon Showdown (MIT; vendor/SHOWDOWN-LICENSE).')
        hints=build_items(sources['items'],sources['itemText'],sources['sprites']);write_js(stage/'data/item-hints.js','ITEM_HINTS',hints,'Descriptions: Pokemon Showdown (MIT); sprites: Champions Battle Data.')
        sprites={html.unescape(name):'https://championsbattledata.com'+html.unescape(path) for path,name in re.findall(r'<img class="static-item-icon" src="([^"]+)"[^>]*\s*/><a [^>]+>([^<]+)</a>',sources['sprites'])}
        if len(sprites)<20 or 'Life Orb' not in sprites:raise ValueError('Incomplete item sprite index')
        write_js(stage/'data/item-sprites.js','ITEM_SPRITES',sprites)
        missing=sorted({name for p in roster['pokemon'] for name in p['abilities'] if re.sub('[^a-z0-9]','',name.lower()) not in abilities})
        if missing:raise ValueError('Missing ability descriptions: '+', '.join(missing))
        status={'checkedAt':checked,'rosterGeneratedAt':roster['generatedAt'],'rosterSource':config['roster'],'rosterSha256':hashlib.sha256(index_raw).hexdigest(),
          'engine':engine,'moveMetadata':moves,'formats':{key:{field:value[field] for field in ['month','format','source','sha256']} for key,value in meta['formats'].items()},
          'sources':{key:{'url':urls[key],'sha256':hashlib.sha256(raw).hexdigest()} for key,raw in source_bytes.items()},
          'usageDiscovery':meta.get('discovery',{})}
        (stage/'data/refresh-status.json').write_text(json.dumps(status,indent=2)+'\n')
        validate(stage)
        # No live checkout files change until every download/build/structural check succeeds.
        for folder in ['data','vendor']:
            for source in (stage/folder).iterdir():
                if source.is_file():shutil.copy2(source,ROOT/folder/source.name)
        print('Candidate snapshot saved. Run the browser regression suite before publishing.',flush=True)


if __name__=='__main__':main()
