"""Prepare bounded agent evidence and deliver a report even when AI is unavailable."""
import argparse
import io
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request
import zipfile

from site_health import request_json,send_email
from validate_site_data import payload

ROOT=Path(__file__).resolve().parents[1]
QUOTA_CODES=('insufficient_quota','credit_balance_exhausted','organization_usage_limit_exceeded',
             'organization_spend_limit_exceeded','project_spend_limit_exceeded')


def unavailable_reason(log):
    if any(code in log.lower() for code in QUOTA_CODES):
        return 'AI review unavailable: API credit or spending limit exhausted. Add credits or adjust the limit in OpenAI billing. Automated checks still ran.'
    if '429' in log or 'rate_limit_exceeded' in log:
        return 'AI review unavailable: provider rate limit. This does not by itself mean the account is out of credit.'
    if '401' in log or '403' in log:
        return 'AI review unavailable: authentication, key permissions or model access failed.'
    return 'AI review unavailable: the agent failed, timed out, or returned invalid output. Check the workflow logs. Automated checks still ran.'


def download(url,headers,limit=12_000_000):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    try:response=urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,headers=headers),timeout=40)
    except urllib.error.HTTPError as error:
        if error.code!=302:raise
        response=urllib.request.urlopen(error.headers['Location'],timeout=40)
    with response:raw=response.read(limit+1)
    if len(raw)>limit:raise ValueError('Evidence download exceeded its limit')
    return raw


def github(path):
    repo=os.environ['GITHUB_REPOSITORY']
    return request_json(f'https://api.github.com/repos/{repo}/{path}',
                        {'Authorization':'Bearer '+os.environ['GITHUB_TOKEN']})


def source_evidence(run_id,directory):
    directory.mkdir(parents=True,exist_ok=True)
    report=directory/'health-report';report.mkdir(exist_ok=True)
    repo=os.environ['GITHUB_REPOSITORY'];headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN']}
    run=github(f'actions/runs/{run_id}')
    if run['head_branch']!='main' or run.get('head_repository',{}).get('full_name')!=repo:
        raise ValueError('Only this repository main branch can supply investigation evidence')
    lines=['# Source workflow',json.dumps({k:run.get(k) for k in ['id','name','status','conclusion','html_url','head_sha','created_at']},indent=2)]
    for job in github(f'actions/runs/{run_id}/jobs?per_page=100')['jobs']:
        # In a reusable workflow, other investigation jobs may already exist.
        if 'agent' in job['name'].lower() or 'deliver' in job['name'].lower():continue
        failed=[s['name'] for s in job['steps'] if s.get('conclusion')=='failure']
        lines.append(f'Job {job["name"]}: {job["conclusion"]}; failed steps: {failed}')
        if failed:
            try:
                raw=download(f'https://api.github.com/repos/{repo}/actions/jobs/{job["id"]}/logs',headers)
                text=raw.decode(errors='replace')[-60000:]
                # GitHub masks secrets; additionally redact familiar token/email shapes.
                text=re.sub(r'\b(?:sk-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]+)\b','[redacted]',text)
                text=re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]+','[email redacted]',text)
                lines+=['## Failed job log (untrusted evidence)',text]
            except Exception:lines.append('Failed-job logs could not be downloaded.')
    try:
        artifacts=github(f'actions/runs/{run_id}/artifacts')['artifacts']
        artifact=next(a for a in artifacts if a['name']=='health-report' and not a['expired'])
        with zipfile.ZipFile(io.BytesIO(download(artifact['archive_download_url'],headers))) as archive:
            for name in ['snapshot.json','report.md','summary.png','summary.html']:
                if name in archive.namelist():
                    info=archive.getinfo(name)
                    if info.file_size>3_000_000:raise ValueError('Oversized report member')
                    (report/name).write_bytes(archive.read(info))
        lines+=['## Actual live audit', (report/'report.md').read_text()]
    except Exception:lines.append('No complete live health report artifact was available.')
    roster=payload(ROOT/'data/champions-roster.js')
    counts={'species':len(roster['pokemon'])}
    for format in ['Singles','Doubles']:
        for category in ['moves','spreads','items','abilities','natures']:
            counts[format+' '+category]=sum(len(p.get('usage',{}).get(format,{}).get(category,[])) for p in roster['pokemon'])
    lines+=['## Current source coverage',json.dumps(counts,indent=2),'## Source and engine provenance',(ROOT/'data/refresh-status.json').read_text()]
    history=subprocess.run(['git','log','--since=40 days ago','--oneline','--stat','--','data','vendor','scripts/refresh_site_data.py'],
                           capture_output=True,text=True,check=True).stdout
    lines+=['## Recent changes (investigate using git history)',history[-30000:]]
    from review_sources import collect
    sources=collect(directory/'upstream')
    lines+=['## Fresh independent upstream captures',
            'Read upstream/index.json and corresponding text files. Fetch failures are limitations, not evidence that a source is current.',
            json.dumps([{k:v for k,v in record.items() if k not in ['links','topLevelKeys']} for record in sources],indent=2)]
    (directory/'evidence.md').write_text('\n\n'.join(lines))
    (directory/'source.json').write_text(json.dumps({'run':run_id,'url':run['html_url'],'name':run['name']}))


def validated_review(path):
    data=json.loads(path.read_text())
    if data.get('status') not in ['healthy','attention','uncertain'] or not isinstance(data.get('summary'),str):raise ValueError('Invalid agent summary')
    for field in ['findings','sources','limitations']:
        if not isinstance(data.get(field),list):raise ValueError('Incomplete agent result')
    lines=[data['summary']]
    for finding in data['findings'][:5]:
        if not all(isinstance(finding.get(key),str) for key in ['severity','finding','evidence','recommendation']):raise ValueError('Invalid finding')
        lines += ['',f'{finding["severity"].upper()}: {finding["finding"]}',finding['evidence'],'Next step: '+finding['recommendation']]
    if data['limitations']:lines+=['','Limitations:',*map(str,data['limitations'])]
    if data['sources']:lines+=['','Sources:',*map(str,data['sources'])]
    return data,'\n'.join(lines)


def email_review(data):
    """Keep routine mail brief; the artifact retains full evidence and sources."""
    def short(value,limit):
        value=' '.join(value.split())
        return value if len(value)<=limit else value[:limit-1].rstrip()+'…'
    lines=[short(data['summary'],350)]
    actionable=[finding for finding in data['findings'] if finding['severity'] in ['high','warning']]
    for finding in actionable[:3]:
        lines+=['',short(finding['finding'],180),'Next step: '+short(finding['recommendation'],220)]
    if len(actionable)>3:lines+=['',f'{len(actionable)-3} more actionable findings in the full report.']
    background=len(data['findings'])-len(actionable)
    if background:lines+=['',f'{background} background/watch observations are in the full report.']
    if data['status']=='uncertain' and data['limitations']:
        lines+=['', 'Review limitation: '+short(str(data['limitations'][0]),180)]
    return '\n'.join(lines)


def deliver(directory,result,outcome):
    source=json.loads((directory/'source.json').read_text())
    snapshot_path=directory/'health-report/snapshot.json'
    snapshot=json.loads(snapshot_path.read_text()) if snapshot_path.exists() else {}
    report_path=directory/'health-report/report.md'
    report=report_path.read_text() if report_path.exists() else 'The source workflow did not produce a complete health report. Inspect the linked workflow for the failed step.\n'
    warnings=list(snapshot.get('warnings',[]))
    if not snapshot_path.exists():warnings.append('Nightly data refresh failed; inspect the investigation below.' if 'Nightly' in source['name'] else 'The automated workflow did not produce a complete live audit.')
    review=None
    concise=None
    if outcome=='success':
        try:
            data,review=validated_review(result)
            concise=email_review(data)
            if data['status']!='healthy':warnings.append('The agent identified concerns or incomplete evidence; see its assessment below.')
        except Exception:pass
    if review is None:
        log=''
        try:
            headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN']}
            for job in github(f'actions/runs/{os.environ["GITHUB_RUN_ID"]}/jobs?per_page=100')['jobs']:
                if job['name'].endswith('agent') and job['status']=='completed':
                    log+=download(f'https://api.github.com/repos/{os.environ["GITHUB_REPOSITORY"]}/actions/jobs/{job["id"]}/logs',headers).decode(errors='replace')
        except Exception:pass
        review=unavailable_reason(log);warnings.append(review)
        concise=review
    email=report+'\n## Agent assessment\n'+concise+'\n\nFull report and evidence: https://github.com/'+os.environ.get('GITHUB_REPOSITORY','arudich/pokelator-pro')+'/actions/runs/'+os.environ['GITHUB_RUN_ID']+'\n'
    report+='\n## Agent assessment\n'+review+'\n\nSource workflow: '+source['url']+'\n'
    (directory/'combined-report.md').write_text(report)
    summary=directory/'health-report/summary.png'
    send_email(email,warnings,'agent-'+os.environ['GITHUB_RUN_ID'],summary if summary.exists() else None,source['url'],review=concise)
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as file:file.write(report)
    print('Agent outcome:',outcome)
    # Delivery succeeds even when API credit is exhausted; the email carries the warning.


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('mode',choices=['prepare','deliver'])
    parser.add_argument('--source-run');parser.add_argument('--directory',default='review-input')
    parser.add_argument('--outcome',default='failure');parser.add_argument('--result',default='review-result/assessment.json')
    args=parser.parse_args()
    if args.mode=='prepare':source_evidence(int(args.source_run),Path(args.directory))
    else:deliver(Path(args.directory),Path(args.result),args.outcome)


if __name__=='__main__':main()
