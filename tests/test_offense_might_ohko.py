import unittest
import test_app as app_tests


class OffenseMightOHKOTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_weighted_ohko_chances_choose_tiers_and_assume_two_hits(self):
        self.load()
        result=self.evaluate("""() => {
          const original=Battle.range;
          Battle.range=(a,b,c,defender,name)=>{
            const damage=name==='Ice Punch' ? defender.investment.def ? 0 : 200 : 60;
            return {rolls:[damage],minDamage:damage,maxDamage:damage,hp:100,meta:Battle.moveMeta(name)};
          };
          try {
            const attacker=getPokemonByName('Medicham'),defender=getPokemonByName('Salamence'),ours=sanitizeTeamEntry({name:'Medicham',moveSet:['Ice Punch']});
            const run=(chance,moves=ours.moveSet)=>Offense.analyze(attacker,{...ours,moveSet:moves},defender,[{percent:chance,investment:{def:0}},{percent:100-chance,investment:{def:32}}]);
            const rare=run(20),probable=run(60),best=run(20,['Ice Punch','Fire Punch']);
            const fast=Offense.analyze(attacker,ours,defender,[{percent:20,investment:{def:0}},{percent:80,investment:{def:32}}],{keepProbability:false});
            return {rare,probable:probable.kind,best:best.move,fast:fast.kind,chance:Offense.tierProbability(rare),twoHit:Offense.tierProbability({...rare,kind:'probable-2hko'}),groups:Offense.groups.map(g=>g.kind),defenseGroups:Defense.groups.map(g=>g.kind)};
          } finally {Battle.range=original;}
        }""")
        self.assertEqual(result['rare']['kind'],'might-ohko')
        self.assertEqual(result['probable'],'probable-ohko')
        self.assertEqual(result['fast'],'might-ohko')
        self.assertEqual(result['best'],'Ice Punch')
        self.assertAlmostEqual(result['chance'],0.2)
        self.assertEqual(result['twoHit'],1)
        self.assertEqual(result['groups'].count('might-ohko'),1)
        self.assertEqual(result['defenseGroups'].count('might-ohko'),1)

    def test_offense_and_team_offense_render_might_ohko(self):
        self.load()
        for panel in ['offense','team-offense']:
            self.evaluate("""panel=>{
              state.builderPanel=panel;
              const result={species:getPokemonByName('Salamence'),kind:'might-ohko',score:0.6,ohkoProbability:0.3,detail:'Fixture',coverage:100};
              renderOffenseRows([result],panel);
              renderBuilderScore([result]);
            }""",panel)
            self.assertIn('2.5 points',self.page.locator('[data-offense-group=might-ohko] h3').inner_text())
            self.assertEqual(self.page.locator('.ko-chance-badge').inner_text(),'30%')
            self.assertIn('2.5 points',self.page.locator('#builderScore').inner_text())

    def test_rare_ohko_chance_alone_does_not_improve_swap_score(self):
        self.load()
        result=self.evaluate("""async () => {
          const evaluate=name=>name==='Ice Punch' ? {kind:'might-ohko',score:0.51,ohkoProbability:0.001}
            : {kind:'probable-2hko',score:0.8,ohkoProbability:0};
          return {same:Offense.points(evaluate('Ice Punch'))===Offense.points(evaluate('Body Slam')),
            swap:await Offense.bestSwap(['Body Slam'],['Ice Punch'],[{evaluate}])};
        }""")
        self.assertTrue(result['same'])
        self.assertIsNone(result['swap'])
