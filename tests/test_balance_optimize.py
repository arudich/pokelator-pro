import unittest
import test_app as app_tests


class BalanceOptimizeTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    evaluate = app_tests.AppTests.evaluate

    def load(self):
        app_tests.AppTests.load(self)
        self.page.add_script_tag(url=self.url+'/balance-optimize.js')

    def test_search_legal_full_allocations_quality_and_cancellation(self):
        self.load()
        result=self.evaluate("""async () => {
          const original={hp:2,atk:32,def:0,spa:0,spd:0,spe:32},before=JSON.stringify(original),seen=[];
          const evaluate=i=>{seen.push({...i});return 100-Object.entries({hp:11,atk:11,def:11,spa:11,spd:11,spe:11}).reduce((s,[k,v])=>s+(i[k]-v)**2,0);};
          const result=await BalanceOptimize.search(original,evaluate);
          const quality=[];
          for(const goal of [{hp:17,atk:24,def:3,spa:0,spd:7,spe:15},{hp:20,atk:0,def:9,spa:24,spd:8,spe:5}]) {
            const searched=await BalanceOptimize.search(original,i=>100-Object.keys(goal).reduce((sum,k)=>sum+(i[k]-goal[k])**2,0));
            quality.push(searched.candidates[0].score);
          }
          const cancelled=await BalanceOptimize.search(original,evaluate,{active:()=>false});
          return {result,cancelled,seen,quality,unchanged:before===JSON.stringify(original)};
        }""")
        self.assertTrue(result['unchanged'])
        self.assertIsNone(result['cancelled'])
        self.assertLessEqual(result['result']['evaluations'],160)
        self.assertEqual(result['result']['candidates'][0]['score'],100)
        self.assertTrue(all(score>=90 for score in result['quality']))
        for investment in result['seen']:
            self.assertEqual(sum(investment.values()),66)
            self.assertTrue(all(0<=n<=32 for n in investment.values()))

    def test_scores_share_field_weight_and_optimization_previews_without_saving(self):
        self.load()
        self.assertAlmostEqual(self.evaluate('Balance.totalScore([{wins:64,samples:256,weight:0.5},{wins:192,samples:256,weight:0.5},{wins:128,samples:256}])'),1)
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',investment:{atk:32,spe:32},moveSet:['Dragon Claw','Earthquake']})];
          state.activeOurIndex=0;state.builderTopN=1;render();
        }""")
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        library=self.evaluate('localStorage.getItem(LIBRARY_KEY)')
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="balance"]').click()
        self.page.wait_for_function('balanceTrial.finished')
        baseline=self.evaluate('Balance.totalScore(balanceTrial.rows)')
        self.page.locator('#balanceOptimizeStart').click()
        self.page.wait_for_function('!balanceOptimization.running',timeout=60000)
        self.assertIn('Search complete',self.page.locator('#balanceOptimizeProgress').inner_text())
        self.assertGreaterEqual(self.evaluate('balanceOptimization.best.score'),baseline)
        self.assertLessEqual(self.evaluate('balanceOptimization.evaluations'),160)
        self.assertTrue(self.evaluate('balanceOptimization.best.rows.every(row=>row.samples===256)'))
        self.page.locator('#balanceOptimizePreview').check()
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.assertEqual(self.evaluate('localStorage.getItem(LIBRARY_KEY)'),library)
        self.page.locator('#balanceOptimizePreview').uncheck()
        self.page.locator('#balanceOptimizeStart').click()
        self.page.wait_for_function('balanceOptimization.best')
        self.page.locator('#balanceOptimizeStop').click()
        self.assertFalse(self.evaluate('balanceOptimization.running'))
        self.assertIsNone(self.evaluate('balanceOptimization.worker'))
        self.assertIsNotNone(self.evaluate('balanceOptimization.best'))

    def test_reused_trials_and_damage_match_fresh_calculations(self):
        self.load()
        result=self.evaluate("""async () => {
          let checks=0;
          const cases=[['Sneasler',['Close Combat','Dire Claw','Acrobatics','Fake Out']],
            ['Avalugg',['Body Press','Ice Spinner']],['Slowbro',['Shell Side Arm','Psychic']]];
          for(const [name,moveSet] of cases) {
            const species=getPokemonByName(name),ours=sanitizeTeamEntry({name,moveSet,investment:{hp:2,atk:32,spd:32}});
            for(const opponent of ['Kingambit','Mega Kangaskhan','Clefable']) {
              const foe=getPokemonByName(opponent),target={species:foe,usage:getUsage(foe),field:{weather:'Sand'},abilities:[{name:foe.abilities[0],percent:100}]};
              const model=Balance.prepare(species,ours,target,{cacheLimit:128});
              for(const investment of [ours.investment,{...ours.investment,def:32,spd:0},{...ours.investment,def:16,spd:16}]) {
                await model.analyze(investment,{samples:16});
                for(const samples of [64,32]) {
                  const cached=await model.analyze(investment,{samples});
                  const fresh=await Balance.analyze(species,{...ours,investment},target,{samples,reuseOffense:false});
                  if(JSON.stringify(cached)!==JSON.stringify(fresh)) throw Error(`Cached result differs: ${name} vs ${opponent}`);
                  checks++;
                }
              }
              const original=Battle.range;let calls=0;
              Battle.range=(...args)=>{calls++;return original(...args);};
              try {await model.analyze(ours.investment,{samples:64});} finally {Battle.range=original;}
              if(calls) throw Error('Repeated trials were simulated again');
            }
          }
          return checks;
        }""")
        self.assertEqual(result,54)

    def test_sneasler_optimizer_keeps_full_sample_bulk_swap_and_top_n_scope(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Sneasler',investment:{hp:2,atk:32,spd:32},moveSet:['Close Combat','Dire Claw','Acrobatics','Fake Out']})];
          state.activeOurIndex=0;state.builderTopN=5;render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="balance"]').click()
        self.page.wait_for_function('balanceTrial.finished',timeout=60000)
        swap_score=self.evaluate("""async () => {
          const job=balanceTrial.job,investment={...job.ours.investment,def:32,spd:0};
          const rows=await Promise.all(job.targets.map(async target=>({...await Balance.analyze(job.species,{...job.ours,investment},target,{samples:256,reuseOffense:false}),weight:target.weight})));
          return Balance.totalScore(rows);
        }""")
        self.page.locator('#balanceOptimizeStart').click()
        self.page.wait_for_function('!balanceOptimization.running',timeout=60000)
        self.assertGreaterEqual(self.evaluate('balanceOptimization.best.score'),swap_score-1e-10)
        self.assertTrue(self.evaluate('balanceOptimization.best.rows.every(row=>row.samples===256 && row.rank<=5)'))
        self.assertEqual(self.evaluate('balanceOptimization.best.rows.length'),self.evaluate('balanceTrial.job.targets.length'))
