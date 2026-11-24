import unittest
import test_app as app_tests


class BuilderDetailTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_rare_ohko_tier_keeps_weighted_probability_and_disguise(self):
        self.load()
        result=self.evaluate("""() => {
          const original=Battle.range;
          let disguise=false;
          Battle.range=(a,attacker,d,ours,move)=>{
            const rolls=move==='Ice Punch' ? [20,100] : [20,20];
            return {rolls,minDamage:20,maxDamage:Math.max(...rolls),hp:100,meta:{category:'Physical'},defenderAbility:disguise ? 'Disguise' : ''};
          };
          try {
            const ours=sanitizeTeamEntry({name:'Salamence'}),species={...getPokemonByName('Salamence'),stats:{...getPokemonByName('Salamence').stats,hp:100}};
            const run=()=>Defense.profile(getPokemonByName('Medicham'),species,ours,{moves:[{name:'Ice Punch',percent:5},{name:'Fire Punch',percent:100}],spreads:[{percent:100,investment:{atk:0}}]}).evaluate(ours.investment,true);
            const rare=run();disguise=true;const disguised=run();
            return {rare:rare.kind,chance:Offense.tierProbability(rare),disguised:disguised.kind,points:Offense.points(rare)};
          } finally {Battle.range=original;}
        }""")
        self.assertEqual(result['rare'],'might-ohko')
        self.assertAlmostEqual(result['chance'],0.025)
        self.assertEqual(result['points'],2.5)
        self.assertNotEqual(result['disguised'],'might-ohko')

    def test_baseline_and_preview_scores_tier_values_and_gain_rounding(self):
        self.load()
        self.evaluate('state.builderTopN=3')
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel=offense]').click()
        self.assertIn('Baseline:',self.page.locator('#builderScore').inner_text())
        self.assertTrue(self.page.locator('.tier-point-value').count()>0)
        result=self.evaluate("""() => {
          const baseline=builderOffenseRows(state.ourTeam[state.activeOurIndex]);
          const total=baseline.reduce((sum,row)=>sum+Offense.points(row)*(row.weight ?? 1),0);
          renderBuilderScore(baseline,baseline.map(row=>({...row,kind:'rest'})));
          moveTrial={finished:true,best:{to:'Flamethrower',from:'Protect',gain:1.23456789}};updateMoveTrialControl();
          return total.toFixed(1);
        }""")
        self.assertIn('Baseline: '+result,self.page.locator('#builderScore').inner_text())
        self.assertEqual(self.page.locator('#builderMoveTrialGain').inner_text(),'+1.2 points')

    def test_speed_badges_are_minimum_total_investment_to_beat_max_speed(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',nature:'Jolly',investment:{spe:0}})];state.activeOurIndex=0;
          builderRoster=()=>['Kingambit','Salamence','Garchomp','Dragapult'].map(getPokemonByName);render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        results=self.evaluate("""() => {
          const entry=state.ourTeam[0],selected=getPokemonByName(entry.name);
          return Battle.builderSpeedGroups(builderRoster(),selected,entry).groups.flatMap(g=>g.members).map(member=>{
            const target=Battle.speed(member.species,{investment:{spe:32},nature:{plus:'spe',minus:'spa'}});
            const expected=Array.from({length:Math.floor((selected.stats.spe+32)*1.1)-selected.stats.spe+1},(_,spe)=>spe).find(spe=>Battle.speed(selected,{...entry,nature:null,investment:{spe}})>target);
            return {hiddenZero:member.tier.kind==='always-slower' && member.outspeedPoints===0,name:member.species.name,lower:member.species.stats.spe<selected.stats.spe,expected:expected ?? null,actual:member.outspeedPoints};
          });
        }""")
        for row in results:
            badge=self.page.locator('[data-tier-species="'+row['name']+'"] .speed-investment-badge')
            self.assertEqual(badge.count(),1 if row['lower'] and not row['hiddenZero'] and row['actual'] is not None else 0)
            if row['lower'] and not row['hiddenZero']:
                self.assertEqual(row['actual'],row['expected'])
                if row['actual'] is not None:self.assertEqual(badge.inner_text(),str(row['actual']))

    def test_speed_badges_extend_with_nature_and_hide_always_slower_zero(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',nature:'Adamant',investment:{spe:32}})];state.activeOurIndex=0;
          builderRoster=()=>['Kingambit','Salamence'].map(getPokemonByName);render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        badge=self.page.locator('[data-tier-species=Salamence] .speed-investment-badge')
        self.assertGreater(int(badge.inner_text()),32)
        self.assertIn('Speed-boosting nature',badge.get_attribute('title'))
        tip=self.page.locator('[data-tier-species=Salamence]').get_attribute('title')
        self.assertIn('With a Speed-boosting nature',tip)
        self.assertTrue(tip.endswith(f'Invest {badge.inner_text()} or more to always be faster'))
        self.assertNotIn('Our Speed',self.page.locator('#builderSpeedTiers').inner_html())
        self.assertEqual(self.page.locator('[data-speed-group=always-slower] [data-tier-species=Kingambit] .speed-investment-badge').count(),0)
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.spe'),32)
        self.assertEqual(self.evaluate('state.ourTeam[0].nature.name'),'Adamant')

    def test_scarf_speed_badges_include_faster_base_speed_opponents(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Basculegion Male',item:'Choice Scarf',ability:'Adaptability',nature:'Modest',investment:{spe:0}})];state.activeOurIndex=0;
          builderRoster=()=>['Garchomp','Sneasler','Dragapult'].map(getPokemonByName);render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        results=self.evaluate("""() => {
          const entry=state.ourTeam[0],selected=getPokemonByName(entry.name);
          return Battle.builderSpeedGroups(builderRoster(),selected,entry).groups.flatMap(g=>g.members).map(member=>{
            const target=Battle.speed(member.species,{investment:{spe:32},nature:{plus:'spe',minus:'spa'}});
            const limit=Math.floor((selected.stats.spe+32)*1.1)-selected.stats.spe;
            const expected=Array.from({length:limit+1},(_,spe)=>spe).find(spe=>Battle.speed(selected,{...entry,nature:null,investment:{spe}})>target);
            return {id:member.species.id,actual:member.outspeedPoints,expected:expected ?? null};
          });
        }""")
        for row in results:
            self.assertEqual(row['actual'],row['expected'])
            badge=self.page.locator('[data-tier-species="'+row['id']+'"] .speed-investment-badge')
            self.assertEqual(badge.count(),int(row['expected'] is not None))
            if row['expected'] is not None:
                self.assertEqual(badge.inner_text(),str(row['expected']))
        self.assertTrue(any(row['actual'] is not None for row in results))

    def test_plus_two_speed_floette_tie_matches_investment_threshold(self):
        self.load()
        result=self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Kingambit',nature:'Adamant',investment:{spe:9}})];state.activeOurIndex=0;
          getPreferences(state.ourTeam[0],'our').speedStage=2;
          builderRoster=()=>['Floette'].map(getPokemonByName);state.builderPanel='speed';setView('builder');
          const selector='[data-tier-species="'+getPokemonByName('Floette').id+'"]';
          const atNine=document.querySelector(selector);
          const result={group:atNine.closest('[data-speed-group]').dataset.speedGroup,badge:atNine.querySelector('.speed-investment-badge').textContent};
          state.ourTeam[0].investment.spe=10;renderTeamBuilder();
          result.atTen=document.querySelector(selector).closest('[data-speed-group]').dataset.speedGroup;
          return result;
        }""")
        self.assertEqual(result,{'group':'max-speed-tie','badge':'10','atTen':'always-slower'})

    def test_battle_skulls_share_allies_count_and_reset(self):
        self.load()
        self.assertEqual(self.page.locator('#battleFaintedInput button').count(),4)
        self.page.locator('#battleFaintedInput [data-fainted-count="3"]').click()
        self.assertEqual(self.evaluate('state.alliesFainted'),3)
        self.assertEqual(self.page.locator('#offenseFaintedInput [aria-pressed=true]').get_attribute('data-fainted-count'),'3')
        self.page.locator('[data-format=Singles]').click()
        self.assertEqual(self.page.locator('#battleFaintedInput button').count(),6)
        self.page.locator('#battleFaintedInput [data-fainted-count="5"]').click()
        self.page.locator('[data-format=Doubles]').click()
        self.assertEqual(self.evaluate('state.alliesFainted'),3)
        self.page.locator('#resetBattleButton').click()
        self.assertEqual(self.page.locator('#battleFaintedInput [aria-pressed=true]').get_attribute('data-fainted-count'),'0')

    def test_battle_skulls_boost_supreme_overlord_for_each_attacking_side(self):
        self.load(frozen_usage=True)
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Kingambit',ability:'Supreme Overlord',moveSet:['Kowtow Cleave']})];
          state.activeOurIndex=0;state.opponentList=[sanitizeOpponentEntry({name:'Garchomp'})];state.activeOpponentIndex=0;render();
        }""")
        before=self.evaluate("calculateMoveRange(state.ourTeam[0],state.opponentList[0],'Kowtow Cleave',0).high")
        self.page.locator('#battleFaintedInput [data-fainted-count="3"]').click()
        after=self.evaluate("calculateMoveRange(state.ourTeam[0],state.opponentList[0],'Kowtow Cleave',0).high")
        self.assertGreater(after,before*1.2)
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Medicham'})];state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];
          getOpponentPreferences().abilityChoice='Supreme Overlord';render();
        }""")
        self.page.locator('[data-damage-direction=incoming]').click()
        self.assertEqual(self.page.locator('#battleFaintedInput [aria-pressed=true]').get_attribute('data-fainted-count'),'0')
        before=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Kowtow Cleave').range.high")
        self.page.locator('#battleFaintedInput [data-fainted-count="3"]').click()
        after=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Kowtow Cleave').range.high")
        self.assertGreater(after,before*1.2)
        self.assertEqual(self.evaluate('[state.alliesFainted,state.opponentsFainted]'),[3,3])
        self.assertEqual(self.page.locator('#battleFaintedInput').get_attribute('aria-label'),'fainted opponents')
        self.page.locator('#battleFaintedInput [data-fainted-count="1"]').click()
        self.page.locator('[data-damage-direction=outgoing]').click()
        self.assertEqual(self.page.locator('#battleFaintedInput [aria-pressed=true]').get_attribute('data-fainted-count'),'3')
        self.assertEqual(self.evaluate('[state.alliesFainted,state.opponentsFainted]'),[3,1])
