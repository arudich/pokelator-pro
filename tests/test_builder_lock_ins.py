import unittest
import test_app as app_tests


class BuilderLockTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def fixture(self,panel='offense'):
        self.load()
        self.evaluate("""panel=>{
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',investment:{atk:32,spe:20},moveSet:['Dragon Claw','Earthquake','Rock Slide','Protect']})];
          state.activeOurIndex=0;state.builderTopN=3;state.builderPanel=panel;saveTeamToStorage();setView('builder');
        }""",panel)

    def test_icon_size_changes_every_panel_and_persists_without_calculation(self):
        self.fixture('speed')
        slider=self.page.locator('#builderIconSize')
        slider.evaluate("el=>{el.value='120';el.dispatchEvent(new Event('input',{bubbles:true}))}")
        icon=self.page.locator('#builderSpeedTiers .tier-pokemon').first
        self.assertEqual(icon.bounding_box()['width'],120)
        self.page.reload();self.page.wait_for_selector('#builderSpeedTiers .tier-pokemon')
        self.assertEqual(self.page.locator('#builderIconSize').input_value(),'120')
        self.assertEqual(self.page.locator('#builderSpeedTiers .tier-pokemon').first.bounding_box()['width'],120)

    def test_move_and_attack_locks_save_without_reapplying_preview_and_undo(self):
        self.fixture()
        self.page.wait_for_function('moveTrial.finished')
        self.evaluate("""() => {
          getAttackTrial(state.ourTeam[0],'atk').enabled=true;getAttackTrial(state.ourTeam[0],'atk').points=5;
          moveTrial={finished:true,enabled:true,best:{slot:0,from:'Dragon Claw',to:'Outrage',gain:1}};updateMoveTrialControl();
        }""")
        self.page.locator('#builderMoveLock').click()
        self.assertEqual(self.evaluate('state.ourTeam[0].moveSet[0]'),'Outrage')
        self.assertFalse(self.evaluate('moveTrial.enabled'))
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.atk'),32)
        self.assertTrue(self.evaluate("getAttackTrial(state.ourTeam[0],'atk').enabled"))
        self.page.keyboard.press('Control+z')
        self.assertEqual(self.evaluate('state.ourTeam[0].moveSet[0]'),'Dragon Claw')
        self.evaluate("getAttackTrial(state.ourTeam[0],'atk').points=5;getAttackTrial(state.ourTeam[0],'atk').enabled=true;renderTeamBuilder()")
        self.page.locator('#builderAttackLock').click()
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.atk'),27)
        self.assertFalse(self.evaluate("getAttackTrial(state.ourTeam[0],'atk').enabled"))
        self.page.reload();self.page.wait_for_selector('.expanded-team')
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.atk'),27)

    def test_defense_and_team_move_locks_apply_the_suggested_build(self):
        self.fixture('defense')
        self.page.wait_for_function('defenseTrial.finished',timeout=30000)
        expected=self.evaluate('({...defenseTrial.best.investment})')
        self.page.locator('#builderDefenseLock').click()
        self.assertEqual(self.evaluate('state.ourTeam[0].investment'),expected)
        self.assertFalse(self.evaluate('defenseTrial.enabled'))
        self.page.locator('[data-builder-panel="team-offense"]').click()
        self.page.wait_for_function('[...teamMoveTrials.values()].every(t=>t.finished)',timeout=30000)
        self.evaluate("""() => {
          teamMoveTrials.set(0,{finished:true,enabled:true,best:{slot:0,from:'Dragon Claw',to:'Outrage',gain:1}});renderTeamMoveTrials();
        }""")
        self.page.locator('[data-team-move-lock="0"]').click()
        self.assertEqual(self.evaluate('state.ourTeam[0].moveSet[0]'),'Outrage')
        self.assertFalse(self.evaluate('[...teamMoveTrials.values()].some(t=>t.enabled)'))
