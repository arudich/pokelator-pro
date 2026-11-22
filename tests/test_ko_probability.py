import unittest
import test_app as app_tests


class KOProbabilityTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_weighted_cumulative_roll_probabilities_and_first_hit_effects(self):
        self.load()
        result=self.evaluate("""() => {
          const sample=(percent,rolls,hp=100,extra={})=>({percent,range:{rolls,hp,minDamage:0,...extra}});
          const chance=samples=>Offense.tierProbability(Offense.summarize(samples,1,true));
          const disguise=Offense.summarize([sample(100,[90,110],100,{defenderAbility:'Disguise'})],1,true);
          disguise.kind='probable-2hko';
          return {weighted:chance([sample(30,[20]),sample(10,[400])]),two:chance([sample(100,[40,60])]),
            three:chance([sample(100,[30,40])]),nested:chance([sample(100,[[20,30],[20,30]])]),
            multiscale:chance([{...sample(100,[30,40],105),followupRange:{rolls:[60,80]}}]),
            disguise:Offense.tierProbability(disguise),immune:chance([sample(100,[0])]),
            rest:chance([sample(100,[20])]),missing:Offense.tierProbability({kind:'rest',error:'No data'})};
        }""")
        for key,expected in {'weighted':0.25,'two':0.75,'three':0.875,'nested':11/16,
                             'multiscale':0.5,'disguise':0.5,'immune':0,'rest':1}.items():
            self.assertAlmostEqual(result[key],expected,msg=key)
        self.assertIsNone(result['missing'])

    def test_repeated_offensive_drops_and_defense_best_move_weights(self):
        self.load()
        result=self.evaluate("""() => {
          const original=Battle.range;
          Battle.range=(a,attacker,b,defender,name)=>{
            const rolls=name==='Overheat' ? (attacker.boosts?.spa<0 ? [30,40] : [60,80]) : name==='Ice Punch' ? [180] : [40,60];
            return {rolls,hp:100,minDamage:Math.min(...rolls),maxDamage:Math.max(...rolls),defenderAbility:'No Ability',meta:{category:'Physical'}};
          };
          try {
            const ours=sanitizeTeamEntry({name:'Chandelure',moveSet:['Overheat']}),attacker=getPokemonByName(ours.name);
            const defender={...getPokemonByName('Garchomp'),stats:{...getPokemonByName('Garchomp').stats,hp:100}};
            const spreads=[{percent:100,investment:defaultInvestment()}];
            const overheat=Offense.analyze(attacker,ours,defender,spreads);
            const herb=Offense.analyze(attacker,{...ours,item:'White Herb'},defender,spreads);
            const usage={spreads,moves:[{name:'Ice Punch',percent:5},{name:'Body Slam',percent:100}]};
            const profile=Defense.profile(getPokemonByName('Kingambit'),defender,ours,usage);
            const incoming=profile.evaluate(defaultInvestment(),true);
            const rare=Defense.profile(getPokemonByName('Kingambit'),defender,ours,{...usage,moves:usage.moves.slice(0,1)}).evaluate(defaultInvestment(),true);
            return {overheat:Offense.tierProbability(overheat),herb:Offense.tierProbability(herb),
              incoming:Offense.tierProbability(incoming),kind:incoming.kind,twoHit:Offense.tierProbability({...incoming,kind:'probable-2hko'}),
              ohko:Offense.tierProbability({...incoming,kind:'probable-ohko'}),rare:Offense.tierProbability(rare)};
          } finally {Battle.range=original;}
        }""")
        self.assertAlmostEqual(result['overheat'],0.75)
        self.assertAlmostEqual(result['herb'],1)
        self.assertEqual(result['kind'],'might-ohko')
        self.assertAlmostEqual(result['incoming'],0.05)
        self.assertAlmostEqual(result['twoHit'],0.05+0.95*0.75)
        self.assertAlmostEqual(result['ohko'],0.05)
        self.assertAlmostEqual(result['rare'],0.05)

    def test_badges_lower_left_survive_previews_and_defense_workers(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',investment:{hp:2,atk:32,spe:32},moveSet:['Dragon Claw']})];
          state.activeOurIndex=0;state.builderTopN=3;render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="offense"]').click()
        icons=self.page.locator('[data-offense-species]')
        self.assertEqual(self.page.locator('.ko-chance-badge').count(),icons.count())
        self.assertTrue(self.evaluate("""() => [...document.querySelectorAll('.ko-chance-badge')].every(b=>{
          const badge=b.getBoundingClientRect(),icon=b.parentElement.getBoundingClientRect();
          return badge.left-icon.left<8 && icon.bottom-badge.bottom<8 && /^([0-9]+(\\.[0-9]+)?%)$/.test(b.textContent);
        })"""))
        self.page.locator('#builderAttackTrial').check()
        self.page.wait_for_function('offenseThresholdTrial.finished',timeout=20000)
        self.assertTrue(self.evaluate("""() => [...document.querySelectorAll('.has-ko-chance')].every(icon=>
          !icon.querySelector('.stat-thresholds') || icon.querySelector('.ko-chance-badge').getBoundingClientRect().top>=icon.querySelector('.stat-thresholds').getBoundingClientRect().bottom)"""))
        self.page.locator('[data-builder-panel="team-offense"]').click()
        self.assertEqual(self.page.locator('.ko-chance-badge').count(),icons.count())
        self.page.locator('[data-builder-panel="defense"]').click()
        self.page.wait_for_function('defenseTrial.finished',timeout=20000)
        self.assertTrue(self.evaluate('defenseTrial.baselineRows.every(row=>row.error || Number.isFinite(row.koProbability))'))
        self.assertEqual(self.page.locator('.ko-chance-badge').count(),self.page.locator('[data-defense-species]').count())
        self.assertIn('opponent KOing us',self.page.locator('.ko-chance-badge').first.get_attribute('aria-label'))
