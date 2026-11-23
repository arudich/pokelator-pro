import unittest
import test_app as app_tests


class MoveFilterTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_effects_stab_and_hit_predicates(self):
        self.load()
        result=self.evaluate("""() => {
          const match=(name,q,s)=>MoveFilters.matches(Battle.moveMeta(name),q,s);
          return {dance:match('Swords Dance',{selfBoost:'atk'}),charm:match('Charm',{targetDrop:'atk'}),
            swagger:match('Swagger',{targetBoost:'atk',status:'confusion'}),flame:match('Flamethrower',{status:'brn',category:'Special'}),
            close:match('Close Combat',{selfDrop:'def'}),shell:match('Shell Smash',{selfBoost:'spe',selfDrop:'spd'}),
            belly:match('Belly Drum',{selfBoost:'atk'}),howl:match('Howl',{selfBoost:'atk',targetBoost:'atk'}),
            bomb:match('Population Bomb',{multihit:'yes',category:'Physical',minPower:20}),notBomb:match('Population Bomb',{minPower:75}),
            selfNotTarget:match('Swords Dance',{targetBoost:'atk'}),sucker:match('Sucker Punch',{priority:'positive'}),
            triage:match('Drain Punch',{priority:'positive'},{types:['Fairy'],ability:'Triage'}),
            stab:match('Flamethrower',{stab:true},{types:['Fire'],abilities:['Blaze']}),
            noStab:match('Flamethrower',{stab:true},{types:['Water'],abilities:['Torrent']}),
            protean:match('Flamethrower',{stab:true},{types:['Water'],ability:'Protean'}),
            sunny:match('Sunny Day',{extra:'weather'}),terrain:match('Psychic Terrain',{extra:'terrain'}),
            rest:match('Rest',{extra:'healing'}),sap:match('Strength Sap',{targetDrop:'atk',extra:'healing'})};
        }""")
        for key,value in result.items():
            self.assertEqual(value,key not in ['notBomb','selfNotTarget','noStab'],key)

    def test_compound_requirements_and_no_empty_intersections(self):
        self.load()
        result=self.evaluate("""() => {
          const f=teamPokemonFilters;
          const first=f.change('moveQueries',[{selfBoost:'atk'}]);
          const second=f.change('moveQueries',[{selfBoost:'atk'},{category:'Physical',type:'Fire',minPower:75}]);
          const rows=f.apply(pokemonCatalog);
          const witnesses=rows.every(s=>s.learnset.some(n=>MoveFilters.matches(Battle.moveMeta(n),{selfBoost:'atk'},s)) && s.learnset.some(n=>MoveFilters.matches(Battle.moveMeta(n),{category:'Physical',type:'Fire',minPower:75},s)));
          const before=JSON.stringify(f.moveQueries),rejected=!f.change('moveQueries',[...f.moveQueries,{category:'Status',minPower:300}]);
          const preserved=JSON.stringify(f.moveQueries)===before;
          f.moves=['Protect','Surf'];const tooMany=!f.change('moveQueries',[...f.moveQueries,{type:'Water'}]);
          return {first,second,n:rows.length,witnesses,rejected,preserved,tooMany};
        }""")
        self.assertGreater(result.pop('n'),0)
        self.assertTrue(all(result.values()),result)

    def test_power_bounds_follow_available_moves_and_allow_status_zero(self):
        self.load()
        result=self.evaluate("""() => {
          const moves=['Protect','Quick Attack','Fire Punch','Flare Blitz'].map(Battle.moveMeta);
          const picker=new MoveFilters.Picker({choices:()=>moves});
          const initial=picker.powerRange();picker.set('category','Physical');const physical=picker.powerRange();
          const tooHigh=!picker.set('minPower',physical.max+1),tooLow=!picker.set('maxPower',physical.min-1);
          picker.set('type','Fire');const fire=picker.powerRange();picker.set('minPower',100);const narrowed=picker.powerRange(true);
          picker.query={};const onlyStatus=picker.set('maxPower',0) && picker.available().every(m=>m.category==='Status');
          return {initial,physical,fire,narrowed,tooHigh,tooLow,onlyStatus};
        }""")
        self.assertEqual(result['initial'],{'min':0,'max':120})
        self.assertEqual(result['physical'],{'min':40,'max':120})
        self.assertEqual(result['fire'],{'min':75,'max':120})
        self.assertEqual(result['narrowed'],{'min':120,'max':120})
        self.assertTrue(result['tooHigh'] and result['tooLow'] and result['onlyStatus'])

    def test_constraints_share_a_single_species_and_ability(self):
        self.load()
        result=self.evaluate("""() => {
          const fire={id:'fire',name:'Fire',types:['Fire'],abilities:['Blaze'],learnset:['Swords Dance','Flare Blitz']};
          const water={id:'water',name:'Water',types:['Water'],abilities:['Torrent'],learnset:['Calm Mind','Surf']};
          const f=new PokemonFilters({catalog:[fire,water],generation:Battle.generation,moveMeta:Battle.moveMeta});
          f.types=['Water'];const rejected=!f.change('moveQueries',[{selfBoost:'atk'}]);
          f.types=[];f.change('moveQueries',[{selfBoost:'atk'},{type:'Fire',category:'Physical',minPower:75}]);
          const noWater=!f.canChange('types',['Water']),noTorrent=!f.canChange('abilities',['Torrent']);
          const accepts=f.matches(fire) && !f.matches(water);
          const mixed={id:'mixed',name:'Mixed',types:['Water'],abilities:['Protean','Gale Wings'],learnset:['Flamethrower','Brave Bird']};
          const joint=!f.queryMatches(mixed,[{stab:true,type:'Fire'},{priority:'positive',type:'Flying'}]);
          return {rejected,noWater,noTorrent,accepts,joint};
        }""")
        self.assertTrue(all(result.values()),result)

    def test_move_picker_controls_and_zero_result_guard(self):
        self.load()
        saved=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.locator('.expanded-team .set-editor summary').click()
        move=self.page.locator('.expanded-team [data-set-field="move-0"]')
        self.assertEqual(self.page.locator('.set-editor .move-filter-toggle').count(),0)
        move.focus()
        button=self.page.locator('#searchResults .move-filter-toggle')
        button.click()
        panel=self.page.locator('.move-filter-panel:popover-open')
        panel.locator('[data-move-filter=category][data-value=Physical]').click()
        field=panel.locator('[data-move-number=minPower]')
        original=field.input_value()
        maximum=int(field.get_attribute('max'))
        field.fill(str(maximum+1));field.press('Tab')
        self.assertIn('Choose power',panel.locator('.move-filter-feedback').inner_text())
        self.assertEqual(field.input_value(),original)
        panel.locator('[data-move-show]').click()
        self.assertGreater(self.page.locator('#searchResults .move-choice').count(),0)
        self.assertTrue(self.evaluate("[...document.querySelectorAll('#searchResults .move-choice strong')].every(n=>Battle.moveMeta(n.textContent).category==='Physical')"))
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),saved)
        self.page.set_viewport_size({'width':390,'height':844})
        move.click();button.click();panel=self.page.locator('.move-filter-panel:popover-open')
        panel.locator('[data-move-section=stats]>summary').click()
        box=panel.bounding_box()
        self.assertGreaterEqual(box['x'],0)
        self.assertLessEqual(box['x']+box['width'],390)
        self.assertLessEqual(box['y']+box['height'],844)
        self.assertFalse(self.errors)

    def test_requirements_can_be_added_through_pokemon_filter_ui(self):
        self.load()
        self.page.locator('#teamPokemonInput').locator('..').locator('.pokemon-filter-toggle').click()
        pokemon=self.page.locator('#teamPokemonInputFilters')
        pokemon.locator('[data-filter-section=moves]>summary').click()
        for criteria in [{'selfBoost':'atk'},{'category':'Physical','type':'Fire','minPower':75}]:
            pokemon.locator('.move-filter-toggle').click()
            panel=self.page.locator('.move-filter-panel:popover-open')
            for key,value in criteria.items():
                if key=='minPower':
                    panel.locator('[data-move-number=minPower]').fill(str(value));panel.locator('[data-move-number=minPower]').press('Tab')
                else:
                    if key=='selfBoost':panel.locator('[data-move-section=stats]>summary').click()
                    if key=='type':panel.locator('[data-move-section=type]>summary').click()
                    panel.locator(f'[data-move-filter={key}][data-value="{value}"]').click()
            panel.locator('[data-move-require]').click()
        self.assertEqual(pokemon.locator('.move-query-chip').count(),2)
        pokemon.locator('[data-filter-apply]').click()
        self.assertGreater(self.page.locator('#searchResults .search-item').count(),0)
        self.assertTrue(self.evaluate("buildTeamSearchResults('').every(s=>teamPokemonFilters.matches(s))"))
        self.assertFalse(self.errors)
