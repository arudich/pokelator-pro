import unittest
import test_app as app_tests


class PriorityFilterTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_priority_conditions_abilities_and_usage(self):
        self.load()
        result=self.evaluate("""() => {
          const species={learnset:['Protect','Quick Attack','Fake Out','Sucker Punch','Drain Punch','Brave Bird','Grassy Glide','Sky Attack','Fly'],abilities:['Triage','Gale Wings']};
          const usage={moves:[{name:'Quick Attack',percent:60},{name:'Fake Out',percent:10}]};
          const names=f=>PriorityMoves.choices(species,usage,{priorityConditional:true,...f}).map(m=>m.name);
          return {all:names({}),unconditional:names({priorityConditional:false}),common:names({priorityUsage:20}),
            special:names({priorityCategory:'Special'}),flying:names({priorityType:'Flying'}),
            noTriage:names({abilities:['Gale Wings']}),triage:PriorityMoves.choices(species,usage,{priorityConditional:true}).find(m=>m.name==='Drain Punch')};
        }""")
        self.assertNotIn('Protect',result['all'])
        self.assertNotIn('Sky Attack',result['all'])
        self.assertNotIn('Fly',result['all'])
        self.assertIn('Drain Punch',result['all'])
        self.assertIn('Brave Bird',result['all'])
        self.assertNotIn('Fake Out',result['unconditional'])
        self.assertNotIn('Grassy Glide',result['unconditional'])
        self.assertEqual(result['common'],['Quick Attack'])
        self.assertEqual(result['special'],[])
        self.assertEqual(result['flying'],['Brave Bird'])
        self.assertNotIn('Drain Punch',result['noTriage'])
        self.assertEqual(result['triage']['ability'],'Triage')

    def test_background_ranking_results_and_no_dead_end(self):
        self.load()
        self.evaluate("""() => {state.builderTopN=5;teamPokemonFilters.sort='priority';teamPokemonFilters.priorityConditional=false;}""")
        self.page.locator('#teamPokemonInput').focus()
        self.page.wait_for_function("priorityRankingCache.size>0",timeout=60000)
        result=self.evaluate("""() => {
          const f=teamPokemonFilters,rows=buildSearchResults('',false,f);
          return {scores:rows.map(r=>r.pickerSortValue),moves:rows.map(r=>r.priorityBest),
            empty:f.canChange('priorityType','Dragon'),text:document.getElementById('searchResults').innerText};
        }""")
        self.assertGreater(len(result['scores']),10)
        self.assertEqual(result['scores'],sorted(result['scores'],reverse=True))
        self.assertTrue(all(m and not m['condition'] for m in result['moves']))
        self.assertTrue(all(0<=score<=100 for score in result['scores']))
        self.assertFalse(result['empty'])
        self.assertIn('avg HP',result['text'])
        self.assertNotIn('Ranking…',result['text'])
        picker=self.page.locator('#searchResults')
        self.assertEqual(picker.locator('.picker-source-copy').inner_text(),'Priority Strength · Doubles')
        picker.get_by_role('button',name='Grid',exact=True).click()
        self.assertEqual(self.page.locator('#pokemonGridResults .picker-source-copy span').inner_text(),'Priority Strength · Doubles')
        self.assertFalse(self.errors)

    def test_priority_panel_and_existing_constraints(self):
        self.load()
        self.page.locator('#teamPokemonInput').locator('..').locator('.pokemon-filter-toggle').click()
        panel=self.page.locator('#teamPokemonInputFilters')
        panel.locator('[data-filter-section=priority]>summary').click()
        panel.locator('[data-priority-key=priorityRequired][data-priority-value=true]').click()
        panel.locator('[data-priority-key=priorityConditional][data-priority-value=false]').click()
        panel.locator('[data-filter-section=types]>summary').click()
        panel.locator('[data-filter-type=types][data-type=Water]').click()
        result=self.evaluate("""() => {const f=teamPokemonFilters,rows=f.apply(pokemonCatalog);return {n:rows.length,valid:rows.every(s=>s.types.includes('Water') && s.priorityOptions.every(m=>!m.condition)),empty:f.canChange('priorityType','Dragon')};}""")
        self.assertGreater(result['n'],0)
        self.assertTrue(result['valid'])
        self.assertFalse(result['empty'])
        self.assertFalse(self.errors)
