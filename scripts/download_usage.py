"""Cache current per-format Champions CSVs once; re-run with --refresh to replace.

    python3 scripts/download_usage.py /tmp/pokemon-index.json /tmp/pokelator-usage
Uses three workers and caches successful downloads to avoid repeat requests.
"""
import concurrent.futures
import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote


def download(index_path, destination, refresh=False):
    index=json.loads(Path(index_path).read_text())
    tasks=set()
    for record in index['pokemon']:
        for source in record.get('battleDataCsvs',[]):
            if source['season']=='Current' and not source.get('daily'):
                tasks.add((source['format'],source['path']))
    destination=Path(destination)
    def fetch(task):
        format_name, path=task
        target=destination/format_name/Path(path).name
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists() and not refresh:
            return target
        response=subprocess.run(['curl','-fsSL','--retry','2','--max-time','30',
            'https://championsbattledata.com/'+quote(path,safe='/')],capture_output=True)
        if response.returncode:
            raise RuntimeError(f'{path}: {response.stderr.decode().strip()}')
        text=response.stdout.decode('utf-8-sig')
        if not text.startswith('pokemon,'):
            raise ValueError(f'Unexpected CSV response for {path}')
        target.write_text(text)
        return target
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for n, result in enumerate(pool.map(fetch,sorted(tasks)),1):
            if n%50==0 or n==len(tasks):
                print(f'Cached {n}/{len(tasks)} current usage files',flush=True)
    return len(tasks)


if __name__=='__main__':
    download(sys.argv[1],sys.argv[2], '--refresh' in sys.argv[3:])
