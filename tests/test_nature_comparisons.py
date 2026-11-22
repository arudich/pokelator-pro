import unittest
import test_app as app_tests


class NatureComparisonTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_outgoing_nature_pairs_use_each_moves_defense_and_optimal_split(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Gardevoir',nature:'Modest',investment:{spa:32},moveSet:['Psyshock','Shadow Ball']})];
          state.opponentList=[sanitizeOpponentEntry({name:'Garchomp'})];state.activeOurIndex=state.activeOpponentIndex=0;
          getOpponentPreferences().defenseNatureChoice=true;render();
        }""")
        self.assertEqual(self.page.locator('#boostNatureToggle,#boostOffenseNatureToggle').count(),0)
        for move,label in [('Psyshock','+DEF'),('Shadow Ball','+SPD')]:
            row=self.page.locator('[data-move="'+move+'"]')
            expected=self.evaluate("""move=>[0,35,64].flatMap(points=>[false,true].map(boostDefenseNature=>{
              const range=calculateMoveRange(state.ourTeam[0],state.opponentList[0],move,points,{boostDefenseNature});
              return `${formatPercent(range.low)}–${formatPercent(range.high)}`;
            }))""",move)
            self.assertEqual(row.locator('.nature-damage-row strong').all_text_contents(),expected)
            self.assertEqual(row.locator('[data-nature="boosted"] .nature-stat-name').all_text_contents(),[label]*3)
            self.assertIn('Optimal split',row.locator('[data-nature="boosted"]').first.get_attribute('title'))
        for width in [1440,1280,390]:
            self.page.set_viewport_size({'width':width,'height':1000})
            self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))

    def test_incoming_nature_pairs_share_spreads_and_follow_actual_attack_stat(self):
        self.load()
        self.evaluate("""() => {
          const species=getPokemonByName('Lucario');
          species.learnset=['Close Combat','Aura Sphere','Body Press'];
          getUsage(species).moves=species.learnset.map((name,index)=>({name,rank:index+1,percent:90-index*5}));
          state.opponentList=[sanitizeOpponentEntry({name:'Lucario'})];state.activeOpponentIndex=0;
          state.damageDirection='incoming';getOpponentPreferences().offenseNatureChoice=false;render();
        }""")
        for move,label in [('Close Combat','+ATK'),('Aura Sphere','+SPA'),('Body Press','+DEF')]:
            row=self.page.locator('[data-move="'+move+'"]')
            self.assertEqual(row.locator('.offense-ceiling [data-nature="boosted"] .nature-stat-name').inner_text(),label)
            comparison=self.evaluate("move=>incomingNatureComparisons(state.opponentList[0],state.ourTeam[0]).find(row=>row.name===move)",move)
            for scenario in comparison['scenarios']:
                self.assertGreaterEqual(scenario['boostedRange']['maxDamage'],scenario['range']['maxDamage'])
            self.assertGreater(comparison['boostedCeiling']['maxDamage'],comparison['ceiling']['maxDamage'])
            self.assertEqual(row.locator('.offense-ceiling .nature-damage-row').count(),2)
        self.assertNotIn('nature',self.evaluate('state.opponentList[0]'))

    def test_reported_spreads_group_by_damage_pair_and_sum_original_usage(self):
        self.load('Singles')
        result=self.evaluate("""() => {
          const species=getPokemonByName('Lucario');species.learnset=['Close Combat'];
          const usage=getUsage(species);usage.moves=[{name:'Close Combat',percent:100,rank:1}];
          usage.spreads=[
            {rank:1,percent:40,investment:{hp:32,atk:32,def:0,spa:0,spd:2,spe:0}},
            {rank:2,percent:30,investment:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}},
            {rank:3,percent:20,investment:{hp:32,atk:0,def:32,spa:0,spd:2,spe:0}},
            {rank:4,percent:5,investment:{hp:30,atk:32,def:4,spa:0,spd:0,spe:0}}];
          const source=JSON.stringify(usage.spreads);
          state.opponentList=[sanitizeOpponentEntry({name:'Lucario'})];state.activeOpponentIndex=0;state.damageDirection='incoming';render();
          const row=incomingNatureComparisons(state.opponentList[0],state.ourTeam[0])[0];
          return {groups:groupIncomingScenarios(row.scenarios),unchanged:source===JSON.stringify(usage.spreads),raw:row.scenarios.length};
        }""")
        self.assertTrue(result['unchanged'])
        self.assertEqual(result['raw'],4)
        self.assertEqual([group['percent'] for group in result['groups']],[75,20])
        row=self.page.locator('[data-move="Close Combat"]')
        self.assertIn('78.9% of reported sets',row.locator('.incoming-ranges .spread-scenario').inner_text())
        self.assertNotIn('spreads',row.locator('.incoming-ranges .spread-scenario').inner_text())
        self.assertIn('Other Damage Ranges (1)',row.locator('.spread-comparisons summary').inner_text())
        row.locator('.spread-comparisons summary').click()
        self.assertEqual(row.locator('.spread-scenario').count(),2)
        self.assertIn('21.1% of reported sets',row.locator('.spread-list').inner_text())

    def test_grouping_keeps_boosted_differences_and_unknown_usage_explicit(self):
        self.load()
        result=self.evaluate("""() => groupIncomingScenarios([
          {rank:1,percent:12.5,range:{low:10,high:20},boostedRange:{low:11,high:22}},
          {rank:2,percent:7.5,range:{low:10,high:20},boostedRange:{low:11,high:22}},
          {rank:3,percent:5,range:{low:10,high:20},boostedRange:{low:11,high:23}},
          {rank:4,percent:null,range:{low:10,high:20},boostedRange:{low:11,high:22}}
        ])""")
        self.assertEqual(len(result),2)
        self.assertEqual(result[0]['percent'],20)
        self.assertEqual(result[0]['unreported'],1)
        self.assertEqual(len(result[0]['spreads']),3)
        self.assertEqual(result[1]['percent'],5)

    def test_conditional_reported_set_percentages_sum_to_one_hundred(self):
        self.load()
        result=self.evaluate("""() => {
          const make=values=>groupIncomingScenarios(values.map((percent,index)=>({rank:index+1,percent,investment:{},
            range:{low:10+index,high:20+index},boostedRange:{low:11+index,high:22+index}})));
          return {reported:make([38.2,8.4,2.8]),rounding:make([1,1,1])};
        }""")
        self.assertEqual([g['reportedPercent'] for g in result['reported']],[77.3,17,5.7])
        self.assertAlmostEqual(sum(g['reportedPercent'] for g in result['reported']),100)
        self.assertEqual([g['reportedPercent'] for g in result['rounding']],[33.4,33.3,33.3])
        self.assertAlmostEqual(sum(g['reportedPercent'] for g in result['rounding']),100)

    def test_nature_usage_is_shown_beside_each_boosted_range_for_the_matching_stat(self):
        self.load('Singles')
        self.evaluate("""() => {
          const species=getPokemonByName('Lucario');
          getUsage(species).natures=[{name:'Bold',percent:27},{name:'Impish',percent:23},{name:'Calm',percent:15},{name:'Careful',percent:5},{name:'Hardy',percent:30}];
          state.ourTeam=[sanitizeTeamEntry({name:'Gardevoir',moveSet:['Psyshock','Shadow Ball']})];
          state.opponentList=[sanitizeOpponentEntry({name:'Lucario'})];state.activeOurIndex=state.activeOpponentIndex=0;render();
        }""")
        for move,stat,percent in [('Psyshock','def','50%'),('Shadow Ball','spd','20%')]:
            badge=self.page.locator('[data-move="'+move+'"] .nature-frequency')
            self.assertEqual(badge.count(),3)
            self.assertEqual(badge.first.get_attribute('data-nature-stat'),stat)
            self.assertEqual(badge.locator('b').all_text_contents(),[percent]*3)
            self.assertIn('separate from stat-spread usage',badge.first.get_attribute('title'))
            self.assertEqual(self.page.locator('[data-move="'+move+'"] .move-row-top .nature-frequency').count(),0)
        self.evaluate("""() => {
          const species=getPokemonByName('Lucario');species.learnset=['Close Combat','Aura Sphere'];
          getUsage(species).moves=species.learnset.map((name,index)=>({name,percent:90-index,rank:index+1}));
          getUsage(species).natures=[{name:'Adamant',percent:30},{name:'Brave',percent:15},{name:'Modest',percent:25},{name:'Quiet',percent:10},{name:'Hardy',percent:20}];
          state.damageDirection='incoming';renderDamageRanges();
        }""")
        for move,stat,percent in [('Close Combat','atk','45%'),('Aura Sphere','spa','35%')]:
            badge=self.page.locator('[data-move="'+move+'"] .nature-frequency')
            self.assertGreaterEqual(badge.count(),2)
            self.assertEqual(badge.first.get_attribute('data-nature-stat'),stat)
            self.assertTrue(all(value==percent for value in badge.locator('b').all_text_contents()))
        self.evaluate("getUsage(getPokemonByName('Lucario')).natures=[];renderDamageRanges()")
        self.assertEqual(self.page.locator('.nature-frequency').count(),0)
