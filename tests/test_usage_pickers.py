import unittest
import test_app as app_tests


class UsagePickerTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_set_editor_stays_open_through_card_clicks_and_rerenders_until_collapsed(self):
        self.load()
        summary=self.page.locator('.expanded-team .set-editor summary')
        summary.click()
        self.assertTrue(self.page.locator('.expanded-team .set-editor').evaluate('(el)=>el.open'))
        self.page.locator('.expanded-team .pokemon-name').click()
        self.assertTrue(self.page.locator('.expanded-team .set-editor').evaluate('(el)=>el.open'))
        self.page.locator('.opponent-row .pokemon-name').last.click()
        self.assertTrue(self.page.locator('.expanded-team .set-editor').evaluate('(el)=>el.open'))
        self.page.locator('.team-row.compact-team .pokemon-name').first.click()
        self.assertTrue(self.page.locator('.expanded-team .set-editor').evaluate('(el)=>el.open'))
        self.page.locator('#teamBuilderButton').click()
        self.assertTrue(self.page.locator('.expanded-team .set-editor').evaluate('(el)=>el.open'))
        self.page.locator('.expanded-team .set-editor summary').click()
        self.evaluate('render()')
        self.assertFalse(self.page.locator('.expanded-team .set-editor').evaluate('(el)=>el.open'))

    def test_ability_picker_shows_usage_effects_filters_and_persists_in_both_views(self):
        self.load()
        self.evaluate("state.ourTeam=[sanitizeTeamEntry({name:'Kingambit'})];state.activeOurIndex=0;render()")
        self.page.locator('.set-editor summary').click()
        ability=self.page.locator('[data-set-field="ability"]')
        self.assertEqual(ability.evaluate('(input)=>input.tagName'),'INPUT')
        ability.focus()
        expected=self.evaluate("buildAbilityChoices(getPokemonByName('Kingambit')).map(row=>row.name)")
        self.assertEqual(self.page.locator('#searchResults .choice-heading strong').all_text_contents(),expected)
        self.assertIn('%',self.page.locator('#searchResults .ability-choice').first.inner_text())
        self.assertTrue(self.page.locator('#searchResults .ability-choice .search-item-sub').first.inner_text())
        ability.fill('Supreme');ability.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[0].ability'),'Supreme Overlord')
        self.page.reload()
        self.assertEqual(self.evaluate('state.ourTeam[0].ability'),'Supreme Overlord')
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('.set-editor summary').click()
        ability=self.page.locator('[data-set-field="ability"]')
        ability.focus()
        self.assertEqual(self.page.locator('#searchResults .ability-choice').count(),len(expected))
        self.page.locator('#searchResults .ability-choice').filter(has_text='Defiant').click()
        self.assertEqual(self.evaluate('state.ourTeam[0].ability'),'Defiant')
        ability=self.page.locator('[data-set-field="ability"]')
        ability.fill('not an ability');ability.press('Tab')
        self.assertEqual(ability.input_value(),'Defiant')

    def test_move_choices_show_champions_accuracy_and_secondary_chances(self):
        self.load()
        result=self.evaluate("""() => Object.fromEntries(['Rock Slide','Dire Claw','Air Slash','Protect','Earthquake','Dual Wingbeat','Rock Blast'].map(name=>
          [name,moveChoiceMarkup({...Battle.moveMeta(name),name,percent:null})]))""")
        self.assertIn('90% acc',result['Rock Slide'])
        self.assertIn('30% flinch',result['Rock Slide'])
        self.assertIn('100% acc',result['Dire Claw'])
        self.assertIn('30% status (poison/paralysis/sleep)',result['Dire Claw'])
        self.assertIn('95% acc',result['Air Slash'])
        self.assertIn('30% flinch',result['Air Slash'])
        self.assertIn('No accuracy check',result['Protect'])
        self.assertNotIn('flinch',result['Earthquake'])
        self.assertIn('2 hits',result['Dual Wingbeat'])
        self.assertIn('2–5 hits',result['Rock Blast'])
        self.assertIn('power/hit',result['Rock Blast'])

    def test_move_archetypes_summarize_primary_effects_and_preserve_special_rules(self):
        self.load()
        result=self.evaluate("""() => {
          const names=['Charm','Swords Dance','Close Combat','Growth','Roost','Rest','Protect','Tailwind',
            'Trick Room','Rain Dance','Psychic Terrain','Stealth Rock','Knock Off','Expanding Force',
            'Solar Beam','Hyper Beam','Baton Pass','Whirlwind','Foul Play','Body Press','Stored Power',
            'Helping Hand','Haze','Beat Up','Last Respects','Scale Shot','Triple Axel','Fickle Beam',
            'Double-Edge','Drain Punch','Belly Drum','Memento','Toxic','Thunder Wave','Substitute','Wish',
            'Reflect','Light Screen','Spikes','Rapid Spin','Encore','Taunt','Trick','Skill Swap',
            'Seismic Toss','Endeavor','Destiny Bond','Counter'];
          const summaries=Object.fromEntries(names.map(name=>[name,MoveSummary.describe(BALANCE_MOVES.moves[calc.toID(name)])]));
          const moves=[...new Set(pokerData.flatMap(p=>p.learnset))].filter(name=>Battle.moveMeta(name));
          const missingStatus=moves.filter(name=>Battle.moveMeta(name).category==='Status'
            && !MoveSummary.describe(BALANCE_MOVES.moves[calc.toID(name)]));
          return {summaries,missingStatus,
            primaryChance:MoveSummary.describe({shortDesc:'30% chance to double power.'}),
            correctedChance:MoveSummary.describe({shortDesc:'50% chance to paralyze. Removes item.',secondary:{chance:30,status:'par'}}),
            triple:moveChoiceMarkup({...Battle.moveMeta('Triple Axel'),percent:null})};
        }""")
        self.assertEqual(result['missingStatus'],[])
        self.assertTrue(all(result['summaries'].values()),result['summaries'])
        self.assertEqual(result['summaries']['Charm'],'Target: −2 Atk')
        self.assertEqual(result['summaries']['Swords Dance'],'Self: +2 Atk')
        self.assertEqual(result['summaries']['Close Combat'],'Self: −1 Def/SpD')
        self.assertIn('Sun',result['summaries']['Growth'])
        self.assertIn('Psychic Terrain',result['summaries']['Expanding Force'])
        self.assertIn('30%',result['primaryChance'])
        self.assertIn('double power',result['primaryChance'])
        self.assertIn('30% paralysis',result['correctedChance'])
        self.assertIn('Removes item',result['correctedChance'])
        self.assertNotIn('50%',result['correctedChance'])
        self.assertIn('1–3 hits',result['triple'])
        self.assertIn('starting power',result['triple'])
        self.evaluate("state.ourTeam=[sanitizeTeamEntry({name:'Sylveon'})];state.activeOurIndex=0;render()")
        self.page.locator('.set-editor summary').click()
        self.page.locator('[data-set-field="move-0"]').fill('Charm')
        self.assertIn('Target: −2 Atk',self.page.locator('#searchResults .move-choice').inner_text())

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
              return {actual:entry.investment,expected:usage.spreads.filter(s=>Object.values(s.investment).reduce((a,b)=>a+b,0)===66).sort((a,b)=>b.percent-a.percent)[0]?.investment || null,nature:entry.nature.name,expectedNature:getNatureDefinition(usage.natures.slice().sort((a,b)=>b.percent-a.percent)[0].name).name};
            }""")
            if result['expected'] is not None:self.assertEqual(result['actual'],result['expected'])
            self.assertEqual(sum(result['actual'].values()),66)
            self.assertEqual(result['nature'],result['expectedNature'])
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam.slice(0,3))'),before)
        builds=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.reload()
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),builds)
        fallback=self.evaluate("popularTeamBuild({...getPokemonByName('Gardevoir'),usage:{}})")
        self.assertEqual(fallback['nature'],'Modest')
        self.assertEqual(sum(fallback['investment'].values()),66)
        self.assertTrue(all(0<=n<=32 for n in fallback['investment'].values()))
