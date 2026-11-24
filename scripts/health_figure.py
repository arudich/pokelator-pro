"""Render an email-ready PNG dashboard with the existing Chromium dependency."""
import datetime as dt
import html
from zoneinfo import ZoneInfo


def summary_html(snapshot,checks,warnings,usage,baseline):
    esc=lambda value:html.escape(str(value))
    audited=dt.datetime.fromisoformat(snapshot['auditedAt'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York'))
    status='Attention needed' if warnings else 'Healthy'
    coverage=snapshot.get('coverage',{})
    meta_notice='<section><h2>Meta Changes</h2>'+''.join('<p>'+esc(change)+'</p>' for change in snapshot.get('metaChanges',[]))+'</section>' if snapshot.get('metaChanges') else ''
    try:
        refreshed=dt.datetime.fromisoformat(snapshot['checkedAt'].replace('Z','+00:00'))
        age=max(0,(audited-refreshed).total_seconds()/3600)
        refresh=f'{age:.0f}h ago' if age>=1 else '<1h ago'
    except (KeyError,ValueError,TypeError,AttributeError):refresh='Unknown'
    cards=[('Checks completed',str(len(checks))),('Species / forms',f'{coverage["species"]:,}' if 'species' in coverage else 'Unavailable'),
           ('Successful refresh',refresh)]
    card_html=''.join(f'<div class="card"><span>{esc(label)}</span><strong>{esc(value)}</strong></div>' for label,value in cards)
    notices=''.join(f'<li>{esc(warning)}</li>' for warning in warnings)
    alert=f'<section class="alert"><h2>Needs attention</h2><ul>{notices}</ul></section>' if warnings else ''
    # Shared linear scale, no decorative minimum bar: a zero remains zero.
    labels={'visit':'Page loads','matchup':'Matchups calculated','team_created':'Teams created','team_imported':'Teams imported',
            'pokemon_added':'Pokémon added','color_change':'Color edits','color_saved':'Palettes saved'}
    if usage.get('available'):
        complete=usage.get('previousPeriodComplete',False)
        maximum=max([usage['totals'].get(key,0) for key in labels]+([usage['previous'].get(key,0) for key in labels] if complete else [])+[1])
        bars=[]
        for key,label in labels.items():
            count=usage['totals'].get(key,0);old=usage.get('previous',{}).get(key,0)
            prior=f'<div class="track prior"><i style="width:{old/maximum*100:.3f}%"></i></div>' if complete else ''
            delta=f'<small>{count-old:+,} vs prior</small>' if complete else ''
            bars.append(f'<div class="bar-row"><div class="bar-label">{esc(label)}</div><div class="bar-pair"><div class="track"><i style="width:{count/maximum*100:.3f}%"></i></div>{prior}</div><div class="bar-count">{count:,}{delta}</div></div>')
        dates=f'{usage["since"]} → {usage["until"]} · 14 complete UTC days'
        note='Teal: latest 14 days · gray: preceding 14 days. Shared linear scale.' if complete else 'Tracking is new. No complete previous period is available yet.'
        if not any(usage['totals'].values()):note+=' No activity recorded in this reporting window.'
        activity=f'<div class="section-heading"><h2>Site activity</h2><span>{esc(dates)}</span></div>{"".join(bars)}<p class="note">{esc(note)}</p>'
    else:
        activity=f'<h2>Site activity</h2><div class="empty">Usage unavailable<p>{esc(usage.get("reason","Counters could not be read."))}</p></div>'
    data_rows=[]
    for label,data in snapshot.get('formats',{}).items():
        data_rows.append(f'<div class="data-row"><strong>{esc(label)} usage</strong><span>{esc(data.get("month","Unknown"))} · {data.get("species",0):,} species</span></div>')
    data_rows.append(f'<div class="data-row"><strong>Damage engine</strong><span>{esc(snapshot.get("engine",{}).get("version","Unknown"))}</span></div>')
    if baseline:
        comparisons=[]
        for key,label in [('species','Species/forms'),('learnsetMoves','Learnset entries'),('moveEffects','Move effects'),('Singles spreads','Singles spreads'),('Doubles spreads','Doubles spreads')]:
            old=baseline.get('coverage',{}).get(key);current=coverage.get(key)
            if old and current is not None:
                change=(current-old)/old*100
                tone='loss' if change<-10 else ''
                # Zero is the baseline, with gains to the right and losses to the left.
                width=min(50,abs(change)/100*50)
                pos=f'left:50%;width:{width:.2f}%' if change>=0 else f'right:50%;width:{width:.2f}%'
                comparisons.append(f'<div class="coverage-row"><span>{esc(label)}</span><div class="delta-track"><b></b><i class="{tone}" style="{pos}"></i></div><strong class="{tone}">{change:+.1f}%</strong></div>')
        comparison=f'<h3>Coverage change · since {esc(baseline["auditedAt"][:10])}</h3>'+''.join(comparisons)
    else:comparison='<div class="baseline-note">Coverage trends will appear once a month of report history is available.</div>'
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
      *{{box-sizing:border-box}}body{{margin:0;background:#edf2f6;color:#192b3e;font:17px/1.45 Arial,sans-serif}}
      main{{width:760px;background:#fff;padding:36px 38px 24px;border-top:6px solid #387c90}}
      .eyebrow{{font-size:11px;letter-spacing:2px;font-weight:700;color:#607589}}header{{display:flex;justify-content:space-between;align-items:center}}
      h1{{font-size:31px;letter-spacing:-1px;margin:8px 0 3px;line-height:1.2}}.date{{font-size:13px;color:#617184}}.badge{{font-size:13px;font-weight:bold;padding:8px 13px;border-radius:20px;background:{'#fff1db' if warnings else '#e6f3ec'};color:{'#885410' if warnings else '#24664a'}}}
      .cards{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:25px 0}}.card{{background:#f3f6f8;border:1px solid #e4eaf0;border-radius:10px;padding:15px}}.card span{{font-size:12px;color:#607184}}.card strong{{display:block;font-size:29px;letter-spacing:-.7px;margin-top:3px}}
      section{{padding-top:23px;margin-top:23px;border-top:1px solid #dce4eb}}h2{{font-size:18px;margin:0 0 18px}}h3{{font-size:13px;margin:22px 0 12px;color:#52687c}}.section-heading span{{display:block;font-size:12px;color:#64778a;margin:-12px 0 20px}}
      .bar-row{{display:grid;grid-template-columns:155px 1fr 110px;gap:14px;align-items:center;margin:17px 0;font-size:14px}}.bar-count{{text-align:right;font-size:18px;font-weight:bold}}.bar-count small{{display:block;font-size:10px;font-weight:normal;color:#607589}}.track{{height:10px;background:#edf2f5;border-radius:3px;overflow:hidden}}.track i{{display:block;height:100%;background:#3e7a91;border-radius:3px}}.prior{{height:5px;margin-top:4px}}.prior i{{background:#aab8c4}}.note{{font-size:11px;color:#64768a;margin:20px 0 0}}
      .data-row{{display:flex;justify-content:space-between;font-size:13px;padding:8px 0}}.data-row strong{{font-weight:normal;color:#546b80}}.coverage-row{{display:grid;grid-template-columns:145px 1fr 75px;gap:15px;font-size:12px;align-items:center;margin:12px 0}}.coverage-row strong{{text-align:right;font-weight:normal}}.delta-track{{height:10px;position:relative;background:#f1f5f7;border-radius:3px}}.delta-track b{{position:absolute;left:50%;height:14px;top:-2px;border-left:1px solid #a9b8c3}}.delta-track i{{position:absolute;height:10px;background:#3e7a91}}.delta-track .loss{{background:#b06d54}}.loss{{color:#a34a31}}.baseline-note{{background:#f4f7f9;padding:13px 15px;margin-top:15px;border-radius:7px;font-size:12px;color:#64768a}}
      .alert{{background:#fff7e9;border:1px solid #f0dfba;border-radius:9px;padding:16px 18px}}.alert h2{{font-size:15px;margin-bottom:8px}}.alert ul{{margin:0;padding-left:18px;font-size:12px}}.alert li{{margin:6px 0}}.empty{{border:1px dashed #c5d1da;border-radius:8px;padding:20px;color:#5c7286;font-size:15px}}.empty p{{font-size:12px;margin-bottom:0}}footer{{font-size:10px;color:#748598;border-top:1px solid #e1e8ee;padding-top:16px;margin-top:25px}}footer p{{margin:5px 0}}
    </style></head><body><main><header><div><div class="eyebrow">POKELATOR / HEALTH REPORT</div><h1>Site health &amp; activity</h1><div class="date">{esc(audited.strftime('%B %d, %Y'))} · {esc(audited.strftime('%I:%M %p %Z'))}</div></div><span class="badge">{status}</span></header>
    <div class="cards">{card_html}</div>{alert}<section>{activity}</section><section><h2>Data &amp; mechanics</h2>{''.join(data_rows)}{comparison}</section>{meta_notice}
    <footer><p>{esc(snapshot.get('url',''))}</p><p>Activity counts represent approximate browser actions, not unique people or real battles. Teams stay local.</p></footer></main></body></html>'''


def render_summary(snapshot,checks,warnings,usage,baseline,path):
    from playwright.sync_api import sync_playwright
    markup=summary_html(snapshot,checks,warnings,usage,baseline)
    path.with_suffix('.html').write_text(markup)
    with sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page(viewport={'width':760,'height':1000},device_scale_factor=2)
        page.set_content(markup)
        page.locator('main').screenshot(path=str(path),animations='disabled')
        browser.close()
    return path
