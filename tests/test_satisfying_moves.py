import unittest
import test_app as app_tests


class SatisfyingMoveTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_usage_selects_one_distinct_move_per_filter(self):
        self.load()
        result=self.evaluate("""() => {
          const species={name:'Test',types:['Fire'],abilities:['Blaze'],learnset:['Swords Dance','Bulk Up','Fire Punch','Flare Blitz','Protect','Close Combat']};
          const usage={abilities:[{name:'Blaze',percent:100}],moves:[['Swords Dance',90],['Bulk Up',10],['Fire Punch',80],['Flare Blitz',20],['Protect',95],['Close Combat',85]].map(([name,percent])=>({name,percent}))};
          const filters={moves:[],moveQueries:[{selfBoost:'atk'},{type:'Fire',category:'Physical',minPower:75}],abilities:[]};
          const options={moveMeta:Battle.moveMeta,priorityChoices:()=>[]};
          const chosen=SatisfyingMoves.build(species,filters,usage,options);
          const overlap=SatisfyingMoves.build(species,{...filters,moveQueries:[{type:'Fire'},{type:'Fire',category:'Physical'}]},usage,options);
          const pinned=SatisfyingMoves.build(species,{...filters,moves:['Flare Blitz']},usage,options);
          const reversed=SatisfyingMoves.build(species,{...filters,moveQueries:filters.moveQueries.slice().reverse()},usage,options);
          return {chosen,overlap,pinned,reversed};
        }""")
        self.assertEqual(result['chosen']['moveSet'],['Swords Dance','Fire Punch'])
        self.assertEqual(result['chosen']['ability'],'Blaze')
        self.assertEqual(result['overlap']['moveSet'],['Fire Punch','Flare Blitz'])
        self.assertEqual(result['reversed']['moveSet'],['Fire Punch','Swords Dance'])
        self.assertIn('Flare Blitz',result['pinned']['moveSet'])
        self.assertEqual(result['pinned']['moveSet'],['Flare Blitz','Swords Dance','Fire Punch'])

    def test_overlapping_filters_need_distinct_moves_and_priority_excludes_status(self):
        self.load()
        result=self.evaluate("""() => {
          const species={id:'test',name:'Test',types:['Fire'],abilities:['Blaze'],learnset:['Flare Blitz']};
          const options={moveMeta:Battle.moveMeta,priorityChoices:()=>[]};
          const lone=SatisfyingMoves.build(species,{moves:[],moveQueries:[{type:'Fire'},{category:'Physical'}],abilities:[]},null,options);
          const f=teamPokemonFilters;f.priorityRequired=true;
          const volcarona=getPokemonByName('Volcarona'),armarouge=getPokemonByName('Armarouge');
          return {lone,rage:Battle.moveMeta('Rage Powder').category,wide:Battle.moveMeta('Wide Guard').category,
            volcarona:f.matches(volcarona),armarouge:f.matches(armarouge),
            priority:priorityChoices(volcarona,f).map(m=>m.name),
            markup:pokemonChoiceMarkup({...volcarona,priorityOptions:[{name:'Rage Powder',percent:46.3}]})};
        }""")
        self.assertIsNone(result['lone'])
        self.assertEqual(result['rage'],'Status')
        self.assertEqual(result['wide'],'Status')
        self.assertFalse(result['volcarona'])
        self.assertFalse(result['armarouge'])
        self.assertNotIn('Rage Powder',result['priority'])
        self.assertNotIn('46.3',result['markup'])

    def test_filters_reject_five_slot_sets_and_inconsistent_abilities(self):
        self.load()
        result=self.evaluate("""() => {
          const s={name:'Test',types:['Water'],abilities:['Protean','Gale Wings'],learnset:['Brave Bird','Flamethrower','Protect','Surf','Quick Attack']};
          const options={moveMeta:Battle.moveMeta,priorityChoices:(species,f)=>f.abilities.includes('Gale Wings') ? [{name:'Brave Bird'},{name:'Quick Attack'}] : [{name:'Quick Attack'}]};
          const joint=SatisfyingMoves.build(s,{moves:[],moveQueries:[{type:'Fire',stab:true},{type:'Flying',priority:'positive'}],abilities:[]},null,options);
          const impossible=SatisfyingMoves.build(s,{moves:['Brave Bird','Flamethrower','Protect','Surf'],moveQueries:[],abilities:['Protean'],priorityRequired:true},null,options);
          return {joint,impossible};
        }""")
        self.assertIsNone(result['joint'])
        self.assertIsNone(result['impossible'])

    def test_preview_matches_selected_and_persisted_moves(self):
        self.load()
        expected=self.evaluate("""() => {
          const f=teamPokemonFilters;f.change('moveQueries',[{selfBoost:'atk'},{type:'Fire',category:'Physical',minPower:75}]);
          return buildTeamSearchResults('Sneasler').find(s=>!s.savedBuild).satisfyingSet;
        }""")
        field=self.page.locator('#teamPokemonInput');field.fill('Sneasler')
        row=self.page.locator('#searchResults .search-item').filter(has=self.page.locator('strong',has_text='Sneasler')).first
        for name in expected['moveSet']:
            self.assertIn(name,row.locator('.satisfying-moves').inner_text())
        row.click()
        actual=self.evaluate("({moves:state.ourTeam.at(-1).moveSet,ability:state.ourTeam.at(-1).ability})")
        self.assertEqual(actual,{'moves':expected['moveSet'],'ability':expected['ability']})
        self.page.reload();self.page.wait_for_selector('.team-row')
        self.assertEqual(self.evaluate('state.ourTeam.at(-1).moveSet'),expected['moveSet'])
        self.assertFalse(self.errors)

    def test_saved_builds_use_actual_moves_for_matching(self):
        self.load()
        result=self.evaluate("""() => {
          const s=getPokemonByName('Sneasler'),f=teamPokemonFilters;
          f.change('moveQueries',[{selfBoost:'atk'},{type:'Fire',category:'Physical',minPower:75}]);
          const set=f.satisfyingSet(s),wrong={...sanitizeTeamEntry({name:s.name}),moveSet:['Protect']};
          return {wrong:f.matchesBuild(s,wrong),right:f.matchesBuild(s,{...wrong,...set})};
        }""")
        self.assertFalse(result['wrong'])
        self.assertTrue(result['right'])
