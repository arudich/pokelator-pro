"""Audit production, compare historical coverage, and send the Pokelator health report."""
import argparse
import datetime as dt
import hashlib
import html
import io
import json
import os
from pathlib import Path
import urllib.request
import urllib.error
import zipfile

UTC=dt.timezone.utc
ROOT=Path(__file__).resolve().parents[1]
EVENT_LABELS={'visit':'page loads','matchup':'calculated matchups','team_created':'teams created',
              'team_imported':'teams imported','pokemon_added':'Pokémon added',
              'color_change':'color edits','color_saved':'palettes locked in'}


def request_json(url,headers=None,data=None):
    request=urllib.request.Request(url,headers={'User-Agent':'Pokelator health check',**(headers or {})},
                                   data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(request,timeout=40) as response:
        return json.load(response)


def timestamp(value):
    return dt.datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(UTC)


def inspect_snapshot(current,baseline=None,now=None):
    """Freshness is source-aware: monthly usage need not change every night."""
    now=now or dt.datetime.now(UTC);warnings=[]
    def age(value):
        try:return (now-timestamp(value)).total_seconds()
        except (ValueError,TypeError,AttributeError):return float('inf')
    checked=current.get('checkedAt')
    if age(checked)>72*3600:
        warnings.append('The last successful data check is more than 72 hours old or missing.')
    generated=current.get('rosterGeneratedAt')
    if age(generated)>14*86400:
        warnings.append('The source roster is over 14 days old or missing; inspect the upstream publisher.')
    coverage=current.get('coverage',{})
    if coverage.get('species',0)<100:warnings.append('The roster is unexpectedly small.')
    for key,value in coverage.items():
        if value<=0:warnings.append(f'Missing data: {key}.')
        old=(baseline or {}).get('coverage',{}).get(key)
        if old and value<old*.9:warnings.append(f'{key} fell from {old:,} to {value:,} (more than 10%).')
    for label,data in current.get('formats',{}).items():
        if not data.get('month'):warnings.append(f'{label}: usage month is missing.')
        elif (now.year-int(data['month'][:4]))*12+now.month-int(data['month'][5:])>2:
            warnings.append(f'{label}: latest deployed usage is from {data["month"]}.')
    if set(current.get('formats',{}))!={'Singles','Doubles'}:warnings.append('A usage format is missing.')
    return warnings


def historical_snapshot(repo,token,now):
    """Use a retained report near a month ago, never today's checkout as the baseline."""
    if not repo or not token:return None
    headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json'}
    listing=request_json(f'https://api.github.com/repos/{repo}/actions/artifacts?name=health-snapshot&per_page=100',headers)
    candidates=[a for a in listing['artifacts'] if a['name']=='health-snapshot' and not a['expired'] and 25<=(now-timestamp(a['created_at'])).days<=50]
    if not candidates:return None
    artifact=min(candidates,key=lambda a:abs((now-timestamp(a['created_at'])).days-30))
    # GitHub redirects to a signed download. Never forward Authorization to that host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    opener=urllib.request.build_opener(NoRedirect)
    req=urllib.request.Request(artifact['archive_download_url'],headers=headers)
    try:
        response=opener.open(req,timeout=40)
    except urllib.error.HTTPError as error:
        if error.code!=302:raise
        response=urllib.request.urlopen(error.headers['Location'],timeout=40)
    with response:
        raw=response.read(2_000_001)
    if len(raw)>2_000_000:raise ValueError('Historical snapshot archive too large')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        member=archive.getinfo('snapshot.json')
        if member.file_size>1_000_000:raise ValueError('Historical snapshot too large')
        return json.loads(archive.read(member))


def audit_browser(url,output):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser=p.chromium.launch()
        context=browser.new_context(viewport={'width':1440,'height':1000})
        page=context.new_page();page.set_default_timeout(30000)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)[:250]))
        checks=[];snapshot={}
        try:
            response=page.goto(url,wait_until='domcontentloaded',timeout=60000)
            if not response or response.status!=200:raise ValueError('Production homepage did not return HTTP 200')
            page.wait_for_selector('.move-row')
            snapshot=page.evaluate("""async () => {
              const roster=window.CHAMPIONS_ROSTER.pokemon,coverage={species:roster.length,
                learnsetMoves:roster.reduce((n,p)=>n+p.learnset.length,0)};
              for(const format of ['Singles','Doubles']) for(const field of ['moves','spreads','items','abilities','natures']) {
                coverage[format+' '+field]=roster.reduce((n,p)=>n+(p.usage?.[format]?.[field]?.length || 0),0);
              }
              const status=await fetch('/data/refresh-status.json',{cache:'no-store'}).then(r=>{if(!r.ok) throw Error('Refresh status unavailable');return r.json()});
              const moveText=await fetch('/data/balance-moves.js').then(r=>{if(!r.ok) throw Error('Move metadata unavailable');return r.text()});
              const moveData=JSON.parse(moveText.slice(moveText.indexOf(' = ')+3).trim().replace(/;$/,''));
              coverage.moveEffects=Object.keys(moveData.moves).length;
              for(const [format,data] of Object.entries(window.META_USAGE.formats)) coverage[format+' meta species']=Object.keys(data.species).length;
              return {...status,coverage,formats:window.META_USAGE.formats && Object.fromEntries(
                Object.entries(window.META_USAGE.formats).map(([k,v])=>[k,{month:v.month,format:v.format,species:Object.keys(v.species).length}]))};
            }""")
            checks.append('Battle page loaded and calculated damage.')
            damage=page.evaluate("""() => {
              const attacker=getPokemonByName('Basculegion'),defender=getPokemonByName('Mega Medicham');
              const ours=sanitizeTeamEntry({name:defender.name,nature:'Adamant',investment:{hp:30,atk:32,spd:4}});
              return [0,1,2,3].map(n=>Battle.incomingRange(attacker,defender,ours,'Last Respects',{
                format:'Doubles',opponentAbility:'Adaptability',boostOffenseNature:true,attackerAlliesFainted:n}).minDamage);
            }""")
            if damage!=[132,260,388,516]:errors.append('Live damage reference changed: '+str(damage))
            else:checks.append('Live damage reference passed at four fainted-ally counts.')
            # Compare what production actually serves with its own integrity manifest.
            manifest=page.evaluate("fetch('/vendor/SHA256SUMS').then(r=>r.text())")
            for line in manifest.splitlines():
                digest,name=line.split(maxsplit=1)
                if not name.startswith('vendor/') or '..' in name:raise ValueError('Invalid integrity manifest')
                body=page.request.get(url.rstrip('/')+'/'+name).body()
                if hashlib.sha256(body).hexdigest()!=digest:errors.append('Production engine integrity mismatch: '+name)
            page.screenshot(path=str(output/'battle.png'),full_page=True)
            page.locator('#teamBuilderButton').click()
            page.evaluate('state.builderTopN=20')
            for panel in ['speed','offense','team-offense','defense','balance']:
                page.locator(f'[data-builder-panel="{panel}"]').click()
                selector='[data-speed-species]' if panel=='speed' else '[data-offense-species]'
                # Speed sprites have a separate attribute; check the common visible tier cloud.
                if panel=='speed':selector='.tier-pokemon'
                page.locator('#teamBuilderPanel '+selector).first.wait_for(state='visible',timeout=60000)
                page.screenshot(path=str(output/(panel+'.png')),full_page=True)
                checks.append(panel.replace('-',' ').title()+' view populated.')
            page.set_viewport_size({'width':390,'height':844})
            page.locator('#battleViewButton').click()
            page.screenshot(path=str(output/'mobile.png'),full_page=True)
            if page.evaluate('document.documentElement.scrollWidth>innerWidth+2'):errors.append('The mobile page overflows horizontally.')
        except Exception as error:
            errors.append('Live browser audit: '+str(error).splitlines()[0][:300])
            try:page.screenshot(path=str(output/'failure.png'),full_page=True)
            except Exception:pass
        finally:browser.close()
    return snapshot,checks,list(dict.fromkeys(errors))


def usage_report(url,token,now):
    if not token:return {'available':False,'reason':'Anonymous counters have not been connected to the report.'}
    end=now.date();start=end-dt.timedelta(days=14);prior=start-dt.timedelta(days=14)
    data=request_json(url.rstrip('/')+f'/api/usage?report=1&since={prior}&until={end}',{'Authorization':'Bearer '+token})
    totals={key:0 for key in EVENT_LABELS};previous=totals.copy()
    for row in data['rows']:
        if row['event'] in totals:
            (totals if row['day']>=str(start) else previous)[row['event']]+=row['total']
    return {'available':True,'since':str(start),'until':str(end),'firstRecordedDay':data.get('firstRecordedDay'),
            'totals':totals,'previous':previous,'previousPeriodComplete':bool(data.get('firstRecordedDay') and data['firstRecordedDay']<=str(prior))}


def render_report(snapshot,checks,warnings,usage,baseline,run_url):
    heading='Attention needed' if warnings else 'Healthy'
    lines=[f'# Pokelator health report · {heading}',f'Checked {snapshot["auditedAt"][:10]} · {snapshot["url"]}',
           '', '## Checks completed',*['- '+x for x in checks],
           '', '## Things to investigate' if warnings else 'No problems detected by these checks.',*['- '+x for x in warnings],
           '', '## Data status',f'- Species/forms: {snapshot.get("coverage",{}).get("species","unavailable")}',
           f'- Last successful refresh: {snapshot.get("checkedAt","unavailable")}',
           f'- Engine: {snapshot.get("engine",{}).get("version","unavailable")}']
    for label,data in snapshot.get('formats',{}).items():lines.append(f'- {label} usage: {data["month"]} · {data["species"]} entries')
    lines+=['- Coverage compared with '+baseline['auditedAt'][:10]+'.' if baseline else '- A month-old comparison will become available after 25 days of reports.',
            '', '## Usage statistics']
    if usage.get('available'):
        lines.append(f'{usage["since"]} through {usage["until"]} (end exclusive, UTC):')
        for key,label in EVENT_LABELS.items():
            count=usage['totals'][key];old=usage['previous'][key]
            change=f' · {count-old:+,} vs. previous 14 days' if usage['previousPeriodComplete'] else ''
            lines.append(f'- {count:,} {label}{change}')
        if not usage['firstRecordedDay']:lines.append('No events recorded yet; zero counts do not establish working delivery.')
        elif not usage['previousPeriodComplete']:lines.append('Tracking is new; previous-period comparisons are not complete yet. First event: '+usage['firstRecordedDay'])
    else:lines.append('Usage unavailable: '+usage['reason'])
    lines+=['', 'Counts are approximate browser actions, not unique people, actual battles, or currently saved teams. Team contents stay local. Blocking, batching and public-endpoint abuse can affect totals.',
            '', 'Screenshots and machine-readable evidence: '+run_url,
            '', 'This is an automated audit, not a guarantee that every matchup or visual detail is correct.']
    return '\n'.join(lines)+'\n'


def send_email(report,warnings,run_id):
    required=['RESEND_API_KEY','HEALTH_EMAIL_TO','HEALTH_EMAIL_FROM']
    if not all(os.getenv(key) for key in required):raise RuntimeError('Email setup incomplete: configure RESEND_API_KEY, HEALTH_EMAIL_TO and HEALTH_EMAIL_FROM in GitHub Actions secrets.')
    result=request_json('https://api.resend.com/emails',
        {'Authorization':'Bearer '+os.environ['RESEND_API_KEY'],'Content-Type':'application/json',
         'Idempotency-Key':'pokelator-health-'+run_id},
        {'from':os.environ['HEALTH_EMAIL_FROM'],'to':[os.environ['HEALTH_EMAIL_TO']],
         'subject':'Pokelator health report · '+('Attention needed' if warnings else 'Healthy'),
         'text':report,'html':'<div style="font:16px/1.6 system-ui;white-space:pre-wrap">'+html.escape(report)+'</div>'})
    if not result.get('id'):raise RuntimeError('Email provider did not confirm acceptance')
    print('Resend accepted the health report for delivery.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default=os.getenv('HEALTH_SITE_URL') or 'https://pokelator-pro.pages.dev')
    parser.add_argument('--output',default='health-report');parser.add_argument('--send',action='store_true')
    args=parser.parse_args();output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    now=dt.datetime.now(UTC);warnings=[]
    snapshot,checks,browser_errors=audit_browser(args.url,output);warnings+=browser_errors
    snapshot.update(auditedAt=now.isoformat(),url=args.url)
    baseline=None
    try:baseline=historical_snapshot(os.getenv('GITHUB_REPOSITORY'),os.getenv('GITHUB_TOKEN'),now)
    except Exception:warnings.append('Historical coverage comparison could not be downloaded.')
    warnings+=inspect_snapshot(snapshot,baseline,now)
    try:
        from refresh_meta_usage import snapshot as latest_usage
        latest=latest_usage(discover=True)
        for label,data in latest['formats'].items():
            live=snapshot.get('formats',{}).get(label,{})
            if (live.get('month'),live.get('format'))!=(data['month'],data['format']):warnings.append(label+' has newer published usage not yet deployed.')
        checks.append('Checked the upstream archive for newer complete usage formats.')
    except Exception:warnings.append('Could not independently check the latest upstream usage archive.')
    try:usage=usage_report(args.url,os.getenv('USAGE_REPORT_TOKEN'),now)
    except Exception:usage={'available':False,'reason':'The counter endpoint could not be read.'}
    if not usage['available']:warnings.append(usage['reason'])
    repo=os.getenv('GITHUB_REPOSITORY','arudich/pokelator-pro');run=os.getenv('GITHUB_RUN_ID','local')
    run_url=f'https://github.com/{repo}/actions/runs/{run}'
    report=render_report(snapshot,checks,warnings,usage,baseline,run_url)
    snapshot.update(warnings=warnings,checks=checks,usage=usage)
    (output/'snapshot.json').write_text(json.dumps(snapshot,indent=2)+'\n')
    (output/'report.md').write_text(report)
    print(report)
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as file:file.write(report)
    if args.send:send_email(report,warnings,run)
    if warnings:raise SystemExit(1)


if __name__=='__main__':main()
