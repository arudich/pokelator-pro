import unittest
import test_app as app_tests


class MetaModeTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_meta_default_measured_weights_and_persistence(self):
        self.load()
        button=self.page.locator('#metaModeToggle')
        self.assertEqual(button.get_attribute('aria-pressed'),'true')
        self.assertIn('Showdown',button.get_attribute('title'))
        result=self.evaluate("""() => {
          const roster=['Sneasler','Rillaboom'].map(getPokemonByName),weights=statDistributionWeights(roster);
          const data=META_USAGE.formats.Doubles.species;
          return {ratio:weights.get('Sneasler')/weights.get('Rillaboom'),
            expected:data.sneasler.percent/data.rillaboom.percent,total:[...weights.values()].reduce((s,n)=>s+n,0)};
        }""")
        self.assertAlmostEqual(result['ratio'],result['expected'])
        self.assertAlmostEqual(result['total'],2)
        self.assertTrue(self.evaluate("""() => {
          const roster=['Mega Chandelure','Maushold','Toxtricity','Toxtricity Low Key Form','Vivillon Icy Snow Pattern'].map(getPokemonByName);
          const weights=statDistributionWeights(roster);
          return [...weights.values()].every(w=>w>0) && weights.get('Toxtricity')===weights.get('Toxtricity-Low-Key');
        }"""))
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        button.click()
        self.assertEqual(self.evaluate("[...statDistributionWeights(['Sneasler','Rillaboom'].map(getPokemonByName)).values()]"),[1,1])
        self.page.reload()
        self.assertEqual(button.get_attribute('aria-pressed'),'false')

    def test_lock_best_saves_stats_and_reuses_results_without_new_workers(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',investment:{atk:32,spe:32},moveSet:['Dragon Claw','Earthquake']})];
          state.activeOurIndex=0;state.builderTopN=1;render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="balance"]').click()
        self.page.wait_for_function('balanceTrial.finished')
        self.evaluate("""() => {
          balanceOptimization.best={investment:{...state.ourTeam[0].investment,hp:2},rows:balanceTrial.rows,score:Balance.totalScore(balanceTrial.rows)};
          balanceOptimization.evaluations=86;balanceOptimization.message='Search complete';renderBalanceOptimization();
          window.newWorkers=0;const Original=Worker;
          window.Worker=class extends Original {constructor(...args){super(...args);newWorkers++;}};
          window.cachedBalanceRows=balanceOptimization.best.rows;
        }""")
        self.assertIn('86 spreads evaluated (limit 160)',self.page.locator('#balanceOptimizeProgress').inner_text())
        self.page.locator('#balanceOptimizeLock').click()
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.hp'),2)
        self.assertEqual(self.evaluate('JSON.parse(localStorage.getItem(STORAGE_KEY))[0].investment.hp'),2)
        self.assertTrue(self.evaluate('balanceTrial.rows===cachedBalanceRows'))
        self.assertTrue(self.evaluate('balanceTrial.finished'))
        self.assertEqual(self.evaluate('newWorkers'),0)
        self.assertTrue(self.page.locator('#balanceOptimizeLock').is_disabled())
        self.assertIn('locked in',self.page.locator('#balanceOptimizeLock').inner_text())
