import json
import unittest
from pathlib import Path
import test_app as app_tests


class BuilderTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def library(self):
        self.page.locator('#teamLibraryPanel summary').click()

    def assert_centered(self):
        # Center when possible, stopping naturally at the content's first/last tier.
        self.page.wait_for_function("""() => {
          const row=document.getElementById('builderSpeedTie').getBoundingClientRect();
          const list=document.getElementById('builderSpeedTiers');
          const box=list.getBoundingClientRect();
          const ideal=list.scrollTop+row.top+row.height/2-box.top-list.clientHeight/2;
          const possible=Math.max(0,Math.min(ideal,list.scrollHeight-list.clientHeight));
          return Math.abs(list.scrollTop-possible)<2;
        }""")

    def test_named_library_migrates_autosaves_and_keeps_teams_independent(self):
        self.load(); self.library()
        original=self.evaluate('JSON.stringify(state.ourTeam)')
        first=self.evaluate('state.activeTeamId')
        self.page.locator('#teamNameInput').fill('Sand squad')
        self.page.locator('#teamNameInput').press('Enter')
        self.page.locator('#duplicateTeamButton').click()
        self.page.locator('#teamNameInput').fill('Rain squad')
        self.page.locator('#teamNameInput').press('Enter')
        hp=self.page.locator('.expanded-team input[data-stat="hp"]')
        hp.fill('0'); hp.press('Enter')
        self.assertEqual(original,self.evaluate('JSON.stringify(state.teamLibrary[0].pokemon)'))
        self.page.locator('#newTeamButton').click()
        self.assertEqual(self.page.locator('.team-row').count(),0)
        self.assertTrue(self.page.locator('#attackerStageControl input').first.is_disabled())
        self.page.locator('#teamNameInput').fill('Dragon project')
        self.page.locator('#teamNameInput').press('Enter')
        self.page.locator('#teamPokemonInput').fill('Garchomp')
        self.page.locator('#addTeamButton').click()
        speed=self.page.locator('input[data-stat="spe"]')
        speed.fill('20');speed.press('Enter')
        third=self.evaluate('state.activeTeamId')
        self.page.locator('#teamLibrarySelect').select_option(first)
        self.assertEqual(original,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.page.reload();self.library()
        self.assertEqual(self.page.locator('#teamLibrarySelect option').count(),3)
        self.page.locator('#teamLibrarySelect').select_option(third)
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.spe'),20)
        self.assertEqual(self.page.locator('#teamNameInput').input_value(),'Dragon project')
        self.page.locator('#deleteTeamButton').click()
        self.assertEqual(self.page.locator('#teamLibrarySelect option').count(),2)
        self.page.locator('#undoTeamDeleteButton').click()
        self.assertEqual(self.page.locator('#teamLibrarySelect option').count(),3)
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.spe'),20)

    def test_team_and_library_files_roundtrip_through_download_and_import(self):
        self.load();self.library()
        self.page.locator('#teamNameInput').fill('Équipe 🚀')
        self.page.locator('#teamNameInput').press('Enter')
        before=self.evaluate('TeamFiles.pack([state.teamLibrary[0]],true)')
        with self.page.expect_download() as download:
            self.page.locator('#exportTeamButton').click()
        content=Path(download.value.path()).read_bytes()
        self.assertEqual(json.loads(content),before)
        self.page.locator('#teamImportInput').set_input_files({'name':'team.json','mimeType':'application/json','buffer':content})
        self.page.wait_for_function('state.teamLibrary.length===2')
        self.assertEqual(self.evaluate('TeamFiles.pack([state.teamLibrary[1]]).teams[0].pokemon'),before['teams'][0]['pokemon'])
        self.assertEqual(self.page.locator('#teamNameInput').input_value(),'Équipe 🚀 (2)')
        with self.page.expect_download() as download:
            self.page.locator('#exportLibraryButton').click()
        collection=Path(download.value.path()).read_bytes()
        self.assertEqual(len(json.loads(collection)['teams']),2)
        self.page.locator('#teamImportInput').set_input_files({'name':'all.json','mimeType':'application/json','buffer':collection})
        self.page.wait_for_function('state.teamLibrary.length===4')
        self.assertEqual(self.evaluate('state.teamLibrary[0].name'),'Équipe 🚀')

    def test_invalid_import_is_atomic_and_names_are_escaped(self):
        self.load();self.library()
        before=self.evaluate('JSON.stringify(state.teamLibrary)')
        packet=self.evaluate('TeamFiles.pack([state.teamLibrary[0],state.teamLibrary[0]])')
        packet['teams'][1]['pokemon'][0]['investment']['spe']=99
        self.page.locator('#teamImportInput').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(packet).encode()})
        self.page.wait_for_function("document.getElementById('libraryStatus').textContent.includes('Import failed')")
        self.assertEqual(before,self.evaluate('JSON.stringify(state.teamLibrary)'))
        for invalid in ['moves','nature','version']:
            packet=self.evaluate('TeamFiles.pack([state.teamLibrary[0]])')
            if invalid=='moves':
                packet['teams'][0]['pokemon'][0]['moveSet']=['Unknown move']*4
            elif invalid=='nature':
                packet['teams'][0]['pokemon'][0]['nature']={'name':'Unknown nature'}
            else:
                packet['version']=2
            self.page.locator('#teamImportInput').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(packet).encode()})
            self.page.wait_for_function("document.getElementById('teamImportInput').value==='' ")
            self.assertEqual(before,self.evaluate('JSON.stringify(state.teamLibrary)'))
        packet=self.evaluate('TeamFiles.pack([state.teamLibrary[0]])')
        packet['teams'][0]['name']='"><img src=x onerror="window.injected=true">'
        self.page.locator('#teamImportInput').set_input_files({'name':'name.json','mimeType':'application/json','buffer':json.dumps(packet).encode()})
        self.page.wait_for_function('state.teamLibrary.length===2')
        self.assertIsNone(self.evaluate('window.injected'))
        self.assertEqual(self.page.locator('img[src="x"]').count(),0)

    def test_shared_snapshot_opens_in_another_browser_and_does_not_repeat_on_reload(self):
        self.load();self.library()
        self.page.locator('#teamNameInput').fill('Équipe ☀')
        self.page.locator('#teamNameInput').press('Enter')
        self.page.locator('#copyTeamLinkButton').click()
        link=self.page.locator('#teamShareLink').input_value()
        self.assertIn('#team=',link)
        expected=self.evaluate('TeamFiles.pack([state.teamLibrary[0]]).teams[0].pokemon')
        context=self.browser.new_context()
        context.route('https://**/*',lambda route:route.abort())
        try:
            page=context.new_page();page.on('pageerror',lambda error:self.errors.append(str(error)))
            page.goto(link)
            page.wait_for_function('state.teamLibrary.length===2')
            self.assertEqual(page.evaluate('TeamFiles.pack([state.teamLibrary[1]]).teams[0].pokemon'),expected)
            self.assertEqual(page.evaluate('location.hash'),'')
            page.reload()
            self.assertEqual(page.evaluate('state.teamLibrary.length'),2)
            self.assertEqual(page.locator('#activeTeamName').inner_text(),'Équipe ☀')
            page.goto(self.url+'/#team=not-valid-json')
            self.assertIn('Could not open',page.locator('#libraryStatus').inner_text())
            self.assertEqual(page.evaluate('state.teamLibrary.length'),2)
        finally:
            context.close()

    def test_library_still_works_in_memory_and_exports_if_storage_is_blocked(self):
        self.context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('Blocked')}})")
        self.load();self.library()
        self.page.locator('#duplicateTeamButton').click()
        self.assertEqual(self.evaluate('state.teamLibrary.length'),2)
        self.assertIn('Storage unavailable',self.page.locator('#storageStatus').inner_text())
        with self.page.expect_download() as download:
            self.page.locator('#exportLibraryButton').click()
        self.assertEqual(len(json.loads(Path(download.value.path()).read_text())['teams']),2)

    def test_builder_group_boundaries_and_base_matches_are_exact(self):
        self.load()
        result=self.evaluate("""() => {
          const speeds=[101,100,99,85,69,68,59];
          const roster=speeds.map((spe,i)=>({id:String(i),name:String(i),stats:{spe}}));
          return Battle.builderSpeedGroups(roster,roster[1],{investment:{spe:0},item:'',nature:null});
        }""")
        groups={group['kind']:group['members'] for group in result['groups']}
        self.assertEqual([r['species']['stats']['spe'] for r in groups['always-faster']],[101])
        self.assertEqual([r['tier']['points'] for r in groups['high-investment']],[16,32])
        self.assertEqual([r['species']['stats']['spe'] for r in groups['nature']],[68])
        self.assertEqual([r['species']['stats']['spe'] for r in groups['max-speed-tie']],[59])
        self.assertTrue(next(r for r in groups['low-investment'] if r['species']['stats']['spe']==100)['tie'])

    def test_builder_lists_every_form_in_speed_order_and_centers_base_tie(self):
        self.load()
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.locator('#teamBuilderButton').click();self.assert_centered()
        self.page.locator('#builderTopN').fill(str(self.evaluate('builderRankLimit()')))
        self.page.locator('#builderTopN').press('Enter');self.assert_centered()
        self.assertTrue(self.page.locator('.battle-panel').is_hidden())
        self.assertTrue(self.page.locator('.opponent-panel').is_hidden())
        self.assertEqual(self.page.locator('.tier-pokemon').count(),self.evaluate('pokerData.length'))
        speeds=self.page.locator('.tier-pokemon').evaluate_all('(rows)=>rows.map(row=>getPokemonByName(row.dataset.tierSpecies).stats.spe)')
        self.assertEqual(speeds,sorted(speeds,reverse=True))
        self.assertEqual(before,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.page.locator('.team-row[data-team-index="2"]').click();self.assert_centered()
        expected=self.evaluate("pokerData.filter(p=>p.stats.spe===getPokemonByName('Garchomp').stats.spe).map(p=>p.id).sort()")
        tied=self.page.locator('#builderSpeedTie .tier-pokemon').evaluate_all('(rows)=>rows.map(r=>r.dataset.tierSpecies).sort()')
        self.assertEqual(tied,expected)
        speed=self.page.locator('input[data-stat="spe"]');speed.fill('0');speed.press('Enter')
        self.assert_centered()
        self.assertIn('Speed 134',self.page.locator('#builderSelectedSummary').inner_text())
        self.assertEqual(tied,self.page.locator('#builderSpeedTie .tier-pokemon').evaluate_all('(rows)=>rows.map(r=>r.dataset.tierSpecies).sort()'))
        self.page.locator('[data-field="item"]').fill('Choice Scarf')
        self.page.locator('[data-field="item"]').press('Tab');self.assert_centered()
        self.assertIn('Speed 201',self.page.locator('#builderSelectedSummary').inner_text())
        self.page.locator('#battleViewButton').click()
        self.assertFalse(self.page.locator('.battle-panel').is_hidden())
        self.assertTrue(self.page.locator('#teamBuilderPanel').is_hidden())

    def test_builder_top100_filter_is_editable_persisted_and_keeps_base_matches(self):
        self.load();self.page.locator('#teamBuilderButton').click();self.assert_centered()
        field=self.page.locator('#builderTopN')
        self.assertEqual(field.input_value(),'100')
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        def assert_usage_cutoff(limit):
            expected=self.evaluate("""limit => {
              const speed=getPokemonByName(state.ourTeam[state.activeOurIndex].name).stats.spe;
              return pokerData.filter(p=>p.stats.spe===speed ||
                (Number.isInteger(p.usage?.Doubles?.rank) && p.usage.Doubles.rank<=limit)).map(p=>p.id).sort();
            }""",limit)
            actual=self.page.locator('.tier-pokemon').evaluate_all('(rows)=>rows.map(r=>r.dataset.tierSpecies).sort()')
            self.assertEqual(actual,expected)
        assert_usage_cutoff(100)
        self.assertLess(self.page.locator('.tier-pokemon').count(),self.evaluate('pokerData.length'))
        tile=self.page.locator('.tier-pokemon').first
        self.assertEqual(tile.bounding_box()['width'],94.5)
        self.assertEqual(tile.locator('img').bounding_box()['width'],85.5)
        field.fill('50');field.press('Enter');self.assert_centered()
        assert_usage_cutoff(50)
        self.assertEqual(self.page.locator('#builderSpeedTie [data-tier-species="Sceptile"]').count(),1)
        self.assertEqual(before,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.page.reload();self.page.locator('#teamBuilderButton').click()
        self.assertEqual(field.input_value(),'50')
        field.fill('not a number');field.press('Enter')
        self.assertEqual(field.input_value(),'50')
        field.fill('9999');field.press('Enter')
        self.assertEqual(int(field.input_value()),self.evaluate('builderRankLimit()'))
        field.fill('0');field.press('Enter');self.assert_centered()
        self.assertEqual(field.input_value(),'1')
        self.assertEqual(self.page.locator('#builderSpeedTie [data-tier-species="Sneasler"]').count(),1)

    def test_builder_usage_cutoff_uses_selected_format(self):
        self.load()
        self.evaluate("getPokemonByName('Rillaboom').usage.Doubles.rank=1;getPokemonByName('Rillaboom').usage.Singles.rank=11")
        self.page.locator('#teamBuilderButton').click()
        field=self.page.locator('#builderTopN');field.fill('10');field.press('Enter')
        self.assertEqual(self.page.locator('[data-tier-species="Rillaboom"]').count(),1)
        self.page.locator('#battleViewButton').click()
        self.page.locator('[data-format="Singles"]').click()
        self.page.locator('#teamBuilderButton').click();self.assert_centered()
        self.assertIn('Singles',self.page.locator('#builderUsageFormat').inner_text())
        self.assertEqual(field.input_value(),'10')
        self.assertEqual(self.page.locator('[data-tier-species="Rillaboom"]').count(),0)
        self.assertEqual(self.page.locator('#builderSpeedTie [data-tier-species="Sneasler"]').count(),1)

    def test_builder_has_no_scroll_spacers_and_middle_icons_wrap_together(self):
        self.load();self.evaluate('state.builderTopN=builderRankLimit()')
        self.page.locator('#teamBuilderButton').click();self.assert_centered()
        self.assertEqual(self.page.locator('.tier-scroll-pad, .builder-base-tier').count(),0)
        middle=self.page.locator('.builder-tier-group:not([data-speed-group^="always-"])')
        self.assertGreater(middle.count(),0)
        for group in middle.all():
            self.assertEqual(group.locator('.tier-icon-cloud').count(),1)
        icon=self.page.locator('[data-speed-group="high-investment"] .tier-pokemon').first
        self.assertIn('Needs',icon.get_attribute('title'))
        self.assertIn('Speed SP to outspeed us',icon.get_attribute('title'))
        self.page.locator('#builderSpeedTiers').evaluate('(el)=>el.scrollTop=0')
        top_gap=self.evaluate("""() => {
          const list=document.getElementById('builderSpeedTiers');
          return list.firstElementChild.getBoundingClientRect().top-list.getBoundingClientRect().top;
        }""")
        self.assertLess(abs(top_gap),2)

    def test_builder_centers_extreme_species_and_fits_phone(self):
        self.load();self.page.locator('#teamBuilderButton').click()
        for fastest in [True,False]:
            self.evaluate("""fastest => {
              const ordered=[...pokerData].sort((a,b)=>b.stats.spe-a.stats.spe);
              state.ourTeam=[sanitizeTeamEntry({name:(fastest?ordered[0]:ordered.at(-1)).name})];state.activeOurIndex=0;render();
            }""",fastest)
            self.assert_centered()
        self.page.set_viewport_size({'width':390,'height':844})
        self.assert_centered()
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        self.assertGreater(self.page.locator('#builderSpeedTiers').evaluate('(el)=>el.scrollHeight-el.clientHeight'),0)


if __name__ == '__main__':
    unittest.main()
