import unittest
import test_app as app_tests


class StatStageTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def choose(self, role, value):
        self.page.locator(f'#{role}StageControl input[value="{value}"]').locator('..').click()

    def test_discrete_choices_apply_engine_boosts_and_fixed_damage_is_unchanged(self):
        self.load()
        for role in ['attacker','defender']:
            self.assertEqual(self.page.locator(f'#{role}StageControl input').count(),13)
            self.assertEqual(self.page.locator(f'#{role}StageControl input:checked').input_value(),'0')
        self.assertEqual(self.page.locator('#damageMultiplierInput').count(),0)
        self.choose('attacker',2)
        self.choose('defender',1)
        self.assertEqual(self.page.locator('#attackerStageControl input:checked').count(),1)
        self.assertTrue(self.evaluate("""() => {
          const ours=state.ourTeam[0],foe=state.opponentList[0],species=getPokemonByName(foe.name);
          const range=calculateMoveRange(ours,foe,'Close Combat');
          const expected=Battle.range(getPokemonByName(ours.name),{...ours,boosts:{atk:2,spa:2}},species,
            {...foe,ability:appliedOpponentAbility(foe),item:appliedOpponentItem(foe),boosts:{def:1,spd:1}},'Close Combat',{format:state.format});
          return JSON.stringify(range.rolls)===JSON.stringify(expected.rolls);
        }"""))
        self.assertTrue(self.evaluate("""() => {
          const species=getPokemonByName('Machamp'),foe=getPokemonByName('Snorlax');
          const run=options=>Battle.range(species,{investment:{}},foe,{investment:{}},'Seismic Toss',options);
          return JSON.stringify(run({}).rolls)===JSON.stringify(run({attackerStages:{offense:6},defenderStages:{defense:-6}}).rolls);
        }"""))
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))

    def test_per_pokemon_direction_persistence_and_reset(self):
        self.load()
        self.choose('attacker',3)
        self.choose('defender',-2)
        self.evaluate("state.damageDirection='incoming';renderDamageRanges()")
        self.assertEqual(self.page.locator('#attackerStageControl input:checked').input_value(),'0')
        self.assertEqual(self.page.locator('#defenderStageControl input:checked').input_value(),'0')
        self.choose('attacker',-1)
        self.choose('defender',2)
        self.evaluate("state.damageDirection='outgoing';renderDamageRanges()")
        self.assertEqual(self.page.locator('#attackerStageControl input:checked').input_value(),'3')
        self.assertEqual(self.page.locator('#defenderStageControl input:checked').input_value(),'-2')
        self.page.reload()
        self.assertEqual(self.page.locator('#attackerStageControl input:checked').input_value(),'3')
        self.assertEqual(self.page.locator('#defenderStageControl input:checked').input_value(),'-2')
        self.page.locator('#resetBattleButton').click()
        self.assertTrue(self.evaluate('Object.values(state.preferences).every(p=>p.offenseStage===0 && p.defenseStage===0)'))
        self.assertEqual(self.page.locator('#attackerStageControl input:checked').input_value(),'0')
        self.assertEqual(self.evaluate('sanitizePreferences({damageMultiplier:3.5,showMultiplierAtOne:true}).offenseStage'),0)

    def test_special_moves_body_press_and_unaware_use_their_actual_stats(self):
        self.load()
        result=self.evaluate("""() => {
          const attacker=getPokemonByName('Slowbro'),defender=getPokemonByName('Clefable');
          const a={investment:{}},b={investment:{},ability:'No Ability'};
          const run=(name,stages={},defense=b)=>Battle.range(attacker,a,defender,defense,name,{attackerStages:stages});
          return {special:[run('Psychic').maxDamage,run('Psychic',{offense:2}).maxDamage],
            body:[run('Body Press').maxDamage,run('Body Press',{offense:2}).maxDamage,run('Body Press',{defense:2}).maxDamage],
            unaware:[run('Psychic',{}, {...b,ability:'Unaware'}).maxDamage,run('Psychic',{offense:6},{...b,ability:'Unaware'}).maxDamage]};
        }""")
        self.assertGreater(result['special'][1],result['special'][0])
        self.assertEqual(result['body'][0],result['body'][1])
        self.assertGreater(result['body'][2],result['body'][0])
        self.assertEqual(result['unaware'][0],result['unaware'][1])

    def test_self_drops_start_at_selected_stage_and_reach_minus_six(self):
        self.load()
        result=self.evaluate("""() => {
          const original=Battle.range,seen=[];
          Battle.range=(a,entry,b,defender,name,options={})=>{
            const stage=Battle.withStages(entry,options.attackerStages).boosts?.spa || 0;seen.push(stage);
            const factor=stage>=0 ? (2+stage)/2 : 2/(2-stage),damage=Math.floor(20*factor);
            return {rolls:[damage],minDamage:damage,maxDamage:damage,hp:1000,defenderAbility:'No Ability'};
          };
          try {
            const ours=sanitizeTeamEntry({name:'Chandelure',moveSet:['Overheat']});
            Offense.analyze(getPokemonByName(ours.name),ours,getPokemonByName('Blissey'),[{percent:100,investment:{}}],{attackerStages:{offense:6}});
            return seen;
          } finally {Battle.range=original;}
        }""")
        self.assertEqual(result,[6,4,2,0,-2,-4,-6])
