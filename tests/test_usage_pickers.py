import unittest
import test_app as app_tests


class UsagePickerTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_picker_only_offers_moves_that_survive_saving_and_have_engine_metadata(self):
        self.load()
        result=self.evaluate("""() => {
          const unsupported=[];
          for(const species of pokerData) for(const move of buildMoveChoices(species)) {
            const saved=sanitizeTeamEntry({name:species.name,moveSet:[move.name]});
            if(!Battle.moveMeta(move.name) || saved.moveSet[0]!==move.name) unsupported.push([species.name,move.name]);
          }
          const rotom=getPokemonByName('Rotom Wash');
          return {unsupported,sourceRetainsMove:rotom.learnset.includes('Thunder Shock'),
            offered:buildMoveChoices(rotom,'Thunder Shock').map(move=>move.name)};
        }""")
        self.assertEqual(result['unsupported'],[])
        self.assertTrue(result['sourceRetainsMove'])
        self.assertEqual(result['offered'],[])

    def test_pokemon_results_usage_stats_and_click_add(self):
        self.load()
        self.assertFalse(self.page.locator('#searchResults').is_visible())

        field=self.page.locator('#teamPokemonInput')
        field.fill('char')
        expected=self.evaluate("buildTeamSearchResults('char').map(p=>p.name)")
        names=self.page.locator('#searchResults .choice-heading strong').all_text_contents()
        self.assertEqual(names,expected)
        self.assertGreater(len(names),1)
        self.assertEqual(self.page.locator('#searchResults .search-item').first.locator('.base-stat').count(),6)
        self.assertIn('%',self.page.locator('#searchResults .choice-heading small').first.inner_text())
        self.assertTrue(self.evaluate("(() => {const x=buildSearchResults('char').map(p=>pokemonUsageReference(p)?.percent ?? -1);return x.every((n,i)=>!i || x[i-1]>=n)})()"))
        self.page.locator('#searchResults .search-item').first.click()
        self.assertEqual(self.evaluate('state.ourTeam[state.activeOurIndex].name'),expected[0])
        self.assertFalse(self.evaluate("document.getElementById('searchResults').matches(':popover-open')"))
        self.assertFalse(self.page.locator('#searchResults').is_visible())

    def test_champions_move_types_are_used_in_picker_and_damage_metadata(self):
        self.load()
        self.evaluate("state.ourTeam=[sanitizeTeamEntry({name:'Abomasnow'})];state.activeOurIndex=0;render()")
        self.page.locator('.set-editor summary').click()
        self.page.locator('[data-set-field=move-0]').fill('grass')
        choice=self.page.locator('#searchResults .move-choice').filter(has_text='Growth')
        self.assertEqual(choice.count(),1)
        self.assertIn('Grass · Status',choice.inner_text())
        self.assertEqual(self.evaluate("Battle.moveMeta('Growth').type"),'Grass')
        self.assertEqual(self.evaluate("Battle.moveMeta('Snap Trap').type"),'Steel')

    def test_move_focus_shows_common_type_and_name_filter_and_saves(self):
        self.load()
        self.evaluate("""() => {
          const species=pokerData.find(p=>!p.isMega && p.learnset.includes('Mystical Fire') && p.learnset.some(name=>!name.toLowerCase().includes('fire') && Battle.moveMeta(name)?.type==='Fire'));
          state.ourTeam=[sanitizeTeamEntry({name:species.name})];state.activeOurIndex=0;render();
        }""")
        self.page.locator('.set-editor summary').click()
        field=self.page.locator('[data-set-field=move-0]')
        field.focus()
        expected=self.evaluate('buildMoveChoices(getPokemonByName(state.ourTeam[0].name)).map(m=>m.name)')
        self.assertEqual(self.page.locator('#searchResults .choice-heading strong').all_text_contents(),expected)
        field.fill('fire')
        filtered=self.page.locator('#searchResults .choice-heading strong').all_text_contents()
        self.assertIn('Mystical Fire',filtered)
        self.assertEqual(filtered,self.evaluate("buildMoveChoices(getPokemonByName(state.ourTeam[0].name),'fire').map(m=>m.name)"))
        self.assertTrue(self.evaluate("buildMoveChoices(getPokemonByName(state.ourTeam[0].name),'fire').some(m=>!m.name.toLowerCase().includes('fire') && m.type==='Fire')"))
        self.page.locator('#searchResults .move-choice').filter(has_text='Mystical Fire').click()
        self.assertEqual(self.evaluate('state.ourTeam[0].moveSet[0]'),'Mystical Fire')
        self.page.reload()
        self.assertEqual(self.evaluate('state.ourTeam[0].moveSet[0]'),'Mystical Fire')

    def test_builder_pokemon_and_move_autocomplete_are_visible(self):
        self.load()
        self.page.locator('#teamBuilderButton').click()
        field=self.page.locator('#teamPokemonInput')
        field.fill('char')
        self.assertTrue(self.page.locator('#searchResults').is_visible())
        self.assertTrue(self.page.locator('#searchResults .search-item').first.is_visible())
        self.assertEqual(self.page.locator('#searchResults .search-item').first.locator('.base-stat').count(),6)
        self.page.locator('#searchResults .search-item').first.click()
        self.assertEqual(self.evaluate('state.view'),'builder')
        self.assertTrue(self.page.locator('.set-editor').get_attribute('open') is not None)
        move=self.page.locator('[data-set-field=move-0]')
        move.focus()
        self.assertTrue(self.page.locator('#searchResults .move-choice').first.is_visible())
        move.fill('fire')
        self.assertTrue(self.page.locator('#searchResults .move-choice').first.is_visible())
        expected=self.page.locator('#searchResults .choice-heading strong').first.inner_text()
        move.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[state.activeOurIndex].moveSet[0]'),expected)

    def test_new_team_build_uses_current_format_usage_and_keeps_existing_builds(self):
        self.load()
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        for format in ['Doubles','Singles']:
            self.page.locator(f'[data-format="{format}"]').click()
            self.evaluate("addTeamPokemon('Kingambit')")
            result=self.evaluate("""() => {
              const entry=state.ourTeam.at(-1),usage=getUsage(getPokemonByName('Kingambit'));
              return {actual:entry.investment,expected:usage.spreads[0].investment,nature:entry.nature.name,expectedNature:usage.natures[0].name};
            }""")
            self.assertEqual(result['actual'],result['expected'])
            self.assertEqual(result['nature'],result['expectedNature'])
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam.slice(0,3))'),before)
        builds=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.reload()
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),builds)
        fallback=self.evaluate("popularTeamBuild({...getPokemonByName('Gardevoir'),usage:{}})")
        self.assertEqual(fallback['nature'],'Modest')
        self.assertEqual(sum(fallback['investment'].values()),66)
        self.assertTrue(all(0<=n<=32 for n in fallback['investment'].values()))
