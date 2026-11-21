import base64
import hashlib
import io
import json
import re
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from build_site import build
from refresh_meta_usage import discover_formats,snapshot
from refresh_site_data import package
from validate_site_data import validate
import test_app as app_tests


class HostingTests(unittest.TestCase):
    def test_deploy_bundle_is_allowlisted_and_cache_versions_match(self):
        with tempfile.TemporaryDirectory() as directory:
            target=build(Path(directory)/'site')
            self.assertTrue((target/'index.html').is_file())
            self.assertTrue((target/'vendor/smogon-calc.min.js').is_file())
            self.assertTrue((target/'vendor/SMOGON-LICENSE').is_file())
            self.assertTrue((target/'_headers').is_file())
            for picture in ['overview','battle','builder','highlights']:
                self.assertTrue((target/'assets/tutorial'/f'{picture}.png').is_file())
            self.assertTrue((target/'components/tutorial.js').is_file())
            for icon in ['site-icon','favicon','apple-touch-icon']:
                self.assertTrue((target/'assets/branding'/f'{icon}.png').is_file())
            for name in ['.git','.env','.github','docs','scripts','tests','.venv']:
                self.assertFalse((target/name).exists(),name)
            versions=set()
            for path in [target/'index.html',*target.glob('*.js')]:
                versions.update(re.findall(r'\.js\?v=([a-f0-9]{16})',path.read_text()))
            self.assertEqual(len(versions),1)
            with self.assertRaises(ValueError):build(ROOT)
            unsafe=Path(directory)/'personal';unsafe.mkdir();(unsafe/'keep').write_text('mine')
            with self.assertRaises(ValueError):build(unsafe)
            self.assertEqual((unsafe/'keep').read_text(),'mine')

    def test_newest_complete_regulation_pair_is_selected(self):
        index=''.join(f'<a href="{name}-1630.txt">' for name in ['gen9championsvgc2026regmc','gen9championsbssregmc','gen9championsvgc2026regmd','gen9championsbssregmd','gen9championsvgc2026regme'])
        selected=discover_formats(index,1630)
        self.assertTrue(all(name.endswith('regmd') for name in selected.values()))
        def fetch(url):
            if url=='https://www.smogon.com/stats/':return b'<a href="2026-11/">'
            if url.endswith('/'):return index.encode()
            return ('Total battles: 100\n'+''.join(f' | {i} | Species{i} | 0.5% | 10 |\n' for i in range(1,101))).encode()
        data=snapshot(discover=True,fetcher=fetch)
        self.assertEqual(set(data['formats']),{'Singles','Doubles'})
        self.assertTrue(all(row['month']=='2026-11' for row in data['formats'].values()))

    def test_npm_integrity_and_archive_paths_are_checked(self):
        raw=io.BytesIO()
        with tarfile.open(fileobj=raw,mode='w:gz') as archive:
            member=tarfile.TarInfo('package/../../escape');member.size=1;archive.addfile(member,io.BytesIO(b'x'))
        blob=raw.getvalue()
        metadata={'version':'1.0.0','license':'MIT','dist':{'tarball':'https://registry.npmjs.org/test.tgz','integrity':'sha512-'+base64.b64encode(hashlib.sha512(blob).digest()).decode()}}
        with tempfile.TemporaryDirectory() as directory,patch('refresh_site_data.fetch',side_effect=[json.dumps(metadata).encode(),blob]):
            with self.assertRaisesRegex(ValueError,'Unsafe package'):package('test',Path(directory)/'package')
        metadata['dist']['integrity']='sha512-invalid'
        with tempfile.TemporaryDirectory() as directory,patch('refresh_site_data.fetch',side_effect=[json.dumps(metadata).encode(),blob]):
            with self.assertRaisesRegex(ValueError,'integrity'):package('test',Path(directory)/'package')

    def test_current_snapshot_integrity(self):validate()


class PackagedSiteTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown

    def test_built_site_loads_damage_and_builder(self):
        build()
        response=self.page.goto(self.url+'/dist/')
        self.assertEqual(response.status,200)
        self.page.wait_for_selector('.move-row')
        # Guard our Last Respects adapter against a future engine double-scaling it.
        damage=self.page.evaluate("""() => {
          const attacker=getPokemonByName('Basculegion'),defender=getPokemonByName('Mega Medicham');
          const ours=sanitizeTeamEntry({name:defender.name,nature:'Adamant',investment:{hp:30,atk:32,spd:4}});
          return [0,1,2,3].map(n=>Battle.incomingRange(attacker,defender,ours,'Last Respects',{
            format:'Doubles',opponentAbility:'Adaptability',boostOffenseNature:true,attackerAlliesFainted:n}).minDamage);
        }""")
        self.assertEqual(damage,[132,260,388,516])
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel=offense]').click()
        self.page.wait_for_selector('[data-offense-species]')
