"""Render the silent portrait promo with Chromium's MP4 encoder.

.venv/bin/python scripts/render_promo.py
"""
import base64
import functools
import http.server
import json
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'output/marketing'
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass

def main():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch();page=browser.new_page(viewport={'width':1080,'height':1920},device_scale_factor=1)
            page.set_default_timeout(60000)
            page.goto(f'http://127.0.0.1:{server.server_port}/docs/marketing/promo.html',wait_until='domcontentloaded')
            page.evaluate('window.ready')
            # Retain stills for a quick visual review of each major cut.
            for index,time in enumerate([1,3.5,5.8,8.5]):
                page.evaluate('time=>renderPromo(time)',time)
                page.locator('canvas').screenshot(path=str(OUTPUT/f'scene-{index+1}.png'))
            result=page.evaluate('recordPromo()')
            video=OUTPUT/'pokelator-tiktok.mp4';video.write_bytes(base64.b64decode(result.pop('base64')))
            assert result['audioTracks']==0
            metadata=page.evaluate('''async url=>{const blob=await fetch(url).then(r=>r.blob());const video=document.createElement('video');video.preload='auto';video.src=URL.createObjectURL(blob);await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});return {width:video.videoWidth,height:video.videoHeight,duration:video.duration};}''',f'http://127.0.0.1:{server.server_port}/output/marketing/pokelator-tiktok.mp4')
            assert metadata['width']==1080 and metadata['height']==1920,metadata
            expected=page.evaluate('DURATION / PLAYBACK_SPEED')
            assert expected-.3<=metadata['duration']<=expected+.3,metadata
            result.update(metadata)
            (OUTPUT/'video-info.json').write_text(json.dumps(result,indent=2)+'\n')
            print(json.dumps({'file':str(video),**result}),flush=True)
            browser.close()
    finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':main()
