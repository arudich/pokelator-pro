import unittest
import test_app as app_tests


class MultiHitTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_battle_ranges_assume_hits_but_keep_immunities_and_hit_count_variation(self):
        self.load()
        result=self.evaluate("""() => {
          const ours=sanitizeTeamEntry({name:'Aerodactyl',nature:'Jolly',investment:{atk:32},moveSet:['Dual Wingbeat']});
          const target=sanitizeOpponentEntry({name:'Overqwil'});
          const raw=Battle.range(getPokemonByName(ours.name),ours,getPokemonByName(target.name),target,'Dual Wingbeat');
          const shown=calculateMoveRange(ours,target,'Dual Wingbeat');
          const mouse=sanitizeTeamEntry({name:'Maushold',moveSet:['Population Bomb']});
          const immune=calculateMoveRange(mouse,sanitizeOpponentEntry({name:'Gengar'}),'Population Bomb');
          const rock=MultiHit.plan({...Battle.moveMeta('Rock Blast'),...BALANCE_MOVES.moves.rockblast},{},{},{assumeHits:true});
          state.ourTeam=[ours];state.activeOurIndex=0;state.opponentList=[target];state.activeOpponentIndex=0;render();
          return {rawLow:raw.low,shownLow:shown.low,hits:shown.hitModel.expected,immune:immune.high,
            counts:rock.counts.map(([n])=>n),damage:document.querySelector('[data-move="Dual Wingbeat"]').textContent};
        }""")
        self.assertEqual(result['rawLow'],0)
        self.assertGreater(result['shownLow'],0)
        self.assertEqual(result['hits'],2)
        self.assertEqual(result['immune'],0)
        self.assertEqual(result['counts'],[2,3,4,5])
        self.assertIn('2 hits avg',result['damage'])

    def test_hit_distributions_include_misses_items_and_abilities(self):
        self.load()
        result=self.evaluate("""() => {
          const pop={...Battle.moveMeta('Population Bomb'),...BALANCE_MOVES.moves.populationbomb};
          const rock={...Battle.moveMeta('Rock Blast'),...BALANCE_MOVES.moves.rockblast};
          const run=(meta,item='',ability='',target={})=>MultiHit.plan(meta,{item,ability},target);
          return {pop:run(pop),lens:run(pop,'Wide Lens'),dice:run(pop,'Loaded Dice'),link:run(pop,'','Skill Link'),
            guard:run(pop,'','No Guard'),rock:run(rock),rockDice:run(rock,'Loaded Dice'),rockLink:run(rock,'','Skill Link'),
            evasion:run(pop,'Wide Lens','',{item:'Bright Powder'}),
            fixed:run({...Battle.moveMeta('Double Hit'),...BALANCE_MOVES.moves.doublehit}),
            triple:run({...Battle.moveMeta('Triple Axel'),...BALANCE_MOVES.moves.tripleaxel})};
        }""")
        for model in result.values():
            self.assertAlmostEqual(sum(p for _,p in model['counts']),1)
        self.assertAlmostEqual(result['pop']['expected'],sum(0.9**n for n in range(1,11)))
        self.assertAlmostEqual(result['lens']['expected'],sum(0.99**n for n in range(1,11)))
        self.assertAlmostEqual(result['dice']['expected'],6.3)
        self.assertAlmostEqual(dict(result['lens']['counts'])[10],0.99**10)
        self.assertAlmostEqual(dict(result['dice']['counts'])[0],0.1)
        self.assertEqual({n for n,_ in result['dice']['counts']},{0,4,5,6,7,8,9,10})
        self.assertAlmostEqual(result['link']['expected'],9)
        self.assertEqual(result['guard']['expected'],10)
        self.assertAlmostEqual(result['rock']['expected'],0.9*3.1)
        self.assertAlmostEqual(result['rockDice']['expected'],0.9*4.5)
        self.assertAlmostEqual(result['rockLink']['expected'],0.9*5)
        self.assertLess(result['evasion']['expected'],result['lens']['expected'])
        self.assertAlmostEqual(result['fixed']['expected'],1.8)
        self.assertAlmostEqual(result['triple']['expected'],0.9+0.9**2+0.9**3)

    def test_population_bomb_is_one_complete_ko_attempt_and_technician_modifies_each_hit(self):
        self.load()
        result=self.evaluate("""() => {
          const s=getPokemonByName('Maushold'),d=getPokemonByName('Snorlax');
          const run=(item,ability='Technician')=>{
            const a=sanitizeTeamEntry({name:s.name,item,ability,nature:'Jolly',investment:{atk:32},moveSet:['Population Bomb']});
            const range=Battle.range(s,a,d,{ability:'No Ability',investment:{}},'Population Bomb');
            const row=Offense.analyze(s,a,d,[{percent:100,investment:defaultInvestment()}]);
            return {expected:range.expectedDamage,hits:range.hitModel.expected,kind:row.kind,ohko:row.ohkoProbability,
              badge:Offense.tierProbability(row),error:row.error || null};
          };
          return {plain:run(''),lens:run('Wide Lens'),noTech:run('Wide Lens','Friend Guard')};
        }""")
        self.assertIsNone(result['lens']['error'])
        self.assertEqual(result['lens']['kind'],'probable-ohko')
        self.assertGreater(result['lens']['ohko'],0.8)
        self.assertAlmostEqual(result['lens']['badge'],result['lens']['ohko'])
        self.assertGreater(result['lens']['expected'],result['plain']['expected'])
        self.assertGreater(result['lens']['expected'],result['noTech']['expected']*1.4)

    def test_multi_hit_breaks_sash_disguise_and_multiscale_and_contact_can_stop_it(self):
        self.load()
        result=self.evaluate("""() => {
          const s=getPokemonByName('Maushold'),a=sanitizeTeamEntry({name:s.name,ability:'Technician',investment:{atk:32},item:'Wide Lens'});
          const run=(name,ability,item='',attacker=a,move='Bullet Seed')=>{
            const d=getPokemonByName(name),range=Battle.range(s,attacker,d,{ability,item,investment:{}},move);
            return {expected:range.expectedDamage,error:range.error || null,model:range.hitModel,
              chance:Offense.firstHitProbability([{percent:100,range}])};
          };
          const snorlax=getPokemonByName('Snorlax'),weak={...snorlax,stats:{...snorlax.stats,hp:30}};
          const ko=item=>{const range=Battle.range(s,a,weak,{ability:'No Ability',item,investment:{}},'Population Bomb');
            return Offense.firstHitProbability([{percent:100,range}]);};
          const profile=Defense.profile(s,snorlax,sanitizeTeamEntry({name:'Snorlax',item:'Focus Sash'}),
            {moves:[{name:'Population Bomb',percent:100}],spreads:[{percent:100,investment:{atk:32}}]},
            {attackerAbility:'Technician',attackerItem:'Wide Lens'});
          const toucannon=getPokemonByName('Toucannon'),mimikyu=getPokemonByName('Mimikyu');
          const seeds=Battle.range(toucannon,{...sanitizeTeamEntry({name:'Toucannon',ability:'Skill Link',item:'Choice Band',
            nature:'Adamant',investment:{atk:32}}),boosts:{atk:2}},mimikyu,{ability:'Disguise',investment:{}},'Bullet Seed');
          return {sash:ko('Focus Sash'),none:ko(''),disguise:run('Mimikyu','Disguise'),
            disguiseKO:Offense.firstHitProbability([{percent:100,range:seeds}]),
            dragon:run('Dragonite','Multiscale'),noScale:run('Dragonite','No Ability'),
            helmet:run('Snorlax','No Ability','Rocky Helmet',a,'Population Bomb'),
            pads:run('Snorlax','No Ability','Rocky Helmet',{...a,item:'Protective Pads'},'Population Bomb'),
            defense:profile.evaluate(defaultInvestment(),true).error || null};
        }""")
        self.assertGreater(result['sash'],0.9)
        self.assertLessEqual(result['sash'],result['none'])
        self.assertGreater(result['disguise']['expected'],0)
        self.assertGreater(result['disguiseKO'],0.99)
        self.assertGreater(result['noScale']['expected'],result['dragon']['expected'])
        self.assertGreater(result['dragon']['expected'],result['noScale']['expected']*0.6)
        self.assertTrue(result['helmet']['model']['contactLimited'])
        self.assertLessEqual(max(n for n,_ in result['helmet']['model']['counts']),7)
        self.assertEqual(max(n for n,_ in result['pads']['model']['counts']),10)
        self.assertIsNone(result['defense'])

    def test_balance_samples_the_same_per_attack_hit_distribution(self):
        self.load()
        means=self.evaluate("""() => {
          const s=getPokemonByName('Maushold'),d=getPokemonByName('Blastoise');
          return ['', 'Wide Lens','Loaded Dice'].map(item=>{
            const rng=Balance.random('hit-distribution-'+item);let total=0;
            for(let trial=0;trial<1200;trial++) {
              const a=Balance.side(s,{item,ability:'Friend Guard',investment:{spe:32}},['Population Bomb']);
              const b=Balance.side(d,{ability:'No Ability',investment:{}},['Body Slam']);
              let landed=0;
              const range=(attacker,defender,name,hits)=>{
                if(attacker===a && hits!==undefined) landed=hits;
                return {rolls:Array.from({length:hits || 1},()=>[attacker===a ? 1 : 999]),hp:defender.maxHP,
                  defenderAbility:defender.entry.ability,meta:{type:'Normal',category:'Physical'}};
              };
              Balance.duel(a,b,{},range,rng);total+=landed;
            }
            return total/1200;
          });
        }""")
        for actual,expected in zip(means,[sum(0.9**n for n in range(1,11)),sum(0.99**n for n in range(1,11)),6.3]):
            self.assertAlmostEqual(actual,expected,delta=0.25)

    def test_maushold_ui_has_ohko_targets_and_battle_labels_complete_attack(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Maushold',ability:'Friend Guard',item:'Wide Lens',nature:'Jolly',
            investment:{hp:2,atk:32,spe:32},moveSet:['Follow Me','Protect','Population Bomb','Encore']})];
          state.opponentList=[sanitizeOpponentEntry({name:'Snorlax'})];state.activeOurIndex=state.activeOpponentIndex=0;render();
        }""")
        self.assertIn('full attack',self.page.locator('[data-move="Population Bomb"]').inner_text())
        self.assertIn('10 hits avg',self.page.locator('[data-move="Population Bomb"]').inner_text())
        self.evaluate("state.builderTopN=10;state.builderPanel='offense';setView('builder')")
        self.page.wait_for_selector('[data-offense-species]')
        self.assertGreater(self.page.locator('[data-offense-group="probable-ohko"] [data-offense-species], [data-offense-group="might-ohko"] [data-offense-species]').count(),0)
