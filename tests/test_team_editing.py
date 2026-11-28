import unittest
import test_app as app_tests


class TeamEditingTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_remove_unselected_member_preserves_active_pokemon_and_supports_undo(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=['Sylveon','Garchomp','Sneasler'].map(name=>sanitizeTeamEntry({name}));
          state.activeOurIndex=1;saveTeamToStorage();render();
        }""")
        self.assertEqual(self.page.locator('[data-remove-team-index]').count(),3)
        self.page.locator('.compact-team [data-remove-team-index="0"]').click()
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),['Garchomp','Sneasler'])
        self.assertEqual(self.evaluate('state.ourTeam[state.activeOurIndex].name'),'Garchomp')
        self.page.locator('#teamPokemonInput').blur()
        self.page.keyboard.press('Control+z')
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),['Sylveon','Garchomp','Sneasler'])

    def fixture(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',item:'Choice Scarf',nature:'Jolly',investment:{hp:2,atk:32,spe:32},moveSet:['Earthquake','Dragon Claw','Rock Slide','Protect']})];
          state.activeOurIndex=state.activeOpponentIndex=0;
          state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];
          saveTeamToStorage();render();
        }""")

    def test_investment_totals_select_all_clear_and_undo(self):
        self.fixture()
        self.assertEqual(self.page.locator('[data-stat-total="spe"]').inner_text(),'169')
        attack=self.page.locator('input[data-stat="atk"]')
        attack.focus();attack.press('1');attack.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.atk'),1)
        self.assertEqual(self.page.locator('[data-stat-total="atk"]').inner_text(),'151')
        preserved=self.evaluate('JSON.stringify([state.ourTeam[0].nature,state.ourTeam[0].item,state.ourTeam[0].moveSet])')
        before=self.evaluate('({...state.ourTeam[0].investment})')
        self.page.locator('[data-clear-investments]').click()
        self.assertEqual(self.evaluate('getTotalInvestment(state.ourTeam[0])'),0)
        self.assertTrue(self.page.locator('[data-clear-investments]').is_disabled())
        self.assertEqual(self.page.locator('[data-stat-total="spe"]').inner_text(),'134')
        self.assertEqual(self.evaluate('JSON.stringify([state.ourTeam[0].nature,state.ourTeam[0].item,state.ourTeam[0].moveSet])'),preserved)
        self.page.keyboard.press('Control+z')
        self.assertEqual(self.evaluate('state.ourTeam[0].investment'),before)

    def test_item_picker_descriptions_usage_and_iron_ball_speed_everywhere(self):
        self.fixture()
        item=self.page.locator('input[data-field="item"]')
        item.focus();item.fill('iron ball')
        choice=self.page.locator('.item-choice').filter(has=self.page.locator('strong',has_text='Iron Ball')).first
        self.assertIn('Speed',choice.inner_text())
        choice.click()
        self.assertEqual(self.evaluate('state.ourTeam[0].item'),'Iron Ball')
        self.assertEqual(self.evaluate("Battle.speed(getPokemonByName('Garchomp'),state.ourTeam[0])"),84)
        self.evaluate("state.builderPanel='speed';setView('builder')")
        self.assertIn('Speed 84',self.page.locator('#builderSelectedSummary').inner_text())
        self.page.locator('input[data-field="item"]').fill('cHoIcE sCaRf')
        self.page.locator('input[data-field="item"]').press('Tab')
        self.assertEqual(self.evaluate('state.ourTeam[0].item'),'Choice Scarf')
        self.assertIn('Speed 253',self.page.locator('#builderSelectedSummary').inner_text())
        self.page.locator('input[data-field="item"]').fill('iron ball')
        self.page.locator('input[data-field="item"]').press('Tab')
        self.assertIn('Speed 84',self.page.locator('#builderSelectedSummary').inner_text())
        self.page.reload();self.page.wait_for_selector('.expanded-team')
        self.assertEqual(self.evaluate('state.ourTeam[0].item'),'Iron Ball')

    def test_nickname_stays_distinct_from_species_in_storage_exports_and_damage(self):
        self.fixture()
        self.page.locator('.set-editor summary').click()
        self.page.locator('[data-set-field="nickname"]').fill('Sage <3')
        self.page.locator('[data-set-field="nickname"]').press('Tab')
        self.assertEqual(self.page.locator('.expanded-team .pokemon-name').inner_text(),'Sage <3')
        self.assertEqual(self.evaluate('state.ourTeam[0].name'),'Garchomp')
        self.assertGreater(self.page.locator('#damageRangeSummary .move-row').count(),0)
        self.assertEqual(self.evaluate("TeamFiles.parse(JSON.stringify(TeamFiles.pack(state.teamLibrary)),sanitizeTeamEntry)[0].pokemon[0].nickname"),'Sage <3')
        self.page.reload();self.page.wait_for_selector('.expanded-team')
        self.assertEqual(self.page.locator('.expanded-team .pokemon-name').inner_text(),'Sage <3')

    def test_cosmetic_forms_are_searchable_share_mechanics_and_preserve_build(self):
        self.load()
        self.assertEqual(self.evaluate("buildSearchResults('vivillon').length"),20)
        result=self.evaluate("""() => {
          const base=getPokemonByName('Vivillon Icy Snow Pattern'),form=getPokemonByName('Vivillon Elegant Pattern');
          const entry=sanitizeTeamEntry({name:form.name,nickname:'Wings',ability:'Compound Eyes',nature:'Timid',investment:{spa:32,spe:32},moveSet:['Bug Buzz','Hurricane','Protect','Sleep Powder']});
          const defender=getPokemonByName('Snorlax');
          const a=Battle.range(form,entry,defender,{investment:{}},'Bug Buzz');
          const b=Battle.range(base,{...entry,name:base.name,id:base.id},defender,{investment:{}},'Bug Buzz');
          state.ourTeam=[entry];state.activeOurIndex=0;saveTeamToStorage();render();
          return {a:a.maxDamage,b:b.maxDamage,stats:JSON.stringify(form.stats)===JSON.stringify(base.stats),usage:form.usage===base.usage};
        }""")
        self.assertGreater(result['a'],0)
        self.assertEqual(result['a'],result['b'])
        self.assertTrue(result['stats']);self.assertTrue(result['usage'])
        self.page.locator('.set-editor summary').click()
        species=self.page.locator('[data-set-field="name"]');species.fill('Vivillon Ocean')
        self.assertNotIn('shared',self.page.locator('#searchResults .search-item').first.inner_text())
        self.page.locator('.search-item strong',has_text='Vivillon Ocean Pattern').first.click()
        self.assertEqual(self.evaluate('state.ourTeam[0].name'),'Vivillon Ocean Pattern')
        self.assertEqual(self.evaluate('state.ourTeam[0].ability'),'Compound Eyes')
        self.assertEqual(self.evaluate('state.ourTeam[0].nickname'),'Wings')
        self.assertEqual(self.evaluate('state.ourTeam[0].moveSet[0]'),'Bug Buzz')
        self.page.reload();self.page.wait_for_selector('.expanded-team')
        self.assertEqual(self.evaluate('state.ourTeam[0].name'),'Vivillon Ocean Pattern')

    def test_iron_ball_impossible_speed_thresholds_have_no_placeholder_badges(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Vivillon Sandstorm Pattern',nature:'Timid',item:'Iron Ball',investment:{}})];
          state.activeOurIndex=0;state.builderPanel='speed';builderRoster=()=>[getPokemonByName('Excadrill')];setView('builder');
        }""")
        self.assertEqual(self.evaluate("Battle.speed(getPokemonByName(state.ourTeam[0].name),{...state.ourTeam[0],investment:{spe:32}})"),77)
        icon=self.page.locator('[data-tier-species="Excadrill"]')
        self.assertEqual(icon.locator('.speed-investment-badge').count(),0)
        self.assertIn('Cannot guarantee outspeeding',icon.get_attribute('title'))
        self.assertIn('Iron Ball',icon.get_attribute('title'))
        self.assertNotIn('—',self.page.locator('#builderSpeedTiers').inner_text())
        self.assertTrue(self.evaluate("""() => {
          return [...document.querySelectorAll('.stat-investment-label')].every(label=>{
            const name=label.querySelector('strong'),output=label.querySelector('output');
            return Number(getComputedStyle(name).fontWeight)>Number(getComputedStyle(output).fontWeight)
              && name.getBoundingClientRect().top===output.getBoundingClientRect().top;
          });
        }"""))

    def test_garbodor_and_all_new_defaults_spend_full_budget_without_editing_saved_builds(self):
        self.load()
        result=self.evaluate("""() => {
          state.format='Doubles';
          const species=getPokemonByName('Garbodor');
          const partialSpread={percent:80,rank:1,investment:{hp:32,atk:32,def:0,spa:0,spd:0,spe:0}};
          const full={percent:20,rank:2,investment:{hp:32,atk:32,def:0,spa:0,spd:2,spe:0}};
          const previous=species.usage.Doubles;
          species.usage.Doubles={...previous,spreads:[partialSpread,full]};
          const saved=sanitizeTeamEntry({name:'Garbodor',investment:partialSpread.investment});
          state.ourTeam=[saved];state.activeOurIndex=0;saveTeamToStorage();
          addTeamPokemon('Garbodor');
          const partial=popularTeamBuild({...species,usage:{Doubles:{spreads:[partialSpread]}}});
          species.usage.Doubles=previous;
          return {original:getTotalInvestment(saved),actual:state.ourTeam.at(-1).investment,expected:full.investment,
            partial:partial.investment,incomplete:pokerData.filter(species=>getTotalInvestment(popularTeamBuild(species))!==66).map(species=>species.name)};
        }""")
        self.assertEqual(result['original'],64)
        self.assertEqual(result['actual'],result['expected'])
        self.assertEqual(sum(result['actual'].values()),66)
        self.assertEqual(sum(result['partial'].values()),66)
        self.assertEqual(result['partial']['hp'],32)
        self.assertEqual(result['partial']['atk'],32)
        self.assertEqual(result['incomplete'],[])
