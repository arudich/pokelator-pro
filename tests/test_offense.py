import unittest
import test_app as app_tests


class OffenseTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def open_offense(self):
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="offense"]').click()

    def test_stat_threshold_badges_use_bounded_shared_worker_sweeps(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',investment:{atk:32,spe:32},moveSet:['Dragon Claw']})];
          state.activeOurIndex=0;state.builderTopN=3;render();
        }""")
        self.open_offense()
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.locator('#builderAttackTrial').check()
        self.page.wait_for_function('offenseThresholdTrial.finished',timeout=20000)
        self.assertIsNone(self.evaluate('offenseThresholdTrial.error || null'))
        self.assertLessEqual(self.evaluate('offenseThresholdTrial.sweeps'),7)
        self.assertTrue(self.evaluate("""() => [...document.querySelectorAll('[data-offense-species]')].every(icon=>{
          const threshold=offenseThresholdTrial.thresholds[icon.dataset.scenarioId]?.atk;
          return Boolean(icon.querySelector('[data-stat-threshold="atk"]'))===Boolean(threshold?.high);
        })"""))
        self.assertTrue(self.evaluate('Object.values(offenseThresholdTrial.thresholds).every(row=>row.atk.high ? row.atk.low>=1 && row.atk.high<=31 && row.atk.high-row.atk.low<=5 : row.atk.limit===31)'))
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.page.locator('#builderAttackTrial').uncheck()
        self.assertEqual(self.page.locator('[data-stat-threshold]').count(),0)

    def test_field_setters_have_distinct_calculated_variants_and_subtle_tiles(self):
        self.load(frozen_usage=True)
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Chandelure',ability:'Flame Body',investment:{spa:32,spe:32},moveSet:['Flamethrower']})];
          state.activeOurIndex=0;state.builderTopN=4;
          builderRoster=()=>['Pelipper','Torkoal','Rillaboom','Indeedee'].map(getPokemonByName);render();
        }""")
        self.open_offense()
        self.assertEqual(self.page.locator('[data-offense-species]').count(),8)
        self.assertEqual(self.page.locator('.field-assumed').count(),4)
        sun=self.page.locator('[data-offense-species="Torkoal"].field-assumed')
        self.assertTrue(sun.get_attribute('title').startswith('Sun: active (Drought)'))
        self.assertIn('field-sun',sun.get_attribute('class'))
        result=self.evaluate("""() => {
          const rows=builderOffenseRows(state.ourTeam[0]);
          const values=name=>rows.filter(row=>row.species.name===name).map(row=>row.score);
          const setter=getPokemonByName('Torkoal');
          const scenarios=Battle.fieldScenarios(setter,'Drought',{weather:'Sun',terrain:'Psychic'});
          const before=rows.map(row=>({...row,kind:'rest'}));
          const after=before.map((row,index)=>index===1 ? {...row,kind:'probable-ohko'} : row);
          return {sun:values('Torkoal'),rain:values('Pelipper'),scenarios,
            changed:highlightTierChanges(after,before).filter(row=>row.baselineKind).map(row=>row.scenarioId),
            expected:after[1].scenarioId,weight:rows.reduce((sum,row)=>sum+row.weight,0)};
        }""")
        self.assertGreater(result['sun'][1],result['sun'][0])
        self.assertLess(result['rain'][1],result['rain'][0])
        self.assertAlmostEqual(result['weight'],4)
        self.assertEqual(result['changed'],[result['expected']])
        self.assertEqual([row['weather'] for row in result['scenarios']],['','Sun'])
        self.assertTrue(all(row['terrain']=='Psychic' for row in result['scenarios']))
        self.page.locator('[data-builder-panel="team-offense"]').click()
        self.assertEqual(self.page.locator('[data-offense-species]').count(),8)
        self.page.locator('[data-builder-panel="defense"]').click()
        self.page.wait_for_function('defenseTrial.finished',timeout=20000)
        self.assertEqual(self.page.locator('[data-defense-species]').count(),8)
        self.assertEqual(self.page.locator('.field-assumed').count(),4)
        rain=self.page.locator('[data-defense-species="Pelipper"].field-assumed')
        self.assertTrue(rain.get_attribute('title').startswith('Rain: active (Drizzle)'))
        self.assertTrue(self.evaluate("""() => {
          const rows=defenseTrial.baselineRows.filter(row=>row.species.name==='Pelipper');
          return rows[1].score>rows[0].score;
        }"""))

    def test_paired_conditions_share_one_opponent_in_suggestion_scoring(self):
        self.load()
        result=self.evaluate("""async () => {
          const evaluate=name=>({kind:name==='Tackle' ? 'rest' : 'guaranteed-ohko',score:name==='Tackle' ? 0.1 : 2});
          return await Offense.bestSwap(['Tackle'],['Quick Attack'],[{weight:0.5,evaluate},{weight:0.5,evaluate},{weight:1,evaluate}]);
        }""")
        self.assertEqual(result['gain'],10)

    def test_attack_reduction_combines_with_swap_and_compares_to_saved_baseline(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Sneasler',investment:{atk:32},moveSet:['Poison Jab']})];
          state.activeOurIndex=0;state.builderTopN=3;render();
        }""")
        self.open_offense()
        self.page.wait_for_function('moveTrial.finished')
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        library=self.evaluate('localStorage.getItem(LIBRARY_KEY)')
        self.evaluate("""() => {
          moveTrial.best={to:'Gunk Shot',from:'Poison Jab',slot:0,gain:4};
          builderOffenseRows=ours=>['Kingambit','Garchomp','Sylveon'].map((name,index)=>{
            const loss=(32-ours.investment.atk)/80;
            const swap=ours.moveSet.includes('Gunk Shot');
            const score=index===2 ? 0.6 : [0.6,0.4][index]-loss+(swap ? [0.4,0.9][index] : 0);
            return {species:getPokemonByName(name),rank:index+1,score,kind:Offense.category(score),
              move:ours.moveSet[0],meta:{},count:1,coverage:100,reference:name};
          });renderTeamBuilder();
        }""")
        amount=self.page.locator('#builderAttackReduction')
        amount.fill('16');amount.press('Enter')
        self.page.locator('#builderAttackTrial').check()
        self.assertEqual(self.page.locator('.tier-worsened').count(),2)
        self.assertEqual(self.page.locator('.tier-improved').count(),0)
        amount.press('ArrowUp')
        self.assertEqual(amount.input_value(),'17')
        amount.press('ArrowDown')
        self.assertEqual(amount.input_value(),'16')
        self.page.locator('#builderMoveTrial').check()
        self.assertEqual(self.page.locator('.tier-worsened').count(),0)
        self.assertEqual(self.page.locator('.tier-improved').count(),1)
        self.assertEqual(self.page.locator('.tier-improved').get_attribute('data-offense-species'),'Garchomp')
        self.assertEqual(self.page.locator('[data-offense-species="Kingambit"]').get_attribute('data-baseline-tier'),None)
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.assertEqual(self.evaluate('localStorage.getItem(LIBRARY_KEY)'),library)
        self.page.locator('#builderMoveTrial').uncheck()
        self.page.locator('#builderAttackTrial').uncheck()
        self.assertEqual(self.page.locator('.tier-changed').count(),0)
        amount.fill('999');amount.press('Enter')
        self.assertEqual(amount.input_value(),'32')
        self.evaluate('state.ourTeam[0].investment.atk=0;renderTeamBuilder()')
        self.assertEqual(amount.input_value(),'0')
        self.assertTrue(self.page.locator('#builderAttackTrial').is_disabled())
        self.page.locator('[data-builder-panel="team-offense"]').click()
        self.assertTrue(self.page.locator('#builderAttackTrialRow').is_hidden())

    def test_investment_controls_follow_special_and_mixed_movesets(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',investment:{atk:16,spa:16,spe:32},moveSet:['Flamethrower','Protect']})];
          state.activeOurIndex=0;state.builderTopN=1;
          const original=builderOffenseRows;window.previewInvestments=[];
          builderOffenseRows=ours=>{previewInvestments.push({...ours.investment});return original(ours);};render();
        }""")
        self.open_offense()
        self.assertTrue(self.page.locator('#builderAttackTrialRow').is_hidden())
        self.assertTrue(self.page.locator('#builderSpecialAttackTrialRow').is_visible())
        special=self.page.locator('#builderSpecialAttackReduction')
        special.fill('8');special.press('Enter')
        self.evaluate('previewInvestments=[]')
        self.page.locator('#builderSpecialAttackTrial').check()
        self.assertEqual(self.evaluate('[previewInvestments.at(-1).atk,previewInvestments.at(-1).spa]'),[16,8])
        special.press('ArrowUp')
        self.assertEqual(special.input_value(),'9')
        self.evaluate("state.ourTeam[0].moveSet.push('Dragon Claw');renderTeamBuilder()")
        self.assertTrue(self.page.locator('#builderAttackTrialRow').is_visible())
        self.assertTrue(self.page.locator('#builderSpecialAttackTrialRow').is_visible())
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.locator('#builderAttackReduction').fill('5')
        self.page.locator('#builderAttackReduction').press('Enter')
        self.evaluate('previewInvestments=[]')
        self.page.locator('#builderAttackTrial').check()
        self.assertEqual(self.evaluate('[previewInvestments.at(-1).atk,previewInvestments.at(-1).spa]'),[11,7])
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.evaluate("state.ourTeam[0].moveSet=['Protect'];renderTeamBuilder()")
        self.assertTrue(self.page.locator('#builderAttackTrialRow').is_hidden())
        self.assertTrue(self.page.locator('#builderSpecialAttackTrialRow').is_hidden())

    def test_team_offense_combines_best_attacks_and_filters_members(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Sneasler',investment:{atk:32},moveSet:['Close Combat']}),
            sanitizeTeamEntry({name:'Kingambit',investment:{atk:32},moveSet:['Iron Head']})];
          state.activeOurIndex=0;state.builderTopN=3;render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="team-offense"]').click()
        self.assertEqual(self.page.locator('[data-team-offense-member][aria-pressed="true"]').count(),2)
        result=self.evaluate("""() => {
          const profiles=state.ourTeam.map(builderOffenseProfiles),team=teamOffenseRows(profiles,false);
          const individual=state.ourTeam.map(builderOffenseRows);
          return team.map((row,index)=>({score:row.score,kind:row.kind,
            expected:Offense.best(individual.map(rows=>rows[index]))}));
        }""")
        for row in result:
            self.assertEqual(row.get('score'),row['expected'].get('score'))
            self.assertEqual(row['kind'],row['expected']['kind'])
        self.assertEqual(self.page.locator('[data-offense-species]').count(),len(result))
        self.page.locator('[data-team-offense-member="1"]').click()
        self.assertEqual(self.page.locator('.coverage-selected').count(),1)
        self.assertTrue(self.evaluate("""() => {
          const actual=teamOffenseRows(state.ourTeam.map(builderOffenseProfiles),false);
          return actual.every((r,i)=>r.score===builderOffenseRows(state.ourTeam[0])[i].score);
        }"""))
        self.page.locator('[data-team-offense-member="0"]').click()
        self.assertEqual(self.page.locator('[data-offense-species]').count(),0)
        self.assertIn('Highlight team members',self.page.locator('#builderOffenseTiers').inner_text())
        self.page.reload()
        self.assertEqual(self.page.locator('#builderPanelTitle').inner_text(),'Team Offense')

    def test_team_move_trials_preview_without_saving_and_use_team_coverage(self):
        self.load(frozen_usage=True);self.evaluate("builderRoster=()=>['Kingambit','Garchomp','Sylveon'].map(getPokemonByName)")
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Sneasler',investment:{atk:32},moveSet:['Scratch']}),
            sanitizeTeamEntry({name:'Kingambit',investment:{atk:32},moveSet:['Scratch']})];
          state.activeOurIndex=0;state.builderTopN=3;render();
        }""")
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        library=self.evaluate('localStorage.getItem(LIBRARY_KEY)')
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="team-offense"]').click()
        self.page.wait_for_function('teamMoveTrials.size===2 && [...teamMoveTrials.values()].every(t=>t.finished)',timeout=20000)
        self.assertEqual(self.page.locator('[data-team-move-trial]').count(),2)
        def total():
            return self.evaluate('teamOffenseRows(state.ourTeam.map(builderOffenseProfiles)).reduce((sum,row)=>sum+Offense.points(row)*(row.weight ?? 1),0)')
        initial=total()
        index=self.evaluate('[...teamMoveTrials].find(([i,t])=>t.best)?.[0]')
        self.assertIsNotNone(index)
        gain=self.evaluate(f'teamMoveTrials.get({index}).best.gain')
        self.page.locator(f'[data-team-move-trial="{index}"]').check()
        self.assertEqual(total()-initial,gain)
        changed=self.evaluate("""() => {
          const profiles=state.ourTeam.map(builderOffenseProfiles),before=teamOffenseRows(profiles,false);
          return teamOffenseRows(profiles).filter((row,i)=>row.kind!==before[i].kind).map(row=>row.species.id).sort();
        }""")
        self.assertEqual(self.page.locator('.tier-changed').evaluate_all('(els)=>els.map(e=>e.dataset.offenseSpecies).sort()'),changed)
        self.assertGreater(len(changed),0)
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.assertEqual(self.evaluate('localStorage.getItem(LIBRARY_KEY)'),library)
        self.page.locator(f'[data-team-move-trial="{index}"]').uncheck()
        self.assertEqual(total(),initial)
        self.assertEqual(self.page.locator('.tier-changed').count(),0)
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        self.assertGreater(self.page.locator('#builderOffenseTiers').bounding_box()['height'],100)

    def test_team_offense_only_searches_active_members_and_lists_them_first(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Kingambit',moveSet:['Iron Head']}),
            sanitizeTeamEntry({name:'Sneasler',moveSet:['Close Combat']}),
            sanitizeTeamEntry({name:'Garchomp',moveSet:['Dragon Claw']})];
          state.activeOurIndex=0;state.builderTopN=3;
          state.teamOffenseExcluded.add(state.ourTeam[1]);
          window.searchCalls=[];
          Offense.bestSwap=async moves=>{searchCalls.push(moves);return null;};
          render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="team-offense"]').click()
        self.page.wait_for_function('teamMoveTrials.size===2 && [...teamMoveTrials.values()].every(t=>t.finished)')
        self.assertEqual(self.evaluate('searchCalls'),[['Iron Head'],['Dragon Claw']])
        self.assertEqual(self.page.locator('[data-team-offense-member]').evaluate_all('(els)=>els.map(e=>Number(e.dataset.teamOffenseMember))'),[0,2,1])
        self.assertEqual(self.page.locator('[data-team-move-trial]').evaluate_all('(els)=>els.map(e=>Number(e.dataset.teamMoveTrial))'),[0,2])
        self.page.locator('[data-team-offense-member="0"]').click()
        self.assertEqual(self.page.locator('[data-team-move-trial]').count(),1)
        self.assertEqual(self.page.locator('[data-team-offense-member]').first.get_attribute('data-team-offense-member'),'2')
        self.assertEqual(self.evaluate('[...teamMoveTrials.keys()]'),[2])

    def test_swap_scoring_keeps_teammate_coverage_with_empty_moves(self):
        self.load()
        result=self.evaluate("""async () => {
          const hit={kind:'guaranteed-ohko',score:2,guaranteed:true},miss={kind:'rest',score:0.1};
          const targets=[{baseline:hit,evaluate:()=>hit},
            {baseline:miss,evaluate:name=>name==='Ice Punch' ? {kind:'probable-2hko',score:0.6} : miss}];
          return await Offense.bestSwap([],['Thunder Punch','Ice Punch'],targets);
        }""")
        self.assertEqual(result['to'],'Ice Punch')
        self.assertEqual(result['gain'],2.5)

    def test_suggestions_exclude_charge_and_recharge_moves(self):
        self.load()
        result=self.evaluate("""async () => {
          const evaluated=[];
          const target={evaluate:name=>{
            evaluated.push(name);
            return {kind:name==='Tackle' ? 'rest' : 'guaranteed-ohko',score:name==='Tackle' ? 0.1 : 2,guaranteed:name!=='Tackle'};
          }};
          const swap=await Offense.bestSwap(['Tackle'],['Focus Punch','Giga Impact','Hyper Beam','Phantom Force','Fly',
            'Solar Beam','Meteor Beam','Electro Shot','Hydro Cannon','Quick Attack'],[target]);
          return {swap,evaluated};
        }""")
        self.assertEqual(result['swap']['to'],'Quick Attack')
        self.assertEqual(result['evaluated'],['Tackle','Quick Attack'])

    def test_suggestions_try_only_strongest_of_each_type_for_our_build(self):
        self.load()
        result=self.evaluate("""async () => {
          const ours=sanitizeTeamEntry({name:'Garchomp',nature:'Adamant',investment:{atk:32}});
          const evaluated=[];
          await Offense.bestSwap(['Tackle'],['Dragon Claw','Dragon Pulse','Draco Meteor','Flamethrower','Fire Blast','Overheat','Focus Punch'],
            [{evaluate:name=>{evaluated.push(name);return {kind:'rest',score:0.1};}}],{rankMove:moveSuggestionRanker(ours)});
          return evaluated;
        }""")
        self.assertEqual(result,['Tackle','Dragon Claw','Draco Meteor','Fire Blast','Overheat'])

    def test_repeated_self_drops_can_favor_steady_move_and_respect_abilities_and_herb(self):
        self.load()
        result=self.evaluate("""() => {
          const original=Battle.range;
          let power=60;
          Battle.range=(a,ours,d,defender,move)=>{
            const stage=ours.boosts?.spa || 0,factor=stage<0 ? 2/(2-stage) : (2+stage)/2;
            const damage=(move==='Overheat' ? power*factor : 55)*(defender.ability==='Multiscale' ? 0.5 : 1);
            return {rolls:[damage],minDamage:damage,maxDamage:damage,hp:100,defenderAbility:defender.ability};
          };
          try {
            const ours=sanitizeTeamEntry({name:'Mega Chandelure',moveSet:['Overheat']}),target=getPokemonByName('Snorlax');
            const spreads=[{percent:100,investment:{hp:0,def:0,spd:0}}];
            const analyze=(patch={},options={})=>Offense.analyze(getPokemonByName(ours.name),{...ours,...patch},target,spreads,options);
            const drop=analyze(),steady=analyze({moveSet:['Overheat','Flamethrower']}),contrary=analyze({ability:'Contrary'});
            const herb=Offense.analyze(getPokemonByName('Chandelure'),{...ours,name:'Chandelure',item:'White Herb'},target,spreads);
            const simple=analyze({ability:'Simple'}),disguise=analyze({},{defenderAbility:'Disguise'}),multiscale=analyze({},{defenderAbility:'Multiscale'});
            power=120;
            return {drop,steady,contrary,herb,simple,disguise,multiscale,ohko:analyze()};
          } finally {Battle.range=original;}
        }""")
        self.assertEqual(result['drop']['kind'],'probable-3hko')
        self.assertAlmostEqual(result['drop']['score'],0.4)
        self.assertEqual(result['steady']['move'],'Flamethrower')
        self.assertEqual(result['steady']['kind'],'probable-2hko')
        self.assertAlmostEqual(result['contrary']['score'],0.75)
        self.assertAlmostEqual(result['herb']['score'],0.6)
        self.assertLess(result['simple']['score'],result['drop']['score'])
        self.assertEqual(result['disguise']['kind'],'rest')
        self.assertAlmostEqual(result['multiscale']['score'],1/(4+0.05/0.15))
        self.assertEqual(result['ohko']['kind'],'guaranteed-ohko')

    def test_repeated_self_drop_damage_matches_engine_stages(self):
        self.load()
        result=self.evaluate("""() => {
          const species=getPokemonByName('Mega Chandelure'),target=getPokemonByName('Snorlax');
          const ours=sanitizeTeamEntry({name:species.name,nature:'Modest',investment:{spa:32},moveSet:['Overheat']});
          const spread={percent:100,investment:{hp:32,def:0,spd:32}};
          const fractions=[0,-2,-4,-6].map(spa=>{
            const range=Battle.range(species,{...ours,boosts:{spa}},target,{investment:spread.investment},'Overheat');
            return Offense.meanDamage(range.rolls)/range.hp;
          });
          const before=JSON.stringify(ours);
          const analyzed=Offense.analyze(species,ours,target,[spread]);
          return {fractions,analyzed,expected:Offense.repeatedScore(fractions),unchanged:before===JSON.stringify(ours)};
        }""")
        self.assertLess(result['fractions'][0],1)
        self.assertTrue(all(a>b for a,b in zip(result['fractions'],result['fractions'][1:])))
        self.assertAlmostEqual(result['analyzed']['score'],result['expected'])
        self.assertTrue(result['analyzed']['repeatedUse'])
        self.assertTrue(result['unchanged'])

    def test_disguise_adds_one_turn_and_respects_mold_breaker(self):
        self.load()
        result=self.evaluate("""() => {
          const target=getPokemonByName('Mimikyu');
          const spreads=[{percent:100,investment:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}}];
          const ours=sanitizeTeamEntry({name:'Kingambit',investment:{atk:32},moveSet:['Iron Head']});
          const analyze=(ability,attacker=ours)=>Offense.analyze(getPokemonByName(attacker.name),attacker,target,spreads,{defenderAbility:ability});
          return {normal:analyze(''),disguise:analyze('Disguise'),
            bypass:analyze('Disguise',{...ours,ability:'Mold Breaker'})};
        }""")
        normal=result['normal']['score']
        self.assertAlmostEqual(result['disguise']['score'],normal/(1+normal))
        self.assertEqual(result['disguise']['kind'],'probable-2hko')
        self.assertEqual(result['disguise']['extraTurns'],1)
        self.assertNotIn('extraTurns',result['bypass'])
        self.assertAlmostEqual(result['bypass']['score'],normal)

    def test_reload_restores_offense_and_global_format_limits_fainted_allies(self):
        self.load();self.open_offense()
        self.assertEqual(self.page.locator('#offenseFaintedInput button').count(),4)
        self.page.locator('[data-format="Singles"]').click()
        self.assertEqual(self.page.locator('#offenseFaintedInput button').count(),6)
        self.page.locator('#offenseFaintedInput [data-fainted-count="5"]').click()
        self.page.locator('[data-format="Doubles"]').click()
        self.assertEqual(self.evaluate('state.alliesFainted'),3)
        self.assertEqual(self.page.locator('#offenseFaintedInput [aria-pressed=true]').get_attribute('data-fainted-count'),'3')
        self.assertEqual(self.page.locator('[data-format][aria-pressed="true"]').count(),1)
        self.page.reload()
        self.assertTrue(self.page.locator('#teamBuilderPanel').is_visible())
        self.assertTrue(self.page.locator('#builderOffenseTiers').is_visible())
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))

    def test_multiscale_reduces_only_first_attack_and_respects_bypass(self):
        self.load()
        result=self.evaluate("""() => {
          const target=getPokemonByName('Dragonite');
          const spreads=[{percent:100,investment:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}}];
          const ours=sanitizeTeamEntry({name:'Garchomp',investment:{atk:32},moveSet:['Dragon Claw']});
          const analyze=(ability,attacker=ours)=>Offense.analyze(getPokemonByName(attacker.name),attacker,target,spreads,{defenderAbility:ability});
          const first=Battle.range(getPokemonByName(ours.name),ours,target,{investment:spreads[0].investment,ability:'Multiscale'},'Dragon Claw');
          const normal=analyze('');
          const fullRange=Battle.range(getPokemonByName(ours.name),ours,target,{investment:spreads[0].investment,ability:'No Ability'},'Dragon Claw');
          return {normal,fullScore:Offense.meanDamage(fullRange.rolls)/fullRange.hp,firstScore:Offense.meanDamage(first.rolls)/first.hp,multiscale:analyze('Multiscale'),
            bypass:analyze('Multiscale',{...ours,ability:'Mold Breaker'}),
            twoHits:Offense.summarize([{percent:100,range:{rolls:[35],minDamage:35,hp:100},followupRange:{rolls:[70]}}]),
            ohko:Offense.summarize([{percent:100,range:{rolls:[110],minDamage:100,hp:100},followupRange:{rolls:[220]}}])};
        }""")
        full=result['fullScore'];first=result['firstScore']
        self.assertLess(first,full)
        self.assertAlmostEqual(result['multiscale']['score'],full/(1+full-first))
        self.assertEqual(result['multiscale']['firstHitAbility'],'Multiscale')
        self.assertNotIn('firstHitAbility',result['bypass'])
        self.assertAlmostEqual(result['bypass']['score'],result['normal']['score'])
        self.assertEqual(result['twoHits']['kind'],'probable-2hko')
        self.assertEqual(result['ohko']['kind'],'guaranteed-ohko')

    def test_move_trial_preview_scoring_and_offense_fields(self):
        self.load(frozen_usage=True);self.evaluate("builderRoster=()=>['Kingambit','Garchomp','Sylveon'].map(getPokemonByName)");self.page.locator('#teamBuilderButton').click()
        self.page.locator('#builderTopN').fill('3');self.page.locator('#builderTopN').press('Enter')
        self.page.locator('[data-builder-panel="offense"]').click()
        self.page.wait_for_function('moveTrial.finished',timeout=20000)
        self.assertEqual(self.evaluate('Offense.groups.map(g=>Offense.points(g))'),[5,4,2.5,2.5,0.5,0])
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        library=self.evaluate('localStorage.getItem(LIBRARY_KEY)')
        def total():
            return self.page.locator('#builderOffenseTiers').evaluate("el=>[...el.querySelectorAll('[data-offense-group]')].reduce((sum,g)=>sum+Offense.points({kind:g.dataset.offenseGroup})*[...g.querySelectorAll('[data-offense-species]')].reduce((n,e)=>n+Number(e.dataset.scenarioWeight),0),0)")
        baseline=total()
        self.assertFalse(self.page.locator('#builderMoveTrial').is_disabled())
        gain=self.evaluate('moveTrial.best.gain')
        self.page.locator('#builderMoveTrial').check()
        self.assertAlmostEqual(total()-baseline,gain)
        self.assertGreater(self.page.locator('.tier-changed').count(),0)
        self.assertEqual(before,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.assertEqual(library,self.evaluate('localStorage.getItem(LIBRARY_KEY)'))
        self.page.locator('#builderMoveTrial').uncheck()
        self.assertEqual(total(),baseline)
        self.assertEqual(self.page.locator('.tier-changed').count(),0)
        self.page.locator('#offenseWeatherInput [data-field-value="Sand"]').click()
        self.page.locator('#offenseTerrainInput [data-field-value="Psychic"]').click()
        self.assertEqual(self.evaluate('[state.weather,state.terrain]'),['Sand','Psychic'])

    def test_weighted_average_classifies_once_rather_than_voting_by_build(self):
        self.load()
        result=self.evaluate("""() => {
          const sample=(percent,damage,hp=100,minDamage=damage)=>({percent,range:{rolls:[damage],hp,minDamage}});
          return {
            average:Offense.summarize([sample(30,20),sample(10,400)]),
            normalized:Offense.summarize([sample(10,50),sample(30,90,300)]),
            probable:Offense.summarize([sample(100,110,100,90)]),
            guaranteed:Offense.summarize([sample(40,110,100,100),sample(10,220,200,200)]),
            missing:Offense.summarize([sample(null,200)]),
            partial:Offense.summarize([sample(50,200),{percent:50,range:{error:'Unavailable'}}])
          };
        }""")
        self.assertAlmostEqual(result['average']['score'],1.15)
        self.assertEqual(result['average']['kind'],'probable-ohko')  # Most builds alone would be 5HKO.
        self.assertEqual(result['average']['coverage'],40)
        self.assertAlmostEqual(result['normalized']['score'],0.35)
        self.assertEqual(result['normalized']['kind'],'probable-3hko')
        self.assertEqual(result['probable']['kind'],'probable-ohko')
        self.assertFalse(result['probable']['guaranteed'])
        self.assertEqual(result['guaranteed']['kind'],'guaranteed-ohko')
        self.assertEqual(result['guaranteed']['coverage'],50)
        self.assertIn('error',result['missing'])
        self.assertIn('error',result['partial'])

    def test_roll_means_and_ko_threshold_boundaries(self):
        self.load()
        result=self.evaluate("""() => ({
          means:[Offense.meanDamage(50),Offense.meanDamage([80,100]),Offense.meanDamage([[80,100],[20,30]]),Offense.meanDamage([])],
          groups:[1,0.999,0.5,0.499,1/3,0.33,0].map(value=>Offense.category(value))
        })""")
        self.assertEqual(result['means'],[50,90,115,None])
        self.assertEqual(result['groups'],['probable-ohko','probable-2hko','probable-2hko','probable-3hko','probable-3hko','rest','rest'])

    def test_analysis_uses_full_spread_exact_build_and_resolved_survival_ability(self):
        self.load()
        result=self.evaluate("""() => {
          const attacker=sanitizeTeamEntry({name:'Sneasler',nature:'Jolly',investment:{atk:32},moveSet:['Close Combat']});
          const target=getPokemonByName('Kingambit');
          const spread=target.usage.Doubles.spreads[0];
          const profile={...spread,percent:100};
          const before=JSON.stringify(attacker);
          const result=Offense.analyze(getPokemonByName(attacker.name),attacker,target,[profile],{format:'Doubles'});
          const direct=Battle.range(getPokemonByName(attacker.name),attacker,target,{investment:spread.investment,nature:null,ability:'',item:''},'Close Combat',{format:'Doubles'});
          const sturdy=getPokemonByName('Bastiodon');
          const builds=[{percent:100,investment:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}}];
          const normal=sanitizeTeamEntry({name:'Garchomp',investment:{atk:32},moveSet:['Earthquake']});
          const breaker=sanitizeTeamEntry({name:'Mega Gyarados',nature:'Adamant',investment:{atk:32},moveSet:['Earthquake']});
          return {result,expected:direct.rolls.reduce((sum,n)=>sum+n,0)/direct.rolls.length/direct.hp,
            unchanged:before===JSON.stringify(attacker),
            sturdy:Offense.analyze(getPokemonByName(normal.name),normal,sturdy,builds,{defenderAbility:'Sturdy'}),
            bypass:Offense.analyze(getPokemonByName(breaker.name),breaker,sturdy,builds,{defenderAbility:'Sturdy'})};
        }""")
        self.assertAlmostEqual(result['result']['score'],result['expected'])
        self.assertEqual(result['result']['move'],'Close Combat')
        self.assertTrue(result['unchanged'])
        self.assertIn('Sturdy',result['sturdy']['error'])
        self.assertNotIn('error',result['bypass'])

    def test_offense_toggle_shares_panel_space_top_n_and_visible_assumptions(self):
        self.load()
        self.page.locator('#teamBuilderButton').click()
        panel=self.page.locator('#teamBuilderPanel').bounding_box()
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.locator('[data-builder-panel="offense"]').click()
        self.assertEqual(panel,self.page.locator('#teamBuilderPanel').bounding_box())
        self.assertTrue(self.page.locator('#builderSpeedTiers').is_hidden())
        self.assertFalse(self.page.locator('#builderOffenseTiers').is_hidden())
        self.assertEqual(self.page.locator('#builderPanelTitle').inner_text(),'Offense')
        self.assertFalse(self.page.locator('#builderOffenseAssumptions').is_hidden())
        expected=self.evaluate('pokerData.filter(p=>p.usage.Doubles.rank<=100).flatMap(p=>Battle.fieldScenarios(p,appliedOpponentAbility(p),state)).length')
        self.assertEqual(self.page.locator('[data-offense-species]').count(),expected)
        for group in self.page.locator('[data-offense-group]').all():
            self.assertEqual(group.locator(':scope > .tier-icon-cloud').count(),1)
        cutoff=self.page.locator('#builderTopN');cutoff.fill('5');cutoff.press('Enter')
        self.assertEqual(self.page.locator('[data-offense-species="Sceptile"]').count(),
                         int(self.evaluate("getPokemonByName('Sceptile').usage.Doubles.rank<=5")))
        self.assertEqual(self.page.locator('[data-offense-species]').count(),self.evaluate('pokerData.filter(p=>p.usage.Doubles.rank<=5).flatMap(p=>Battle.fieldScenarios(p,appliedOpponentAbility(p),state)).length'))
        self.page.locator('[data-builder-panel="speed"]').click()
        self.assertEqual(cutoff.input_value(),'5')
        self.assertEqual(self.page.locator('#builderSpeedTie [data-tier-species="Sceptile"]').count(),1)
        self.assertEqual(before,self.evaluate('JSON.stringify(state.ourTeam)'))

    def test_offense_sorts_by_internal_result_without_displaying_it(self):
        self.load();self.open_offense()
        self.evaluate("""() => {
          builderOffenseRows=()=>['Snorlax','Charizard','Kingambit'].map((name,i)=>({
            species:getPokemonByName(name),rank:i+1,kind:'probable-ohko',score:[1.23456789,1.87654321,1.45678912][i],
            move:'Ice Beam',meta:{},count:10,coverage:42.4,reference:name}));
          renderTeamBuilder();
        }""")
        self.assertEqual(self.page.locator('[data-offense-species]').evaluate_all('(rows)=>rows.map(r=>r.dataset.offenseSpecies)'),['Charizard','Kingambit','Snorlax'])
        markup=self.page.locator('#builderOffenseTiers').inner_html()
        for score in ['1.23456789','1.87654321','1.45678912']:
            self.assertNotIn(score,markup)
        self.assertIn('Ice Beam',self.page.locator('[data-offense-species]').first.get_attribute('title'))
        self.assertNotIn('42.4% of sets',self.page.locator('[data-offense-species]').first.get_attribute('title'))

    def test_offense_updates_for_investment_and_handles_missing_spreads(self):
        self.load(frozen_usage=True);self.evaluate("builderRoster=()=>['Kingambit','Garchomp','Sylveon'].map(getPokemonByName)");self.open_offense()
        before=self.evaluate('builderOffenseRows(state.ourTeam[0]).map(r=>({id:r.species.id,score:r.score,kind:r.kind}))')
        opponents=self.evaluate('JSON.stringify(state.opponentList)')
        attack=self.page.locator('input[data-stat="atk"]');attack.fill('0');attack.press('Enter')
        after=self.evaluate('builderOffenseRows(state.ourTeam[0]).map(r=>({id:r.species.id,score:r.score,kind:r.kind}))')
        self.assertTrue(all(a.get('score',0)>=b.get('score',0) for a,b in zip(before,after)))
        self.assertTrue(any(a.get('score',0)>b.get('score',0) for a,b in zip(before,after)))
        self.assertEqual(opponents,self.evaluate('JSON.stringify(state.opponentList)'))
        self.evaluate("getPokemonByName('Kingambit').usage.Doubles.spreads=[];renderTeamBuilder()")
        row=self.page.locator('[data-offense-species="Kingambit"]')
        self.assertIn('No reported spread',row.get_attribute('title'))
        self.assertEqual(row.evaluate('(el)=>el.closest("[data-offense-group]").dataset.offenseGroup'),'rest')

    def test_offense_respects_psychic_terrain_and_fits_phone(self):
        self.load();self.evaluate("builderRoster=()=>[getPokemonByName('Sneasler')]")
        self.evaluate("state.ourTeam=[sanitizeTeamEntry({name:'Gardevoir',nature:'Modest',investment:{spa:32},moveSet:['Expanding Force']})];state.activeOurIndex=0;render()")
        self.open_offense()
        neutral=self.evaluate("builderOffenseRows(state.ourTeam[0]).find(r=>r.species.name==='Sneasler').score")
        self.page.locator('#battleViewButton').click()
        self.page.locator('#terrainInput [data-field-value="Psychic"]').click()
        self.page.locator('#teamBuilderButton').click()
        boosted=self.evaluate("builderOffenseRows(state.ourTeam[0]).find(r=>r.species.name==='Sneasler').score")
        self.assertGreater(boosted,neutral)
        self.page.locator('#builderOffenseAssumptions summary').click()
        self.assertIn('Terrain: Psychic',self.page.locator('#builderOffenseContext').inner_text())
        self.page.locator('#builderOffenseAssumptions summary').click()
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        self.assertGreater(self.page.locator('#builderOffenseTiers').bounding_box()['height'],200)


if __name__ == '__main__':
    unittest.main()
