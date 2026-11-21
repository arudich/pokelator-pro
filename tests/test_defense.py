import time
import unittest
import test_app as app_tests


class DefenseTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_move_usage_and_spread_usage_both_weight_damage(self):
        self.load()
        result=self.evaluate("""() => {
          const original=Battle.range;
          Battle.range=(a,attacker,d,ours,move)=>{
            const damage=(move==='Ice Punch' ? 200 : 20)+attacker.investment.atk;
            return {rolls:[damage],minDamage:damage,maxDamage:damage,hp:100,meta:{category:'Physical'}};
          };
          try {
            const target={...getPokemonByName('Salamence'),stats:{...getPokemonByName('Salamence').stats,hp:100}};
            const ours=sanitizeTeamEntry({name:'Salamence'});
            const usage={moves:[{name:'Ice Punch',percent:5},{name:'Fire Punch',percent:100}],
              spreads:[{percent:75,investment:{atk:0}},{percent:25,investment:{atk:20}}]};
            const profile=Defense.profile(getPokemonByName('Medicham'),target,ours,usage);
            return profile.evaluate(ours.investment);
          } finally {Battle.range=original;}
        }""")
        self.assertAlmostEqual(result['score'],0.34)
        self.assertEqual(result['kind'],'might-ohko')
        self.assertFalse(result['guaranteed'])
        self.assertIn('Ice Punch (5.0% estimated best-attack share; 5% move usage)',result['detail'])

    def test_uses_strongest_move_per_set_without_dilution_or_rare_move_inflation(self):
        self.load()
        result=self.evaluate("""() => {
          const original=Battle.range;
          Battle.range=(a,attacker,d,ours,move)=>({rolls:[move==='Ice Punch' ? 200 : 20],
            minDamage:move==='Ice Punch' ? 200 : 20,hp:100,meta:{category:'Physical'}});
          try {
            const target={...getPokemonByName('Salamence'),stats:{...getPokemonByName('Salamence').stats,hp:100}};
            const ours=sanitizeTeamEntry({name:'Salamence'}),spreads=[{percent:100,investment:{atk:0}}];
            const analyze=moves=>Defense.profile(getPokemonByName('Medicham'),target,ours,{moves,spreads}).evaluate(ours.investment);
            return {both:analyze([{name:'Ice Punch',percent:100},{name:'Fire Punch',percent:100},{name:'Metal Burst',percent:100}]),
              rare:analyze([{name:'Ice Punch',percent:5}])};
          } finally {Battle.range=original;}
        }""")
        self.assertEqual(result['both']['score'],2)
        self.assertEqual(result['both']['kind'],'guaranteed-ohko')
        self.assertNotIn('error',result['both'])
        self.assertAlmostEqual(result['rare']['score'],0.1)

    def test_kingambit_against_mega_chandelure_is_not_invalidated_by_metal_burst(self):
        self.load()
        result=self.evaluate("""() => {
          const attacker=getPokemonByName('Kingambit'),ours=sanitizeTeamEntry({name:'Mega Chandelure',investment:{spa:32,spe:32}});
          const usage=structuredClone(getUsage(attacker));
          if(!usage.moves.some(m=>m.name==='Metal Burst')) usage.moves.push({name:'Metal Burst',percent:5});
          const profile=Defense.profile(attacker,getPokemonByName(ours.name),ours,usage,{
            format:'Doubles',attackerAbility:appliedOpponentAbility(attacker),
            boostOffenseNature:stat=>natureBoostForMove(attacker,'offense',stat)});
          return profile.evaluate(ours.investment);
        }""")
        self.assertNotIn('error',result)
        self.assertNotEqual(result['kind'],'rest')
        self.assertIn('Excluded unmodeled counter/OHKO moves: Metal Burst',result['detail'])
        self.assertTrue('Kowtow Cleave' in result['detail'] or 'Sucker Punch' in result['detail'])

    def test_kangaskhan_does_not_choose_immune_or_terrain_blocked_moves(self):
        self.load(frozen_usage=True)
        result=self.evaluate("""() => {
          const attacker=getPokemonByName('Mega Kangaskhan');
          const ours=sanitizeTeamEntry({name:'Mega Chandelure',investment:{spa:32,spe:2}});
          return ['','Psychic'].map(terrain=>Defense.profile(attacker,getPokemonByName(ours.name),ours,getUsage(attacker),{
            format:'Doubles',terrain,attackerAbility:'Parental Bond'}).evaluate(ours.investment));
        }""")
        normal,psychic=result
        for row in result:
            self.assertNotIn('Fake Out',[move['name'] for move in row['bestAttacks']])
            self.assertIn('Fake Out',row['ineffectiveMoves'])
            self.assertAlmostEqual(sum(move['percent'] for move in row['bestAttacks'])+row['noAttackShare'],100)
        sucker=next(move for move in normal['bestAttacks'] if move['name']=='Sucker Punch')
        self.assertEqual(sucker['usage'],19)
        self.assertAlmostEqual(sucker['percent'],19*(1-0.105))
        self.assertNotIn('Sucker Punch',[move['name'] for move in psychic['bestAttacks']])
        self.assertIn('Sucker Punch',psychic['ineffectiveMoves'])
        self.assertIn('Terrain: Psychic',psychic['detail'])
        self.assertLess(psychic['score'],normal['score'])

    def test_optimizer_spends_only_free_points_and_finds_global_minimum(self):
        self.load()
        result=self.evaluate("""async () => {
          const ours={investment:{hp:8,def:10,spd:10,atk:32,spa:0,spe:0}};
          const before=JSON.stringify(ours);
          const profiles=[{evaluate:i=>{const score=1.2-i.hp*0.01-i.def*0.02;return {score,kind:Offense.category(score)};}},
            {evaluate:i=>{const score=0.9-i.hp*0.01-i.spd*0.015;return {score,kind:Offense.category(score)};}}];
          const best=await Defense.bestSpread(ours,profiles);
          const candidates=[];
          for(let hp=0;hp<=6;hp++) for(let def=0;def<=6-hp;def++) {
            const i={...ours.investment,hp:8+hp,def:10+def,spd:10+6-hp-def};
            const rows=profiles.map(p=>p.evaluate(i));
            candidates.push({points:rows.reduce((s,r)=>s+Offense.points(r),0),damage:rows.reduce((s,r)=>s+r.score,0)});
          }
          candidates.sort((a,b)=>a.points-b.points || a.damage-b.damage);
          return {best,expected:candidates[0],unchanged:before===JSON.stringify(ours)};
        }""")
        self.assertEqual(result['best']['points'],result['expected']['points'])
        self.assertAlmostEqual(result['best']['damage'],result['expected']['damage'])
        self.assertEqual(sum(result['best']['investment'].values()),66)
        self.assertEqual(result['best']['investment']['atk'],32)
        self.assertTrue(all(0<=value<=32 for value in result['best']['investment'].values()))
        self.assertTrue(result['unchanged'])

    def test_cached_damage_matches_direct_calculations_for_hp_and_both_defenses(self):
        self.load()
        result=self.evaluate("""() => {
          const attacker=getPokemonByName('Gardevoir'),target=getPokemonByName('Dragonite');
          const ours=sanitizeTeamEntry({name:'Dragonite',ability:'Multiscale'});
          const usage={moves:[{name:'Psyshock',percent:25},{name:'Moonblast',percent:75}],
            spreads:[{percent:80,investment:{spa:32}},{percent:20,investment:{spa:0}}]};
          const profile=Defense.profile(attacker,target,ours,usage);
          return [{hp:0,def:0,spd:0},{hp:12,def:8,spd:16},{hp:0,def:8,spd:16},{hp:12,def:0,spd:0}].map(values=>{
            const investment={...ours.investment,...values};
            const samples=usage.spreads.flatMap(spread=>{
              const attacks=usage.moves.map(move=>({probability:move.percent/100,
                range:Battle.range(attacker,{investment:spread.investment},target,{...ours,investment},move.name),
                followupRange:Battle.range(attacker,{investment:spread.investment},target,{...ours,investment,ability:'No Ability'},move.name)}))
                .sort((a,b)=>Offense.meanDamage(b.range.rolls)-Offense.meanDamage(a.range.rolls));
              let remaining=1;
              const result=attacks.map(attack=>{const percent=remaining*attack.probability*spread.percent;remaining*=1-attack.probability;return {...attack,percent};});
              result.push({percent:remaining*spread.percent,range:{rolls:[0],minDamage:0,hp:target.stats.hp+investment.hp}});
              return result;
            });
            return {cached:profile.evaluate(investment),direct:Offense.summarize(samples)};
          });
        }""")
        for row in result:
            self.assertAlmostEqual(row['cached']['score'],row['direct']['score'])
            self.assertEqual(row['cached']['kind'],row['direct']['kind'])

    def test_coordinate_search_compares_well_with_brute_force_at_32_free_points(self):
        self.load()
        cases=self.evaluate("""async () => {
          const results=[];
          for (const name of ['Mega Chandelure','Salamence','Sylveon']) {
            const ours=sanitizeTeamEntry({name,investment:{spa:32,spe:2}}),before=JSON.stringify(ours);
            const profiles=['Kingambit','Mega Medicham','Gardevoir','Garchomp','Sylveon','Basculegion'].map(name=>{
              const attacker=getPokemonByName(name);
              return Defense.profile(attacker,getPokemonByName(ours.name),ours,getUsage(attacker),{
                format:'Doubles',attackerAbility:appliedOpponentAbility(attacker),
                boostOffenseNature:stat=>natureBoostForMove(attacker,'offense',stat)});
            });
            const start=performance.now();
            const heuristic=await Defense.bestSpread(ours,profiles);
            const heuristicMs=performance.now()-start;
            let exact=null,count=0;
            const bruteStart=performance.now();
            for(let hp=0;hp<=32;hp++) for(let def=0;def<=32-hp;def++) {
              const investment={...ours.investment,hp,def,spd:32-hp-def};
              const rows=profiles.map(p=>p.evaluate(investment));
              const candidate={investment,points:rows.reduce((s,r)=>s+Offense.points(r),0),damage:rows.reduce((s,r)=>s+(r.score || 0),0)};
              if(!exact || candidate.points<exact.points || (candidate.points===exact.points && candidate.damage<exact.damage)) exact=candidate;
              count++;
            }
            results.push({name,heuristic,exact,bruteEvaluations:count,heuristicMs,bruteMs:performance.now()-bruteStart,
              unchanged:JSON.stringify(ours)===before});
          }
          return results;
        }""")
        for case in cases:
            with self.subTest(pokemon=case['name']):
                self.assertLessEqual(case['heuristic']['evaluations'],112)
                self.assertLess(case['heuristic']['evaluations'],case['bruteEvaluations']/3)
                self.assertLessEqual(case['heuristic']['points']-case['exact']['points'],1.5)
                self.assertTrue(case['unchanged'])
                self.assertEqual(sum(case['heuristic']['investment'].values()),66)
                self.assertTrue(all(0<=n<=32 for n in case['heuristic']['investment'].values()))
        print('\n32-SP defense benchmarks:',cases,flush=True)

    def test_coordinate_search_respects_existing_caps_and_cancels(self):
        self.load()
        result=self.evaluate("""async () => {
          const ours={investment:{hp:31,def:32,spd:0,atk:0,spa:0,spe:0}};
          const profiles=[{evaluate:i=>({kind:'probable-ohko',score:1/(1+i.hp+i.spd)})}];
          let pauses=0;
          const best=await Defense.bestSpread(ours,profiles,{pause:async()=>{pauses++;}});
          const cancelled=await Defense.bestSpread(ours,profiles,{active:()=>false});
          return {best,cancelled,pauses};
        }""")
        self.assertIsNone(result['cancelled'])
        self.assertEqual(result['best']['investment']['def'],32)
        self.assertGreaterEqual(result['best']['investment']['hp'],31)
        self.assertEqual(sum(result['best']['investment'].values()),66)

    def test_defense_preview_fields_and_zero_free_points(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Sneasler',investment:{atk:32,spe:32},moveSet:['Close Combat']})];
          state.activeOurIndex=0;state.builderTopN=3;render();
        }""")
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        library=self.evaluate('localStorage.getItem(LIBRARY_KEY)')
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="defense"]').click()
        self.page.wait_for_function('defenseTrial.finished',timeout=20000)
        self.assertTrue(self.evaluate("""() => {
          const job=JSON.parse(defenseTrial.key);
          return job.targets.every((target,index)=>{
            const direct=Defense.profile(target.species,job.species,job.ours,target.usage,{
              ...job.options,...target.options,boostOffenseNature:stat=>target.boosts[stat] || false}).evaluate(job.ours.investment);
            const actual=defenseTrial.baselineRows[index];
            return actual.kind===direct.kind && actual.score===direct.score && actual.error===direct.error;
          });
        }"""))
        self.assertEqual(self.page.locator('#builderDefenseTrialText').inner_text(),'Invest my')
        self.assertEqual(self.page.locator('#builderDefensePoints').input_value(),'2')
        self.assertEqual(self.page.locator('[data-defense-species]').count(),self.evaluate('JSON.parse(defenseTrial.key).targets.length'))
        self.page.locator('#builderDefenseTrial').check()
        self.assertTrue(self.evaluate('defenseTrial.enabled'))
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.assertEqual(self.evaluate('localStorage.getItem(LIBRARY_KEY)'),library)
        self.page.locator('#offenseWeatherInput [data-field-value="Sand"]').click()
        self.page.locator('#offenseTerrainInput [data-field-value="Psychic"]').click()
        self.assertEqual(self.evaluate('[state.weather,state.terrain]'),['Sand','Psychic'])
        self.assertFalse(self.evaluate('defenseTrial.enabled'))
        self.evaluate('state.ourTeam[0].investment.hp=2;renderTeamBuilder()')
        self.assertEqual(self.page.locator('#builderDefenseTrialText').inner_text(),'Free up some stat points for defense and we will help you invest them :)')
        self.assertTrue(self.page.locator('#builderDefenseTrial').is_disabled())
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        self.page.reload()
        self.assertEqual(self.page.locator('#builderPanelTitle').inner_text(),'Defense')

    def test_fainted_opponents_scales_incoming_damage_and_respects_format(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',investment:{atk:32,spe:32}})];state.activeOurIndex=0;
          state.alliesFainted=2;state.builderTopN=3;
          getPreferences(getPokemonByName('Kingambit'),'opponent').abilityChoice='Supreme Overlord';
          builderRoster=()=>['Kingambit','Basculegion'].map(getPokemonByName);render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="defense"]').click()
        self.page.wait_for_function('defenseTrial.baselineRows')
        before=self.evaluate('defenseTrial.baselineRows.map(row=>row.score)')
        self.assertEqual(self.page.locator('#defenseFaintedInput button').count(),4)
        self.assertTrue(self.page.locator('#offenseFaintedInput').is_hidden())
        self.page.locator('#defenseFaintedInput [data-fainted-count="3"]').click()
        self.page.wait_for_function('defenseTrial.baselineRows')
        after=self.evaluate('defenseTrial.baselineRows.map(row=>row.score)')
        self.assertTrue(all(a>b for a,b in zip(after,before)))
        self.assertEqual(self.evaluate('state.alliesFainted'),2)
        self.page.locator('[data-format="Singles"]').click()
        self.assertEqual(self.page.locator('#defenseFaintedInput button').count(),6)
        self.page.locator('#defenseFaintedInput [data-fainted-count="5"]').click()
        self.page.locator('[data-format="Doubles"]').click()
        self.assertEqual(self.page.locator('#defenseFaintedInput [aria-pressed=true]').get_attribute('data-fainted-count'),'3')
        self.page.locator('[data-builder-panel="offense"]').click()
        self.assertTrue(self.page.locator('#defenseFaintedInput').is_hidden())
        self.assertEqual(self.page.locator('#offenseFaintedInput [aria-pressed=true]').get_attribute('data-fainted-count'),'2')

    def test_editable_defense_budget_typing_arrows_and_active_preview(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Mega Chandelure',investment:{spa:32,spe:2}})];
          state.activeOurIndex=0;state.builderTopN=1;render();
        }""")
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="defense"]').click()
        self.page.wait_for_function('defenseTrial.finished')
        amount=self.page.locator('#builderDefensePoints')
        self.assertEqual(amount.input_value(),'32')
        self.assertEqual(amount.get_attribute('max'),'32')
        self.page.locator('#builderDefenseTrial').check()
        amount.fill('8');amount.press('Enter')
        self.page.wait_for_function('defenseTrial.finished && JSON.parse(defenseTrial.key).pointBudget===8')
        self.assertTrue(self.page.locator('#builderDefenseTrial').is_checked())
        self.assertEqual(self.evaluate('Object.values(defenseTrial.best.investment).reduce((a,b)=>a+b,0)'),42)
        amount.press('ArrowUp')
        self.page.wait_for_function('defenseTrial.finished && JSON.parse(defenseTrial.key).pointBudget===9')
        self.assertEqual(amount.input_value(),'9')
        self.assertEqual(self.evaluate('Object.values(defenseTrial.best.investment).reduce((a,b)=>a+b,0)'),43)
        amount.fill('999');amount.press('Enter')
        self.assertEqual(amount.input_value(),'32')
        amount.fill('0');amount.press('Enter')
        self.page.wait_for_function('defenseTrial.finished && JSON.parse(defenseTrial.key).pointBudget===0')
        self.assertTrue(self.page.locator('#builderDefenseTrial').is_disabled())
        self.assertFalse(self.page.locator('#builderDefenseTrial').is_checked())
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)

    def test_arrow_adjustments_are_local_with_full_search_every_five(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',investment:{atk:32,spe:2}})];
          state.activeOurIndex=0;state.builderTopN=1;render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="defense"]').click()
        self.page.wait_for_function('defenseTrial.finished')
        amount=self.page.locator('#builderDefensePoints')
        amount.fill('20');amount.press('Enter')
        self.page.wait_for_function('defenseTrial.finished && defenseTrial.pointBudget===20')
        self.evaluate('()=>{window.originalDefenseWorker=defenseTrial.worker;}')
        modes=[]
        for budget in range(19,14,-1):
            amount.press('ArrowDown')
            self.page.wait_for_function(f'defenseTrial.finished && defenseTrial.pointBudget==={budget}')
            modes.append(self.evaluate('defenseTrial.searchMode'))
            if budget>15:
                self.assertLessEqual(self.evaluate('defenseTrial.best.evaluations'),3)
        self.assertEqual(modes,['local','local','local','local','full'])
        self.assertTrue(self.evaluate('defenseTrial.worker===originalDefenseWorker'))
        amount.fill('20');amount.press('Enter')
        self.page.wait_for_function('defenseTrial.finished && defenseTrial.pointBudget===20')
        for _ in range(3):
            amount.press('ArrowDown')
        self.page.wait_for_function('defenseTrial.finished && defenseTrial.pointBudget===17')
        self.assertEqual(self.evaluate('defenseTrial.searchMode'),'local')
        self.page.locator('#builderDefenseTrial').check()
        self.page.wait_for_function('defenseTrial.thresholds')
        self.assertEqual(self.page.locator('[data-stat-threshold="defense"]').count(),self.page.locator('[data-defense-species]').count())
        self.assertTrue(self.evaluate('Object.values(defenseTrial.thresholds).every(t=>t.high ? t.high>=1 && t.high<=17 : t.limit===17)'))
        self.page.locator('#builderDefenseTrial').uncheck()
        self.assertEqual(self.page.locator('[data-stat-threshold]').count(),0)

    def test_local_step_chooses_best_legal_stat_without_global_search(self):
        self.load()
        result=self.evaluate("""() => {
          const ours={investment:{hp:0,def:0,spd:0,atk:32,spa:0,spe:2}};
          const current={...ours.investment,hp:4,def:4,spd:4};
          const profiles=[{evaluate:i=>{const score=0.7-i.hp*0.02-i.def*0.04-i.spd*0.01;return {score,kind:Offense.category(score)};}}];
          return {down:Defense.localStep(ours,profiles,current,-1),up:Defense.localStep(ours,profiles,current,1)};
        }""")
        self.assertEqual(result['down']['investment']['spd'],3)
        self.assertEqual(result['up']['investment']['def'],5)
        self.assertEqual(result['down']['evaluations'],3)
        self.assertEqual(result['up']['evaluations'],3)

    def test_defense_preview_marks_only_changed_tiers_and_clears_on_uncheck(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',investment:{atk:32,spe:32}})];state.activeOurIndex=0;
          state.builderTopN=3;setView('builder');state.builderPanel='defense';renderTeamBuilder();
        }""")
        self.page.wait_for_function('defenseTrial.finished')
        self.evaluate("""() => {
          const original={...state.ourTeam[0].investment};
          const improved={...original,hp:original.hp+1};
          defenseTrial.best={investment:improved};defenseTrial.finished=true;
          defenseTrial.baselineRows=['Kingambit','Dragonite'].map((name,index)=>({species:getPokemonByName(name),rank:index+1,
            kind:'probable-ohko',score:0.7,coverage:100,count:1,detail:'Test incoming damage'}));
          defenseTrial.previewRows=defenseTrial.baselineRows.map((row,index)=>({...row,kind:index===0 ? 'probable-2hko' : row.kind}));
        }""")
        # Use the normal UI path; the cached context keeps the deterministic profiles.
        self.evaluate("""() => {
          defenseTrial.enabled=true;
          const job=JSON.parse(defenseTrial.key);job.showThresholds=true;
          defenseTrial.key=JSON.stringify(job);renderTeamBuilder();
        }""")
        changed=self.page.locator('.tier-changed')
        self.assertEqual(changed.count(),1)
        self.assertEqual(changed.first.get_attribute('data-defense-species'),'Kingambit')
        self.assertIn('tier-improved',changed.first.get_attribute('class'))
        self.page.locator('#builderDefenseTrial').uncheck()
        self.assertEqual(self.page.locator('.tier-changed').count(),0)

    def test_equal_point_tier_changes_use_tier_direction_for_border_colors(self):
        self.load()
        self.evaluate("""() => {
          const before=[{species:getPokemonByName('Froslass'),kind:'might-ohko',coverage:100,detail:'Fixture'},
            {species:getPokemonByName('Alakazam'),kind:'probable-2hko',coverage:100,detail:'Fixture'}];
          window.colorPreview=highlightTierChanges(before.map((row,index)=>({...row,
            kind:index===0 ? 'probable-2hko' : 'might-ohko'})),before);
          state.builderPanel='defense';renderOffenseRows(colorPreview,'defense-colors','',Defense.groups);
        }""")
        self.assertEqual(self.evaluate("Offense.points({kind:'might-ohko'})"),self.evaluate("Offense.points({kind:'probable-2hko'})"))
        self.assertIn('tier-improved',self.page.locator('[data-defense-species="Froslass"]').get_attribute('class'))
        self.assertIn('tier-worsened',self.page.locator('[data-defense-species="Alakazam"]').get_attribute('class'))
        self.evaluate("state.builderPanel='offense';renderOffenseRows(colorPreview,'offense-colors')")
        self.assertIn('tier-worsened',self.page.locator('[data-offense-species="Froslass"]').get_attribute('class'))
        self.assertIn('tier-improved',self.page.locator('[data-offense-species="Alakazam"]').get_attribute('class'))

    def test_defense_worker_keeps_ui_responsive_cancels_and_rejects_stale_results(self):
        worker=(app_tests.ROOT/'defense-worker.js').read_text()
        # Hold the worker CPU-busy, making thread isolation measurable independently
        # of machine speed or changes to the search algorithm.
        busy="self.addEventListener('message',e=>{self.postMessage({type:'progress',evaluations:0,requestId:e.data.requestId});const deadline=performance.now()+1500;while(performance.now()<deadline){};},{once:true});\n"
        self.page.route('**/defense-worker.js*',lambda route:route.fulfill(status=200,content_type='application/javascript',body=busy+worker))
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Mega Chandelure',investment:{spa:32,spe:2}})];state.activeOurIndex=0;
          state.builderTopN=100;
          Defense.profile=()=>{throw Error('Defense profile ran on main thread');};
          Defense.bestSpread=()=>{throw Error('Defense search ran on main thread');};
          window.terminatedDefenseWorkers=0;
          const terminate=Worker.prototype.terminate;
          Worker.prototype.terminate=function(){terminatedDefenseWorkers++;return terminate.call(this);};render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="defense"]').click()
        self.page.wait_for_function('defenseTrial.evaluations===0')
        delay=self.evaluate('async()=>{const start=performance.now();await new Promise(resolve=>setTimeout(resolve,30));return performance.now()-start;}')
        self.assertLess(delay,300)
        self.evaluate('()=>{window.staleDefenseHandler=defenseTrial.worker.onmessage;}')
        self.page.locator('#offenseWeatherInput [data-field-value="Sand"]').click()
        self.evaluate("staleDefenseHandler({data:{type:'done',best:{investment:{}},rows:[]}})")
        self.assertIsNone(self.evaluate('defenseTrial.best'))
        self.assertFalse(self.evaluate('defenseTrial.finished'))
        start=time.monotonic()
        self.page.locator('#battleViewButton').click()
        self.assertLess(time.monotonic()-start,0.75)
        self.assertEqual(self.evaluate('state.view'),'battle')
        self.assertFalse(self.evaluate('defenseTrial.running'))
        self.assertIsNone(self.evaluate('defenseTrial.worker'))
        self.assertGreaterEqual(self.evaluate('terminatedDefenseWorkers'),2)


if __name__ == '__main__':
    unittest.main()
