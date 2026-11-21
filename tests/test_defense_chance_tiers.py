import unittest
import test_app as app_tests


class DefenseChanceTierTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_baxcalibur_medicham_live_usage_can_be_evaluated(self):
        self.load()
        result=self.evaluate("""() => {
          const attacker=getPokemonByName('Mega Baxcalibur'),defender=getPokemonByName('Mega Medicham');
          const ours=sanitizeTeamEntry({name:defender.name,nature:'Adamant',investment:{hp:30,atk:32,spd:4}});
          const profile=Defense.profile(attacker,defender,ours,getUsage(attacker),{format:'Doubles',
            attackerAbility:appliedOpponentAbility(attacker),boostOffenseNature:stat=>natureBoostForMove(attacker,'offense',stat)});
          const fast=profile.evaluate(ours.investment),full=profile.evaluate(ours.investment,true);
          return {kind:fast.kind,fullKind:full.kind,score:full.score,chance:full.ohkoProbability,badge:Offense.tierProbability(full)};
        }""")
        self.assertEqual(result['fullKind'],result['kind'])
        self.assertGreaterEqual(result['chance'],0)
        self.assertLessEqual(result['chance'],1)
        self.assertGreater(result['score'],0)
        self.assertGreaterEqual(result['badge'],0)
        self.assertLessEqual(result['badge'],1)

    def test_probable_ohko_and_badge_are_independent_of_mean_damage_crossing_one(self):
        self.load()
        results=self.evaluate("""() => {
          const original=Battle.range;
          try {
            const attacker=getPokemonByName('Medicham'),defender=getPokemonByName('Salamence');
            const ours=sanitizeTeamEntry({name:defender.name});
            const usage={spreads:[{percent:100,investment:defaultInvestment()}],moves:[{name:'Ice Punch',percent:100}]};
            return [[20,100,100,100],[20,100,100,300]].map(rolls=>{
              Battle.range=()=>({rolls,minDamage:Math.min(...rolls),maxDamage:Math.max(...rolls),hp:100,meta:{category:'Physical'}});
              const profile=Defense.profile(attacker,{...defender,stats:{...defender.stats,hp:100}},ours,usage);
              const fast=profile.evaluate(ours.investment),full=profile.evaluate(ours.investment,true);
              return {fast:fast.kind,kind:full.kind,chance:full.ohkoProbability,badge:Offense.tierProbability(full),score:full.score};
            });
          } finally {Battle.range=original;}
        }""")
        self.assertLess(results[0]['score'],1)
        self.assertGreater(results[1]['score'],1)
        for row,chance in zip(results,[0.75,0.75]):
            self.assertEqual(row['kind'],'probable-ohko')
            self.assertEqual(row['fast'],row['kind'])
            self.assertAlmostEqual(row['chance'],chance)
            self.assertAlmostEqual(row['badge'],chance)

    def test_threshold_uses_probability_including_rare_overkill(self):
        self.load()
        results=self.evaluate("""() => {
          const original=Battle.range;let damage=[40,100];
          Battle.range=(a,b,c,d,name)=>{const rolls=name==='Ice Punch' ? damage : [20];return {rolls,minDamage:Math.min(...rolls),maxDamage:Math.max(...rolls),hp:100,meta:{category:'Physical'}};};
          try {
            const ours=sanitizeTeamEntry({name:'Salamence'}),target={...getPokemonByName('Salamence'),stats:{...getPokemonByName('Salamence').stats,hp:100}};
            const run=percent=>Defense.profile(getPokemonByName('Medicham'),target,ours,{spreads:[{percent:100,investment:defaultInvestment()}],moves:[{name:'Ice Punch',percent},{name:'Fire Punch',percent:100}]}).evaluate(ours.investment);
            const fifty=run(100),below=run(99.9);damage=[3000];const rareOverkill=run(5);
            return {fifty,below,rareOverkill};
          } finally {Battle.range=original;}
        }""")
        self.assertEqual(results['fifty']['kind'],'probable-ohko')
        self.assertEqual(results['fifty']['ohkoProbability'],0.5)
        self.assertEqual(results['below']['kind'],'might-ohko')
        self.assertEqual(results['rareOverkill']['kind'],'might-ohko')
        self.assertGreater(results['rareOverkill']['score'],1)

    def test_each_damage_tier_sorts_by_displayed_ko_probability(self):
        self.load()
        for panel in ['defense','offense','team-offense']:
            self.evaluate("""panel => {
              state.builderPanel=panel;
              const rows=[['Salamence',0.51,1.2],['Baxcalibur',0.723,0.9],['Kingambit',0.65,1.1]].map(([name,koProbability,score])=>({species:getPokemonByName(name),kind:'probable-ohko',koProbability,score,coverage:100,detail:'Fixture'}));
              renderOffenseRows(rows,'test','',panel==='defense' ? Defense.groups : Offense.groups);
            }""",panel)
            self.assertEqual(self.page.locator('[data-offense-group=probable-ohko] [data-offense-species]').evaluate_all('(els)=>els.map(el=>el.dataset.offenseSpecies)'),['Baxcalibur','Kingambit','Salamence'])
