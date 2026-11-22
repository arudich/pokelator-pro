import unittest
import test_app as app_tests


class PokemonFilterTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_moves_and_abilities_or_and_net_type_resistance(self):
        self.load()
        result=self.evaluate("""() => {
          const f=teamPokemonFilters;
          const sample={name:'Test',learnset:['Protect','Surf','Ice Beam','Rain Dance'],abilities:['Drizzle'],types:['Water','Ground']};
          f.moves=['Protect','Surf','Ice Beam','Rain Dance'];f.abilities=['Intimidate','Drizzle'];f.types=['Water','Ground'];f.resists=['Electric','Fire'];
          const all=f.matches(sample);f.moves.push('Flamethrower');const missingMove=f.matches(sample);f.moves.pop();
          f.resists.push('Grass');const weakness=f.matches(sample);f.resists=[];
          f.abilities=['Intimidate'];const missingAbility=f.matches(sample);
          return {all,missingMove,weakness,missingAbility};
        }""")
        self.assertEqual(result,{'all':True,'missingMove':False,'weakness':False,'missingAbility':False})

    def test_panel_limits_sort_values_and_results_without_typing(self):
        self.load()
        self.page.locator('#teamPokemonInput').locator('..').locator('.pokemon-filter-toggle').click()
        panel=self.page.locator('#teamPokemonInputFilters')
        panel.locator('[data-filter-section=moves]>summary').click()
        for name in ['Protect','Surf','Ice Beam','Rain Dance']:
            move=panel.locator('[data-filter-search=moves]')
            move.fill(name)
            self.page.locator('#searchResults [role=option]').filter(has=self.page.locator('strong',has_text=name)).first.click()
        self.assertTrue(panel.locator('[data-filter-search=moves]').is_disabled())
        panel.locator('[data-filter-section=types]>summary').click()
        panel.locator('[data-filter-type=types][data-type=Water]').click()
        panel.locator('[data-filter-type=types][data-type=Ground]').click()
        self.assertEqual(panel.locator('[data-filter-type=types][data-type=Fire]').count(),0)
        panel.locator('[data-filter-section=sort]>summary').click()
        panel.locator('[data-filter-sort=spe]').click()
        panel.locator('[data-filter-apply]').click()
        choices=self.page.locator('#searchResults .search-item')
        self.assertGreater(choices.count(),0)
        self.assertIn('SPE ',choices.first.inner_text())
        result=self.evaluate("""() => {const rows=buildTeamSearchResults('');return {valid:rows.every(p=>teamPokemonFilters.matches(p)),values:rows.filter(p=>!p.savedBuild).map(p=>p.pickerSortValue)}}""")
        self.assertTrue(result['valid'])
        self.assertEqual(result['values'],sorted(result['values'],reverse=True))
        self.assertFalse(self.errors)

    def test_opponent_filters_are_independent_and_reference_search_unfiltered(self):
        self.load()
        result=self.evaluate("""() => {
          opponentPokemonFilters.types=['Fire'];opponentPokemonFilters.sort='atk';
          const filtered=buildSearchResults('',false,opponentPokemonFilters);
          return {count:filtered.length,fire:filtered.every(p=>p.types.includes('Fire')),value:filtered[0].pickerSortValue,
            stat:filtered[0].stats.atk-20,team:teamPokemonFilters.active,
            reference:buildSearchResults('Garchomp',true).some(p=>p.name==='Garchomp')};
        }""")
        self.assertGreater(result['count'],0)
        self.assertTrue(result['fire'])
        self.assertEqual(result['value'],result['stat'])
        self.assertFalse(result['team'])
        self.assertTrue(result['reference'])

    def test_super_effective_stab_includes_learnable_protean_moves(self):
        self.load()
        result=self.evaluate("""() => {
          const f=teamPokemonFilters;
          const make=(types,abilities,learnset)=>({types,abilities,learnset});
          const protean=make(['Normal'],['Protean'],['Ice Beam','Thunder Wave']);
          const libero=make(['Normal'],['Libero'],['Ice Beam']);
          const ordinary=make(['Normal'],['Pressure'],['Ice Beam']);
          const water=make(['Water'],['Torrent'],['Surf']);
          f.stabTargets=['Dragon'];
          const answers=[protean,libero,ordinary,water].map(p=>f.matches(p));
          f.stabTargets=['Water'];const statusOnly=f.matches(protean);
          f.stabTargets=['Dragon','Ground'];const multiple=f.matches(protean);
          f.catalog=[protean,ordinary,water];f.stabTargets=['Dragon'];f.render();f.panel.hidden=false;
          const panel=f.panel;
          return {answers,statusOnly,multiple,
            hidden:!panel.querySelector('[data-filter-type="stabTargets"][data-type="Water"]'),
            selected:panel.querySelector('[data-filter-type="stabTargets"][data-type="Dragon"]').getAttribute('aria-pressed'),
            rejected:!f.change('stabTargets',['Dragon','Water'])};
        }""")
        self.assertEqual(result,{'answers':[True,True,False,False],'statusOnly':False,'multiple':True,
                                 'hidden':True,'selected':'true','rejected':True})
        self.page.locator('#teamPokemonInputFilters [data-filter-reset]').click()
        self.assertEqual(self.evaluate('teamPokemonFilters.stabTargets'),[])

    def test_filter_sequences_hide_dead_ends_and_protect_ability_removal(self):
        self.load()
        result=self.evaluate("""() => {
          const f=teamPokemonFilters;
          f.catalog=[
            {...getPokemonByName('Gyarados'),learnset:['Surf','Ice Beam'],types:['Water'],abilities:['Drizzle']},
            {...getPokemonByName('Charizard'),learnset:['Surf','Flamethrower'],types:['Fire'],abilities:['Flash Fire']}
          ];
          f.moves=['Surf'];f.abilities=['Drizzle','Flash Fire'];f.types=['Water'];f.resists=['Fire'];f.render();f.panel.hidden=false;
          const hidden=f.panel.querySelector('[data-filter-type="types"][data-type="Fire"]')===null
            && f.panel.querySelector('[data-filter-type="resists"][data-type="Grass"]')===null;
          const protectedRemoval=f.panel.querySelector('[data-remove-filter="abilities"][data-index="0"]').disabled;
          const rejected=!f.change('types',['Water','Fire']) && !f.change('abilities',['Flash Fire']);
          return {hidden,protectedRemoval,rejected,count:f.catalog.filter(p=>f.matches(p)).length};
        }""")
        self.assertEqual(result,{'hidden':True,'protectedRemoval':True,'rejected':True,'count':1})
        panel=self.page.locator('#teamPokemonInputFilters')
        panel.locator('[data-filter-section=moves]>summary').click()
        panel.locator('[data-filter-search=moves]').fill('Flamethrower')
        self.assertEqual(self.page.locator('#searchResults [role=option]').count(),0)
        panel.locator('[data-filter-search=moves]').fill('Ice Beam')
        self.assertEqual(self.page.locator('#searchResults [role=option]').count(),1)
        self.page.locator('#searchResults [role=option]').click()
        panel.locator('[data-filter-section=abilities]>summary').click()
        panel.locator('[data-filter-search=abilities]').fill('Flash Fire')
        self.assertEqual(self.page.locator('#searchResults [role=option]').count(),0)

    def test_filter_sections_start_collapsed_and_only_empty_sections_auto_close(self):
        self.load()
        self.page.locator('.pokemon-filter-toggle').first.click()
        panel=self.page.locator('#teamPokemonInputFilters')
        self.assertEqual(panel.locator('details[open]').count(),0)
        panel.locator('[data-filter-section=moves]>summary').click()
        panel.locator('[data-filter-section=types]>summary').click()
        self.assertEqual(panel.locator('details[open]').count(),1)
        self.assertFalse(panel.locator('[data-filter-search=moves]').is_visible())
        panel.locator('[data-filter-type=types][data-type=Water]').click()
        panel.locator('[data-filter-section=abilities]>summary').click()
        self.assertEqual(panel.locator('details[open]').count(),2)
        self.assertIn('Water',panel.locator('[data-filter-section=types]>summary').inner_text())
        panel.locator('[data-filter-section=resists]>summary').click()
        self.assertEqual(panel.locator('details[open]').count(),2)
        self.assertFalse(panel.locator('[data-filter-search=abilities]').is_visible())
        panel.locator('[data-filter-close]').click()
        self.assertTrue(panel.is_hidden())

    def test_protean_does_not_keep_dead_end_stab_type_options_available(self):
        self.load()
        result=self.evaluate("""() => {
          const f=teamPokemonFilters,base=getPokemonByName('Charizard');
          const fire={...base,types:['Fire'],abilities:['Blaze'],learnset:['Flamethrower']};
          const water={...base,types:['Water'],abilities:['Torrent'],learnset:['Surf']};
          const protean={...base,types:['Normal'],abilities:['Protean'],learnset:['Flamethrower','Surf']};
          f.catalog=[fire,water,protean];
          const first=f.change('stabTargets',['Grass']);
          f.render();
          const included=f.matches(protean);
          const hidden=!f.panel.querySelector('[data-filter-type="stabTargets"][data-type="Ground"]');
          const blocked=!f.change('stabTargets',['Grass','Ground']);
          const compatible=f.change('stabTargets',['Grass','Ice']);
          return {first,included,hidden,blocked,compatible,selected:f.stabTargets};
        }""")
        self.assertEqual(result,{'first':True,'included':True,'hidden':True,'blocked':True,
                                 'compatible':True,'selected':['Grass','Ice']})
