"""Online smoke check of real Champions PNGs, using exact bundled source paths.

    .venv/bin/python scripts/verify_assets.py
"""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['Sneasler', 'Kingambit', 'Charizard', 'Garchomp', 'Mega Garchomp',
         'Mega Charizard X', 'Mega Charizard Y', 'Mega Gengar', 'Mega Tyranitar',
         'Aegislash Shield Forme', 'Vivillon Icy Snow Pattern']


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0),
        functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                page = browser.new_page(viewport={'width': 1440, 'height': 900})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                response = page.goto(f'http://127.0.0.1:{server.server_port}', wait_until='domcontentloaded')
                assert response.status == 200
                page.wait_for_selector('.move-row')
                page.evaluate('window.PokelatorTutorial?.close()')
                results = page.evaluate('''async names => Promise.all([
                  ...names.map(name=>({name,src:getPokemonImage(name)})),
                  ...Object.values(ITEM_HINTS).map(item=>({name:item.name,src:item.image}))
                ].map(async ({name,src}) => {
                  const image = new Image();
                  const loaded = await new Promise(resolve => {
                    const timer = setTimeout(() => resolve(false),15000);
                    image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth > 0); };
                    image.onerror = () => { clearTimeout(timer); resolve(false); };
                    image.src = src;
                  });
                  return {name, src, loaded, width: image.naturalWidth, height: image.naturalHeight};
                }))''', NAMES)
                for result in results:
                    print(('PASS' if result['loaded'] else 'FAIL'),result['name'],result['src'],
                          f"{result['width']}x{result['height']}")
                assert all(r['loaded'] for r in results), 'Some Champions images failed to load'
                assert not errors, errors
                page.screenshot(path='/tmp/pokelator-reviewed.png',full_page=True)
                page.locator('[data-damage-direction="incoming"]').click()
                page.screenshot(path='/tmp/pokelator-incoming.png',full_page=True)
                page.locator('.opponent-row .item-hint').filter(has=page.locator('img[alt="Life Orb"]')).hover()
                page.screenshot(path='/tmp/pokelator-item-tooltip.png',full_page=True)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == '__main__':
    main()
