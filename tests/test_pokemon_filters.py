import unittest
import test_app as app_tests
from playwright.sync_api import expect


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

    def test_opponent_search_has_voice_instead_of_filters(self):
        self.load()
        self.assertEqual(self.page.locator('.opponent-panel .pokemon-filter-toggle').count(),0)
        self.assertEqual(self.page.locator('#opponentVoiceButton').count(),1)
        self.assertEqual(self.page.locator('.our-team-panel .pokemon-filter-toggle').count(),1)
        self.assertTrue(self.evaluate("buildSearchResults('Garchomp',true).some(p=>p.name==='Garchomp')"))

    def test_empty_team_picker_shows_pokemon_in_popularity_order(self):
        self.load()
        search=self.page.locator('#teamPokemonInput')
        search.click()
        self.assertEqual(search.input_value(),'')
        choices=self.page.locator('#searchResults [role=option] .choice-heading strong')
        expected=self.evaluate("[...pokemonCatalog].filter(p=>pokemonUsageReference(p)?.rank).sort((a,b)=>pokemonUsageReference(a).rank-pokemonUsageReference(b).rank).slice(0,10).map(p=>pokemonUsageReference(p).rank)")
        shown=self.evaluate("activeUsagePicker.items.slice(0,10).map(p=>p.pickerSortValue)")
        self.assertEqual(len(expected),10)
        self.assertEqual(shown,expected)
        self.assertGreaterEqual(choices.count(),10)
        self.assertEqual(self.page.locator('[data-picker-control=compact]').count(),0)

    def test_pokedex_sort_orders_the_full_picker_and_groups_forms(self):
        self.load()
        self.page.locator('.our-team-panel .pokemon-filter-toggle').click()
        panel=self.page.locator('#teamPokemonInputFilters')
        panel.locator('[data-filter-section=sort]>summary').click()
        panel.get_by_role('button',name='Pokédex Number',exact=True).click()
        panel.locator('[data-filter-apply]').click()
        result=self.evaluate("""() => {
          const results=activeUsagePicker.items.filter(p=>!p.savedBuild);
          return {total:pokemonCatalog.length,values:results.map(p=>p.pickerSortValue),
            charizard:results.filter(p=>p.pickerSortValue===6).map(p=>p.name),
            patterns:results.filter(p=>p.cosmeticBaseId && p.name.startsWith('Vivillon')).map(p=>p.pickerSortValue)};
        }""")
        self.assertEqual(len(result['values']),result['total'])
        self.assertTrue(all(isinstance(number,int) for number in result['values']))
        self.assertEqual(result['values'],sorted(result['values']))
        self.assertEqual(result['charizard'],['Charizard','Mega Charizard X','Mega Charizard Y'])
        self.assertTrue(result['patterns'] and all(number==666 for number in result['patterns']))
        search=self.page.locator('#teamPokemonInput')
        search.fill('Charizard')
        picker=self.page.locator('#searchResults')
        expect(picker.locator('.choice-heading small').first).to_have_text('#0006')
        picker.get_by_role('button',name='Grid',exact=True).click()
        expect(self.page.locator('#pokemonGridResults .choice-copy small').first).to_have_text('#0006')

    def test_filtered_grid_layouts_show_every_match_and_keep_selection_behavior(self):
        self.load()
        picker=self.page.locator('#searchResults')
        grid=self.page.locator('#pokemonGridResults')
        search=self.page.locator('#teamPokemonInput')
        self.page.locator('.our-team-panel .pokemon-filter-toggle').click()
        panel=self.page.locator('#teamPokemonInputFilters')
        panel.locator('[data-filter-section=moves]>summary').click()
        panel.locator('[data-filter-search=moves]').fill('Trick Room')
        picker.get_by_role('option').filter(has=self.page.get_by_text('Trick Room',exact=True)).first.click()
        panel.locator('[data-filter-apply]').click()
        def names(panel):
            return panel.locator('[role=option] .choice-copy strong:not(.base-stat strong)').all_text_contents()
        expected=names(picker)
        self.assertGreater(len(expected),10)
        self.assertTrue(self.evaluate("activeUsagePicker.items.every(p=>p.savedBuild ? p.savedBuild.moveSet.includes('Trick Room') : p.satisfyingSet.moveSet.includes('Trick Room'))"))
        list_width=picker.bounding_box()['width']

        picker.get_by_role('button',name='Grid',exact=True).click()
        stats=grid.get_by_role('button',name='Base stats',exact=True)
        options=grid.get_by_role('option')
        expect(stats).to_have_attribute('aria-pressed','false')
        expect(options).to_have_count(len(expected))
        self.assertEqual(names(grid),expected)
        self.assertGreater(grid.bounding_box()['width'],list_width)
        self.assertEqual(grid.locator('[data-base-stat]').count(),0)
        self.assertEqual(grid.locator('.satisfying-moves').count(),len(expected))

        stats.click()
        expect(stats).to_have_attribute('aria-pressed','true')
        self.assertEqual(names(grid),expected)
        self.assertEqual(grid.locator('[data-base-stat]').count(),6*len(expected))
        self.assertEqual(grid.locator('[data-range-stat]').count(),0)
        self.assertEqual(grid.locator('.satisfying-moves').count(),len(expected))
        stats.click()
        expect(stats).to_have_attribute('aria-pressed','false')
        self.assertEqual(grid.locator('[data-base-stat]').count(),0)
        grid.get_by_role('button',name='Close',exact=True).click()
        expect(grid).to_be_hidden()
        self.assertEqual(picker.bounding_box()['width'],list_width)
        self.assertEqual(names(picker),expected)

        search.press('Tab')
        self.page.keyboard.press('Tab')
        grid_button=picker.get_by_role('button',name='Grid',exact=True)
        expect(grid_button).to_be_focused()
        grid_button.press('Space')
        expect(stats).to_be_focused()
        chosen=expected[-1]
        search.fill(chosen)
        expect(stats).to_have_attribute('aria-pressed','false')
        options.filter(has=self.page.get_by_text(chosen,exact=True)).first.click()
        expect(grid).to_be_hidden()
        self.assertEqual(self.evaluate('state.ourTeam.at(-1).name'),chosen)
        self.assertIn('Trick Room',self.evaluate('state.ourTeam.at(-1).moveSet'))

    def test_grid_stays_open_outside_the_picker_and_close_restores_the_list(self):
        self.load()
        self.evaluate("teamPokemonFilters.moves=['Trick Room'];teamPokemonFilters.render()")
        search=self.page.locator('#teamPokemonInput')
        picker=self.page.locator('#searchResults')
        grid=self.page.locator('#pokemonGridResults')
        search.fill('Slow')
        initial=self.evaluate('state.ourTeam.length')
        picker.get_by_role('button',name='Grid',exact=True).click()
        stats=grid.get_by_role('button',name='Base stats',exact=True)
        stats.click()
        self.page.locator('.brand-title').click()
        expect(grid).to_be_visible()
        self.page.locator('[data-format="Singles"]').click()
        expect(stats).to_have_attribute('aria-pressed','true')
        opponent=self.page.locator('#pokemonSearchInput')
        opponent.fill('Garchomp')
        expect(picker.get_by_role('option').first).to_be_visible()
        expect(grid).to_be_visible()
        self.page.set_viewport_size({'width':900,'height':760})
        expect(grid).to_be_visible()
        close=grid.get_by_role('button',name='Close',exact=True)
        expect(close).to_have_text('×')
        close.click()
        expect(grid).to_be_hidden()
        expect(search).to_be_focused()
        expect(search).to_have_value('Slow')
        expect(picker.get_by_role('button',name='Grid',exact=True)).to_be_visible()
        self.assertEqual(self.evaluate('state.ourTeam.length'),initial)

    def test_filter_editor_is_clickable_over_grid_and_applies_without_resetting_search(self):
        self.load()
        self.evaluate("teamPokemonFilters.moves=['Trick Room'];teamPokemonFilters.render()")
        search=self.page.locator('#teamPokemonInput')
        picker=self.page.locator('#searchResults')
        grid=self.page.locator('#pokemonGridResults')
        panel=self.page.locator('#teamPokemonInputFilters')
        search.fill('Slow')
        picker.get_by_role('button',name='Grid',exact=True).click()
        stats=grid.get_by_role('button',name='Base stats',exact=True)
        stats.click()
        self.page.locator('.our-team-panel .pokemon-filter-toggle').click()
        expect(panel).to_be_visible()
        self.assertTrue(panel.evaluate("el=>el.matches(':popover-open')"))
        panel.locator('[data-filter-section=moves]>summary').click()
        panel.locator('[data-filter-search=moves]').fill('Surf')
        picker.get_by_role('option').filter(has=self.page.get_by_text('Surf',exact=True)).first.click()
        panel.locator('[data-filter-apply]').click()
        expect(panel).to_be_hidden()
        expect(search).to_have_value('Slow')
        expect(stats).to_have_attribute('aria-pressed','true')
        expect(grid.get_by_role('button',name='Apply Pokémon filters')).to_have_text('Filters on')
        moves=grid.locator('.satisfying-moves').all_text_contents()
        self.assertTrue(moves)
        self.assertTrue(all('Trick Room' in row and 'Surf' in row for row in moves))

        self.page.set_viewport_size({'width':390,'height':760})
        edit=grid.get_by_role('button',name='Edit filters')
        edit.click()
        expect(panel).to_be_visible()
        self.assertTrue(panel.evaluate("el=>el.matches(':popover-open')"))
        expect(edit).to_have_attribute('aria-expanded','true')
        panel.get_by_role('button',name='Remove Surf',exact=True).click()
        edit.click()
        expect(panel).to_be_hidden()
        expect(edit).to_be_focused()
        expect(edit).to_have_attribute('aria-expanded','false')
        expect(grid).to_be_visible()
        expect(grid.locator('.picker-source-copy')).not_to_contain_text('Surf')
        expect(search).to_have_value('Slow')

    def test_edit_grid_returns_to_the_original_team_member_after_outside_selection(self):
        self.load()
        self.evaluate("teamPokemonFilters.moves=['Trick Room'];teamPokemonFilters.render()")
        editor=self.page.locator('.expanded-team .set-editor')
        editor.locator('summary').click()
        name=editor.locator('[data-set-field="name"]')
        name.fill('Slow')
        picker=self.page.locator('#searchResults')
        grid=self.page.locator('#pokemonGridResults')
        picker.get_by_role('button',name='Grid',exact=True).click()
        self.assertIn('Editing ',grid.locator('.picker-source-copy').inner_text())
        original=self.evaluate('state.activeOurIndex')
        self.page.locator('.compact-team').first.evaluate('row=>row.click()')
        self.assertNotEqual(self.evaluate('state.activeOurIndex'),original)
        expect(grid).to_be_visible()
        grid.get_by_role('button',name='Close',exact=True).click()
        expect(grid).to_be_hidden()
        expect(name).to_be_focused()
        expect(name).to_have_value('Slow')
        self.assertEqual(self.evaluate('state.activeOurIndex'),original)
        expect(picker.get_by_role('button',name='Grid',exact=True)).to_be_visible()

    def test_stab_coverage_adds_a_matching_move_in_list_grid_and_added_build(self):
        self.load()
        picker=self.page.locator('#searchResults')
        grid=self.page.locator('#pokemonGridResults')
        self.page.locator('.our-team-panel .pokemon-filter-toggle').click()
        panel=self.page.locator('#teamPokemonInputFilters')
        panel.locator('[data-filter-section=moves]>summary').click()
        for move in ['Trick Room','Toxic']:
            panel.locator('[data-filter-search=moves]').fill(move)
            picker.get_by_role('option').filter(has=self.page.get_by_text(move,exact=True)).first.click()
        panel.locator('[data-filter-section=stabTargets]>summary').click()
        panel.locator('[data-filter-type=stabTargets][data-type=Ghost]').click()
        panel.locator('[data-filter-apply]').click()
        moves=self.evaluate("""activeUsagePicker.items.filter(p=>!p.savedBuild).map(p=>{
          const list=p.satisfyingSet.moveSet;
          const type=MoveFilters.stabType(Battle.moveMeta(list[2]),{...p,ability:p.satisfyingSet.ability});
          return {name:p.name,list,type};
        })""")
        self.assertTrue({'Gengar','Spiritomb','Trevenant'}.issubset({row['name'] for row in moves}))
        for row in moves:
            self.assertEqual(row['list'][:2],['Trick Room','Toxic'])
            self.assertEqual(len(row['list']),3)
            self.assertIn(row['type'],['Ghost','Dark'])
        expected=[row['list'] for row in moves]
        def displayed_moves(panel):
            return panel.locator('.satisfying-moves').evaluate_all("rows=>rows.map(row=>[...row.querySelectorAll('span')].map(move=>move.textContent))")
        self.assertEqual(displayed_moves(picker),expected)
        picker.get_by_role('button',name='Grid',exact=True).click()
        self.assertEqual(displayed_moves(grid),expected)
        grid.get_by_role('button',name='Base stats',exact=True).click()
        self.assertEqual(displayed_moves(grid),expected)
        grid.get_by_role('option').filter(has=self.page.get_by_text('Spiritomb',exact=True)).click()
        self.assertEqual(self.evaluate('state.ourTeam.at(-1).moveSet'),next(row['list'] for row in moves if row['name']=='Spiritomb'))

    def test_picker_can_pause_and_resume_filters_without_losing_the_search(self):
        self.load()
        picker=self.page.locator('#searchResults')
        search=self.page.locator('#teamPokemonInput')
        toggle=picker.get_by_role('button',name='Apply Pokémon filters')
        search.focus()
        expect(toggle).to_have_count(0)
        self.page.locator('.our-team-panel .pokemon-filter-toggle').click()
        panel=self.page.locator('#teamPokemonInputFilters')
        panel.locator('[data-filter-section=types]>summary').click()
        panel.locator('[data-filter-type=types][data-type=Water]').click()
        panel.locator('[data-filter-apply]').click()
        expect(toggle).to_have_text('Filters on')
        search.fill('Charizard')
        expect(picker.get_by_role('option')).to_have_count(0)

        toggle.click()
        expect(toggle).to_have_attribute('aria-pressed','false')
        expect(search).to_have_value('Charizard')
        expect(picker.get_by_role('option').filter(has_text='Charizard').first).to_be_visible()
        expect(panel).to_be_hidden()

        search.press('Tab')
        expect(toggle).to_be_focused()
        toggle.press('Space')
        expect(toggle).to_have_text('Filters on')
        expect(toggle).to_be_focused()
        expect(picker.get_by_role('option')).to_have_count(0)
        toggle.press('Shift+Tab')
        expect(search).to_be_focused()
        expect(search).to_have_value('Charizard')
        expect(toggle).to_be_visible()

        editor=self.page.locator('.expanded-team .set-editor')
        editor.locator('summary').click()
        species=editor.locator('[data-set-field=name]')
        species.fill('Charizard')
        species.press('Tab')
        expect(toggle).to_be_focused()
        expect(species).to_have_value('Charizard')
        toggle.press('Space')
        expect(toggle).to_have_text('Filters off')
        toggle.press('Shift+Tab')
        species.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[state.activeOurIndex].name'),'Charizard')

    def test_paused_move_requirements_and_sort_do_not_affect_adding_a_pokemon(self):
        self.load()
        self.evaluate("teamPokemonFilters.moves=['Surf'];teamPokemonFilters.sort='spe';teamPokemonFilters.render()")
        search=self.page.locator('#teamPokemonInput')
        search.fill('Charizard')
        self.page.locator('[data-picker-filter-toggle]').click()
        self.assertTrue(self.evaluate("buildTeamSearchResults('').every(p=>p.pickerSort==='usage' && !p.satisfyingSet)"))
        self.page.locator('#teamAddForm button[type=submit]').click()
        self.assertEqual(self.evaluate('state.ourTeam.at(-1).name'),'Charizard')
        self.assertEqual(self.evaluate('teamPokemonFilters.moves'),['Surf'])
        self.assertEqual(self.evaluate('teamPokemonFilters.sort'),'spe')
        self.assertFalse(self.evaluate('teamPokemonFilters.enabled'))

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
