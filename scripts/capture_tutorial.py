"""Capture four annotated pictures from the real app; run only for pre-publish review.

    .venv/bin/python scripts/capture_tutorial.py

Uses a temporary HTTP server and isolated browser storage, never your saved teams.
"""
import base64
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'assets/tutorial'


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):
        pass


def capture():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch()
            context=browser.new_context(viewport={'width':1800,'height':1020},device_scale_factor=3)
            context.add_init_script("localStorage.setItem('pokelator-pro-tutorial-seen-v1','true')")
            page=context.new_page();page.set_default_timeout(20000)
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded')
            page.wait_for_selector('.move-row')
            page.evaluate("""() => {
              state.ourTeam=[sanitizeTeamEntry({name:'Mega Charizard Y',ability:'Drought',nature:'Modest',investment:{hp:10,spa:24,spe:20},moveSet:['Heat Wave','Air Slash','Solar Beam','Protect']}),
                sanitizeTeamEntry({name:'Kingambit',ability:'Supreme Overlord',nature:'Adamant',investment:{hp:20,atk:32},moveSet:['Kowtow Cleave','Sucker Punch','Iron Head','Protect']}),
                sanitizeTeamEntry({name:'Garchomp',nature:'Jolly',investment:{atk:32,spe:32},moveSet:['Earthquake','Dragon Claw','Rock Slide','Protect']})];
              state.opponentList=['Kingambit','Mega Kangaskhan','Basculegion Male','Sylveon'].map(name=>sanitizeOpponentEntry({name}));
              state.activeOurIndex=state.activeOpponentIndex=0;state.builderTopN=30;
              state.weather='Sun';state.alliesFainted=1;
              getPreferences(state.opponentList[0],'opponent').itemChoice='Life Orb';
              render();
            }""")
            # Wait for real sprite assets, including the visible opponents.
            page.wait_for_function("[...document.querySelectorAll('.active-summary img,.opponent-row img,.team-row img')].every(image=>image.complete)",timeout=30000)
            def image(selector,clip_height=None):
                locator=page.locator(selector)
                locator.scroll_into_view_if_needed()
                box=locator.bounding_box()
                if clip_height:box['height']=min(box['height'],clip_height)
                data=page.screenshot(clip=box,animations='disabled')
                return 'data:image/png;base64,'+base64.b64encode(data).decode()
            battle=image('.battle-panel');speed_card=image('.speed-card');opponents=image('.opponent-panel')
            page.evaluate("state.weather='';state.alliesFainted=0;state.builderPanel='offense';setView('builder')")
            page.wait_for_selector('#builderOffenseTiers .tier-pokemon')
            page.wait_for_function('moveTrial.finished')
            if page.locator('#builderMoveTrial').is_enabled():page.locator('#builderMoveTrial').check()
            page.evaluate("document.getElementById('builderOffenseTiers').scrollTop=0")
            page.wait_for_timeout(700)
            offense=image('#teamBuilderPanel');overview_team=image('.our-team-panel')
            panels={}
            for panel in ['speed','offense','defense','balance']:
                page.evaluate("panel=>{state.builderPanel=panel;renderTeamBuilder()}",panel)
                tier='#builderSpeedTiers' if panel=='speed' else '#builderOffenseTiers'
                page.wait_for_selector(tier+' .tier-pokemon',timeout=60000)
                if panel=='balance':page.wait_for_function('balanceTrial.finished',timeout=60000)
                if panel=='defense':
                    page.wait_for_function('defenseTrial.finished',timeout=60000)
                    if page.locator('#builderDefenseTrial').is_enabled():
                        page.locator('#builderDefenseTrial').check()
                        page.wait_for_function('defenseTrial.finished',timeout=60000)
                page.evaluate("selector=>document.querySelector(selector).scrollTop=0",tier)
                page.wait_for_timeout(300)
                # Include the real controls and first few rows, not an invented mockup.
                box=page.locator('#teamBuilderPanel').bounding_box()
                top=page.locator('#builderSelectedSummary').bounding_box()['y']
                box['height']=min(600,box['height']-(top-box['y']));box['y']=top
                panels[panel]='data:image/png;base64,'+base64.b64encode(page.screenshot(clip=box,animations='disabled')).decode()
            page.evaluate("""() => {
              state.builderPanel='offense';moveTrial.enabled=false;
              ['Kingambit','Sneasler','Pelipper','Rillaboom'].forEach(name=>{const id=getPokemonByName(name).id;if(!builderReferences.has(id))builderReferences.toggle(id)});
              builderReferences.rename('Rain & priority checks');builderReferences.commit();
              renderTeamBuilder();document.getElementById('builderOffenseTiers').scrollTop=0;
            }""")
            page.wait_for_selector('#builderOffenseTiers .reference-highlighted')
            highlighted=image('#teamBuilderPanel')
            page.locator('#builderReferenceSetsButton').click()
            saved=image('#builderReferenceSets')
            if errors:raise RuntimeError('App errors during capture: '+repr(errors))
            # Compose annotations as HTML and capture with the browser; screenshots stay unedited.
            art=context.new_page();art.set_viewport_size({'width':1440,'height':810})
            css='''*{box-sizing:border-box}body{margin:0;background:#0e1827;color:#edf3ff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:1440px;height:810px;padding:32px;overflow:hidden;background:radial-gradient(ellipse at 80% 0%,#213b50,transparent 55%),#101b2b}.eyebrow{font-size:14px;letter-spacing:2px;color:#9fb5d0;font-weight:700;margin-bottom:10px}h1{font-size:34px;letter-spacing:-1px;margin:0 0 24px}h2{font-size:26px;margin:0 0 6px}p{font-size:18px;line-height:1.45;color:#d2e3f4;font-weight:600;margin:0}img{display:block;width:100%}.frame{border:1px solid #435a73;border-radius:12px;overflow:hidden;box-shadow:0 12px 32px #0005}.tag{display:inline-block;border:1px solid #5fa5c2;border-radius:9px;background:linear-gradient(120deg,#245c7d,#29485a);color:#f2fbff;padding:9px 14px;font-size:21px;font-weight:800;box-shadow:0 5px 18px #0003}.columns .tag{display:flex;align-items:center;min-height:94px;font-size:30px;line-height:1.15;letter-spacing:-.5px}.columns>div:nth-child(2) .tag{background:linear-gradient(120deg,#355f51,#254151);border-color:#7cb99c}.columns{display:grid;grid-template-columns:1fr 1fr;gap:26px}.overview-shot{height:480px;overflow:hidden;margin-top:14px}.overview-shot img{height:100%;object-fit:cover;object-position:top}.stack{position:relative}.small-team{position:absolute;bottom:14px;right:14px;width:205px;height:280px;overflow:hidden;border:1px solid #6cc3ff;border-radius:10px;box-shadow:0 8px 30px #0009}.note{position:absolute;bottom:28px;left:18px;background:#101b2bf2;border:1px solid #435a73;border-radius:9px;padding:12px 15px;max-width:380px}.battle-grid{display:grid;grid-template-columns:260px 730px 330px;gap:24px}.battle-grid .frame{height:650px}.battle-center{position:relative}.speed-inset{position:absolute;bottom:12px;left:12px;right:12px;border:1px solid #6cc3ff;border-radius:10px;overflow:hidden;box-shadow:0 0 25px #000a}.battle-grid .speed-inset img{height:auto;object-fit:contain}.battle-grid img{height:100%;object-fit:cover;object-position:top}.callout{margin:28px 0 38px;padding-left:14px;border-left:3px solid #70d7ff}.callout b{display:block;font-size:22px;margin-bottom:7px}.callout span{color:#d2e3f4;font-size:19px;font-weight:600;line-height:1.5}.quad{display:grid;grid-template-columns:1fr 1fr;gap:20px}.tile{background:#18283a;border:1px solid #435a73;border-radius:12px;overflow:hidden}.tile-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px}.tile-head h2{font-size:21px;margin:0}.tile-head span{color:#cce9ff;font-size:17px;font-weight:700;max-width:52%;text-align:right}.tile .crop{height:240px;overflow:hidden}.tile img{width:100%;object-fit:cover;object-position:top}.focus{position:relative;height:650px}.focus-main{width:1010px;height:650px;overflow:hidden}.focus-main img{width:100%}.focus-side{position:absolute;right:0;top:0;width:342px}.focus-side .frame{margin-top:18px}.focus-side p{margin:10px 0 24px}.focus-label{position:absolute;top:45px;left:400px;background:#223b4ef5;border:1px solid #70d7ff;border-radius:8px;padding:8px 12px;font-size:17px}.arrow{font-size:24px;color:#70d7ff}.legend{display:flex;gap:18px;margin-top:20px}.legend span{font-size:18px;color:#d2e3f4}.legend b{color:#edf3ff}'''
            def export(name,title,body):
                art.set_content('<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body><main><div class="eyebrow">Pokelator Pro / Quick Tour</div><h1>'+title+'</h1>'+body+'</main></body></html>')
                art.screenshot(path=str(OUTPUT/(name+'.png')),type='png',animations='disabled')
                print('Captured',name,flush=True)
            export('overview','Your Team, the Meta, and the Answer',f'''<div class="columns"><div><div class="tag">Battle Answers in Seconds</div><div class="stack frame overview-shot"><img src="{battle}"><div class="note"><h2>Pick the Opponent</h2><p>Preloaded moves, builds and usage</p></div></div></div><div><div class="tag">Build a Meta Relevant Team</div><div class="stack frame overview-shot"><img src="{offense}"><div class="small-team"><img src="{overview_team}"></div><div class="note"><h2>Build, Preview, Save</h2><p>Moves · stat spreads · matchups</p></div></div></div></div><div class="legend"><span><b>Battle View</b> · decide during a match</span><span><b>Team Builder</b> · improve between matches</span><span><b>Your Teams</b> · saved in this browser</span></div>''')
            export('battle','A Matchup, with Every Assumption in Reach',f'''<div class="battle-grid"><div><div class="callout"><b>Battle Conditions</b><span>Weather · terrain<br>Fainted allies · stat stages</span></div><div class="callout"><b>Damage, Both Ways</b><span>Our exact build against meta-informed opponents</span></div><div class="callout"><b>Speed Scenarios</b><span>Normal · Scarf · Tailwind<br>Both sides’ Speed stages</span></div></div><div class="frame battle-center"><img src="{battle}"><div class="speed-inset"><img src="{speed_card}"></div></div><div><div class="tag">Opponents · Items · Abilities</div><div class="frame" style="height:610px;margin-top:14px"><img src="{opponents}"></div></div></div>''')
            tiles=[('speed','Speed','Find Investment Thresholds'),('offense','Offense + Team Offense','Try Move Swaps · Compare Coverage'),('defense','Defense','Invest Free Points into Bulk'),('balance','Balance','Compare 1v1s · Optimize All Stats')]
            export('builder','Investments That Change the Matchup','<div class="quad">'+''.join(f'<div class="tile"><div class="tile-head"><h2>{label}</h2><span>{detail}</span></div><div class="crop"><img src="{panels[key]}"></div></div>' for key,label,detail in tiles)+'</div>')
            export('highlights','A Shortlist Across Every View',f'''<div class="focus"><div class="frame focus-main"><img src="{highlighted}"></div><div class="focus-label">Search + Click → Highlight</div><div class="focus-side"><div class="tag">Named Highlight Sets</div><p style="margin-top:14px">Shortlists for specific teams, matchups and threats</p><div class="frame"><img src="{saved}"></div><div class="callout"><b>★ Focus the Calculations</b><span>Show only highlighted Pokémon<br>Score and optimize over that set</span></div><div class="callout"><b>Keep Your References</b><span>Shared across views<br>Remembered after reload</span></div></div></div>''')
            browser.close()
    finally:
        server.shutdown();server.server_close();thread.join()


if __name__=='__main__':capture()
