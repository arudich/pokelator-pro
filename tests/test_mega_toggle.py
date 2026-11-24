import unittest
import test_app as app_tests


class MegaToggleTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def fixture(self):
        self.load(frozen_usage=True)
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Mega Charizard X',investment:{atk:32,spe:32},moveSet:['Dragon Claw','Flamethrower']})];
          state.opponentList=[sanitizeOpponentEntry({name:'Mega Garchomp'})];
          state.activeOurIndex=state.activeOpponentIndex=0;state.builderTopN=1;
          builderRoster=()=>[getPokemonByName('Mega Garchomp')];saveTeamToStorage();render();
        }""")

    def test_both_toggles_change_battle_not_saved_sidebar_and_keep_stones(self):
        self.fixture()
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        own=self.page.locator('[data-mega-side="our"]')
        foe=self.page.locator('[data-mega-side="opponent"]')
        self.assertEqual(own.get_attribute('aria-pressed'),'true')
        self.assertEqual(foe.get_attribute('aria-pressed'),'true')
        offense_before=self.evaluate("builderOffenseRows(state.ourTeam[0])[0].score")
        damage=self.evaluate("calculateMoveRange(state.ourTeam[0],state.opponentList[0],'Dragon Claw',0).high")
        own.click()
        self.assertEqual(self.page.locator('#ourActiveSummary .summary-name').inner_text(),'Charizard')
        self.assertEqual(self.page.locator('.expanded-team .pokemon-name').inner_text(),'Mega Charizard X')
        self.assertIn('Charizard.png',self.page.locator('#ourActiveSummary img').get_attribute('src'))
        self.assertLess(self.evaluate("calculateMoveRange(state.ourTeam[0],state.opponentList[0],'Dragon Claw',0).high"),damage)
        self.assertNotEqual(self.evaluate("builderOffenseRows(state.ourTeam[0])[0].score"),offense_before)
        self.assertEqual(self.evaluate("Battle.incomingRange(getPokemonByName('Garchomp'),getPokemonByName('Mega Charizard X'),state.ourTeam[0],'Earthquake').maxDamage"),0)
        foe.click()
        self.assertEqual(self.page.locator('#opponentActiveSummary .summary-name').inner_text(),'Garchomp')
        self.assertEqual(self.page.locator('#opponentList .pokemon-name').inner_text(),'Mega Garchomp')
        self.assertEqual(self.evaluate("appliedOpponentAbility(state.opponentList[0])"),'Rough Skin')
        self.assertIn('Mega Stone required',self.page.locator('#speedSummary').inner_text())
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.page.reload()
        self.assertEqual(own.get_attribute('aria-pressed'),'false')
        self.assertEqual(self.page.locator('#ourActiveSummary .summary-name').inner_text(),'Charizard')

    def test_builder_workers_use_ordinary_stats_and_stone(self):
        self.fixture()
        self.page.locator('[data-mega-side="our"]').click()
        self.page.locator('#teamBuilderButton').click()
        self.assertIn('Charizard',self.page.locator('#builderSelectedSummary').inner_text())
        self.assertNotIn('Mega',self.page.locator('#builderSelectedSummary').inner_text())
        self.page.locator('[data-builder-panel="defense"]').click()
        self.page.wait_for_function('defenseTrial.finished',timeout=20000)
        self.assertIsNone(self.evaluate('defenseTrial.error || null'))
        self.page.locator('[data-builder-panel="balance"]').click()
        self.page.wait_for_function('balanceTrial.finished',timeout=20000)
        self.assertIsNone(self.evaluate('balanceTrial.error || null'))
        self.assertEqual(self.evaluate('balanceTrial.job.species.calcId'),'Charizard')
        self.assertEqual(self.evaluate('balanceTrial.job.ours.item'),'Charizardite X')
        self.assertIn(self.evaluate('balanceTrial.job.ours.ability'),['Blaze','Solar Power'])
        self.assertEqual(self.evaluate('balanceTrial.job.species.types'),['Fire','Flying'])
        self.evaluate("""() => {
          balanceOptimization.best={investment:{...state.ourTeam[0].investment,hp:2},rows:balanceTrial.rows,score:Balance.totalScore(balanceTrial.rows)};
          const Original=Worker;window.newWorkers=0;window.Worker=class extends Original {constructor(...args){super(...args);newWorkers++;}};
          lockBalanceSpread();
        }""")
        self.assertEqual(self.evaluate('newWorkers'),0)
        self.assertEqual(self.evaluate('state.ourTeam[0].name'),'Mega Charizard X')

    def test_ordinary_ability_is_editable_and_persisted_without_changing_mega_build(self):
        self.fixture()
        self.page.locator('[data-mega-side="our"]').click()
        self.page.locator('.set-editor summary').first.click()
        ability=self.page.locator('[data-set-field="ability"]')
        ability.fill('Solar Power');ability.press('Enter')
        self.assertEqual(self.evaluate('battleEntry(state.ourTeam[0]).ability'),'Solar Power')
        self.assertEqual(self.evaluate('state.ourTeam[0].ability'),'Tough Claws')
        self.page.reload()
        self.assertEqual(self.evaluate('battleEntry(state.ourTeam[0]).ability'),'Solar Power')
        self.page.locator('[data-mega-side="our"]').click()
        self.assertEqual(self.evaluate('battleEntry(state.ourTeam[0]).ability'),'Tough Claws')

    def test_every_mega_has_ordinary_form_and_stone_mapping(self):
        self.load()
        result=self.evaluate("""() => pokerData.filter(p=>p.isMega).map(p=>{
          getPreferences(p,'opponent').megaActive=false;
          const base=battleSpecies(p,'opponent');
          return {name:p.name,ok:!!base.calcId && !base.isMega && !!base.megaStoneName};
        }).filter(p=>!p.ok)""")
        self.assertEqual(result,[])
