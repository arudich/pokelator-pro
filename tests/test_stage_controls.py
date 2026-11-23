import unittest
import test_app as app_tests


class StageControlTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_speed_stage_math_and_per_pokemon_memory(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=['Sylveon','Garchomp'].map(name=>sanitizeTeamEntry({name,nature:'Serious',investment:{}}));
          state.opponentList=['Sylveon','Kingambit'].map(name=>sanitizeOpponentEntry({name}));
          state.activeOurIndex=state.activeOpponentIndex=0;saveTeamToStorage();render();
        }""")
        values=self.evaluate("[-2,-1,0,1,2].map(speedStage=>Battle.speed(getPokemonByName('Sylveon'),{investment:{},speedStage}))")
        self.assertEqual(values,[40,53,80,120,160])
        self.page.locator('[data-compact-stage="battle-our-speed"][value="1"]').check(force=True)
        self.page.locator('[data-compact-stage="battle-opponent-speed"][value="-1"]').check(force=True)
        self.assertEqual(self.evaluate("[getPreferences(state.ourTeam[0],'our').speedStage,getPreferences(state.opponentList[0],'opponent').speedStage]"),[1,-1])
        self.evaluate("state.activeOurIndex=state.activeOpponentIndex=1;render()")
        self.assertTrue(self.page.locator('[data-compact-stage="battle-our-speed"][value="0"]').is_checked())
        self.assertTrue(self.page.locator('[data-compact-stage="battle-opponent-speed"][value="0"]').is_checked())
        self.evaluate("state.activeOurIndex=state.activeOpponentIndex=0;render();state.builderPanel='speed';setView('builder')")
        self.assertTrue(self.page.locator('[data-compact-stage="builder-our-speed"][value="1"]').is_checked())
        self.page.locator('[data-compact-stage="builder-opponent-speed"][value="2"]').check(force=True)
        self.assertEqual(self.evaluate("getPreferences(state.ourTeam[0],'our').builderOpponentSpeedStage"),2)
        self.page.reload();self.page.wait_for_selector('#builderSpeedTiers .tier-pokemon')
        self.assertTrue(self.page.locator('[data-compact-stage="builder-our-speed"][value="1"]').is_checked())
        self.assertTrue(self.page.locator('[data-compact-stage="builder-opponent-speed"][value="2"]').is_checked())
        self.evaluate("resetBattle()")
        self.assertTrue(self.page.locator('[data-compact-stage="builder-our-speed"][value="0"]').is_checked())

    def test_builder_offense_shares_damage_stages_and_defense_recomputes(self):
        self.load()
        self.evaluate("state.builderTopN=5;state.builderPanel='offense';setView('builder')")
        self.page.locator('[data-compact-stage="builder-offense"][value="1"]').check(force=True)
        self.assertEqual(self.evaluate("statStages(state.ourTeam[state.activeOurIndex],'our').offense"),1)
        self.assertTrue(self.page.locator('#attackerStageControl input[value="1"]').is_checked())
        self.assertEqual(self.page.locator('[data-compact-stage="builder-offense"]').count(),13)
        self.assertTrue(self.page.locator('#builderStages .stat-stage-options').evaluate("el=>new Set([...el.children].map(child=>child.getBoundingClientRect().top)).size===1"))
        for stage in [6,-6]:
            self.page.locator(f'[data-compact-stage="builder-offense"][value="{stage}"]').check(force=True)
            self.assertEqual(self.evaluate("statStages(state.ourTeam[state.activeOurIndex],'our').offense"),stage)
            self.assertTrue(self.page.locator(f'#attackerStageControl input[value="{stage}"]').is_checked())
        self.evaluate("state.builderPanel='defense';renderTeamBuilder()")
        self.page.locator('[data-compact-stage="builder-opponent-offense"][value="2"]').check(force=True)
        self.assertTrue(self.evaluate("JSON.parse(defenseTrial.contextKey).targets.every(target=>target.options.attackerStages.offense===2)"))
        self.assertIn('opposing attackers',self.page.locator('[data-compact-stage="builder-opponent-offense"][value="2"]').locator('..').get_attribute('title'))
        self.evaluate("state.builderPanel='team-offense';renderTeamBuilder()")
        self.page.locator('[data-compact-stage="builder-offense"][value="-6"]').check(force=True)
        self.assertTrue(self.evaluate("teamOffenseSelected().every(({entry})=>statStages(entry,'our').offense===-6)"))
