import time
import unittest
import test_app as app_tests


class BalanceTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    evaluate = app_tests.AppTests.evaluate

    def load(self):
        app_tests.AppTests.load(self)
        self.page.add_script_tag(url=self.url+'/data/balance-moves.js')

    def test_thresholds_fixed_core_and_weighted_two_slot_sampling(self):
        self.load()
        result=self.evaluate("""() => {
          const rng=Balance.random('moveset-check'),counts={rare:0,common:0,core:0},sizes=[];
          for(let i=0;i<5000;i++) {
            const moves=Balance.sampleMoves([{name:'Protect',percent:100},{name:'Body Slam',percent:95},
              {name:'Ice Punch',percent:5},{name:'Fire Punch',percent:45},{name:'Thunder Punch',percent:45},{name:'Rock Slide',percent:5}],rng);
            if(moves.includes('Ice Punch')) counts.rare++;
            if(moves.includes('Fire Punch')) counts.common++;
            if(moves.includes('Protect') && moves.includes('Body Slam')) counts.core++;
            if(new Set(moves).size!==moves.length) throw Error('Duplicate move');
            sizes.push(moves.length);
          }
          return {counts,max:Math.max(...sizes),tiers:[[85,15],[84,16],[51,49],[50,50],[16,84],[15,85],[87,1],[10,30],[0,0]].map(([w,l])=>Balance.category(w,l,100))};
        }""")
        self.assertEqual(result['tiers'],['win','favored','favored','unfavored','unfavored','lose','win','lose','unmodeled'])
        self.assertLessEqual(result['max'],4)
        self.assertEqual(result['counts']['core'],5000)
        self.assertTrue(500<=result['counts']['rare']<=850)
        self.assertTrue(4100<=result['counts']['common']<=4600)

    def test_dire_claw_random_status_survives_projection_and_respects_blockers(self):
        self.load()
        result=self.evaluate("""() => {
          const base={investment:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},ability:'No Ability'};
          const run=(choice,{terrain='',ability='No Ability',item='',proc=0.1}={})=>{
            const a=Balance.side(getPokemonByName('Sneasler'),base,['Dire Claw']);
            const b=Balance.side(getPokemonByName('Blastoise'),{...base,ability,item},['Body Slam']);
            const applied=[];let current=b.entry.status || '';
            Object.defineProperty(b.entry,'status',{get:()=>current,set:value=>{current=value;if(value) applied.push(value)}});
            const rolls=[0.1,0.1,proc,choice],rng=()=>rolls.length ? rolls.shift() : 0.9;
            const range=(attacker,defender)=>({rolls:[attacker===a ? 10 : 999],hp:defender.maxHP,
              defenderAbility:defender.entry.ability,meta:{type:attacker===a ? 'Poison' : 'Normal',category:'Physical'}});
            Balance.duel(a,b,{terrain},range,rng);
            return applied[0] || '';
          };
          return {poison:run(0.1),paralysis:run(0.5),sleep:run(0.9),misty:run(0.1,{terrain:'Misty'}),
            electricSleep:run(0.9,{terrain:'Electric'}),shield:run(0.1,{ability:'Shield Dust'}),cloak:run(0.1,{item:'Covert Cloak'}),noProc:run(0.1,{proc:0.4})};
        }""")
        self.assertEqual(result,{'poison':'psn','paralysis':'par','sleep':'slp','misty':'','electricSleep':'','shield':'','cloak':'','noProc':''})

    def test_lum_berry_wakes_secondary_sleep_without_losing_a_turn(self):
        self.load()
        result=self.evaluate("""() => {
          const base={investment:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},ability:'No Ability'};
          const a=Balance.side(getPokemonByName('Sneasler'),base,['Dire Claw']);
          const b=Balance.side(getPokemonByName('Blastoise'),{...base,item:'Lum Berry'},['Body Slam']);
          const rolls=[0.1,0.1,0.1,0.9],rng=()=>rolls.length ? rolls.shift() : 0.9;
          let hits=0;
          const range=(attacker,defender,name,count)=>{
            if(attacker===a && count!==undefined) hits++;
            return {rolls:[attacker===a ? 10 : 999],hp:defender.maxHP,defenderAbility:defender.entry.ability,meta:{type:attacker===a ? 'Poison' : 'Normal',category:'Physical'}};
          };
          Balance.duel(a,b,{},range,rng);
          return {hits,status:b.entry.status,sleep:b.sleep,item:b.entry.item};
        }""")
        self.assertEqual(result,{'hits':1,'status':'','sleep':0,'item':''})

    def test_champions_self_drop_metadata_wins_when_engine_data_lags(self):
        self.load()
        result=self.evaluate("""() => {
          window.BALANCE_MOVES.moves.overheat.self={boosts:{spa:-1}};
          const base={investment:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},ability:'No Ability'};
          const a=Balance.side(getPokemonByName('Sneasler'),base,['Overheat']);
          const b=Balance.side(getPokemonByName('Blastoise'),base,['Body Slam']);
          const range=(attacker,defender)=>({rolls:[attacker===a ? 10 : 999],hp:defender.maxHP,
            defenderAbility:defender.entry.ability,meta:{type:'Normal',category:'Special'}});
          Balance.duel(a,b,{},range,()=>0.5);
          return a.entry.boosts.spa;
        }""")
        self.assertEqual(result,-1)

    def test_only_top_two_lock_even_when_more_moves_exceed_half_usage(self):
        self.load()
        result=self.evaluate("""() => {
          const moves=[{name:'Protect',percent:90},{name:'Body Slam',percent:85},{name:'Ice Punch',percent:70},
            {name:'Fire Punch',percent:60},{name:'Thunder Punch',percent:55}];
          const rng=Balance.random('top-two'),omitted={};
          for(let i=0;i<1000;i++) {
            const set=Balance.sampleMoves(moves,rng);
            if(!set.includes('Protect') || !set.includes('Body Slam') || set.length!==4) throw Error('Wrong core or slot count');
            for(const move of moves.slice(2)) if(!set.includes(move.name)) omitted[move.name]=(omitted[move.name] || 0)+1;
          }
          return {omitted,weak:Balance.movesetModel([{name:'Protect',percent:55},{name:'Body Slam',percent:40}]).warnings};
        }""")
        self.assertEqual(set(result['omitted']),{'Ice Punch','Fire Punch','Thunder Punch'})
        self.assertTrue(all(value>100 for value in result['omitted'].values()))
        self.assertTrue(any('Weak fixed pair' in warning for warning in result['weak']))

    def test_clefable_always_has_moonblast_under_fixed_core_rule(self):
        self.load()
        result=self.evaluate("""async () => {
          const ours=sanitizeTeamEntry({name:'Mega Medicham',nature:'Jolly',investment:{atk:32,spe:32},moveSet:['Close Combat','Fake Out','Ice Punch','Poison Jab']});
          const species=getPokemonByName('Clefable'),usage=getUsage(species);
          return await Balance.analyze(getPokemonByName(ours.name),ours,{species,usage,field:{},abilities:[{name:'Magic Guard',percent:100}]},{samples:64});
        }""")
        self.assertEqual([move['name'] for move in result['coreModel']['core']],['Follow Me','Moonblast'])
        self.assertEqual(result['unknown'],0)
        self.assertEqual(result['wins']+result['losses']+result['draws'],64)

    def test_speed_items_priority_sash_and_ties_change_duel_winner(self):
        self.load()
        result=self.evaluate("""() => {
          const ours={id:'Snorlax',name:'Snorlax',types:['Normal'],stats:{hp:100,atk:100,def:100,spa:100,spd:100,spe:100}};
          const foe={...ours,id:'Garchomp',name:'Garchomp',stats:{...ours.stats,spe:80}};
          const base={investment:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},ability:'No Ability'};
          const range=(a,b)=>({rolls:[200],minDamage:200,maxDamage:200,hp:b.maxHP,defenderAbility:b.entry.ability,meta:{type:'Normal'}});
          const run=(a={},b={},move='Body Slam',rng=()=>0.5,target=foe)=>Balance.duel(Balance.side(ours,{...base,...a},[move]),Balance.side(target,{...base,...b},['Body Slam']),{},range,rng).winner;
          return {normal:run(),scarf:run({},{item:'Choice Scarf'}),ourSash:run({item:'Focus Sash'},{item:'Choice Scarf'}),
            theirSash:run({},{item:'Focus Sash'}),priority:run({},{item:'Choice Scarf'},'Quick Attack'),
            priorityFinisher:Balance.duel(Balance.side(ours,base,['Body Slam','Quick Attack']),Balance.side(foe,{...base,item:'Choice Scarf'},['Body Slam']),{},
              (a,b,name)=>({...range(a,b),rolls:[name==='Quick Attack' ? 150 : 300]}),()=>0.5).winner,
            tieUs:run({}, {},'Body Slam',()=>0.25,ours),tieThem:run({}, {},'Body Slam',()=>0.75,ours)};
        }""")
        self.assertEqual(result,{'normal':'us','scarf':'them','ourSash':'us','theirSash':'them','priority':'us','priorityFinisher':'us','tieUs':'us','tieThem':'them'})

    def test_contact_damage_items_can_reverse_a_duel(self):
        self.load()
        result=self.evaluate("""() => {
          const species={id:'Snorlax',name:'Snorlax',types:['Normal'],stats:{hp:100,atk:100,def:100,spa:100,spd:100,spe:100}};
          const entry={investment:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},ability:'No Ability'};
          const range=(a,b)=>({rolls:[10],minDamage:10,maxDamage:10,hp:100,defenderAbility:b.entry.ability,meta:{type:'Normal',category:'Physical'}});
          const run=item=>Balance.duel(Balance.side(species,entry,['Body Slam']),Balance.side(species,{...entry,item},[]),{},range,()=>0.5).winner;
          return {none:run(''),helmet:run('Rocky Helmet')};
        }""")
        self.assertEqual(result,{'none':'us','helmet':'them'})

    def test_item_usage_distribution_changes_estimated_win_probability(self):
        self.load()
        result=self.evaluate("""async () => {
          const original=Battle.range;
          Battle.range=(a,attacker,b,defender)=>({rolls:[200],minDamage:200,maxDamage:200,hp:100,defenderAbility:defender.ability,meta:{type:'Normal'}});
          try {
            const oursSpecies={id:'Snorlax',name:'Snorlax',types:['Normal'],stats:{hp:100,atk:100,def:100,spa:100,spd:100,spe:100}};
            const species={...oursSpecies,id:'Garchomp',name:'Garchomp',stats:{...oursSpecies.stats,spe:80}};
            const investment={hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
            const ours={name:'Snorlax',investment,ability:'No Ability',moveSet:['Body Slam']};
            const usage={spreads:[{percent:100,investment}],moves:[{name:'Body Slam',percent:100}],natures:[{name:'Serious',percent:100}]};
            const analyze=items=>Balance.analyze(oursSpecies,ours,{species,usage:{...usage,items},field:{},abilities:[{name:'No Ability',percent:100}]},{samples:128});
            return {none:await analyze([]),scarf:await analyze([{name:'Choice Scarf',percent:100}]),mixed:await analyze([{name:'Choice Scarf',percent:50}])};
          } finally {Battle.range=original;}
        }""")
        self.assertEqual(result['none']['kind'],'win')
        self.assertEqual(result['scarf']['kind'],'lose')
        self.assertTrue(0.35<result['mixed']['winProbability']<0.65)
        self.assertEqual(result['none']['first'],128)
        self.assertEqual(result['scarf']['first'],0)

    def test_mega_items_are_fixed_in_duels_and_hover(self):
        self.load()
        result=self.evaluate("""async () => {
          const original=Battle.range,seen={};
          Battle.range=(a,attacker,b,defender,...rest)=>{
            for(const [species,entry] of [[a,attacker],[b,defender]]) {
              if(species.isMega) (seen[species.id] ||= new Set()).add(entry.item);
            }
            return original(a,attacker,b,defender,...rest);
          };
          try {
            const oursSpecies=getPokemonByName('Mega Medicham'),species=getPokemonByName('Mega Garchomp');
            const ours=sanitizeTeamEntry({name:oursSpecies.name,investment:{atk:32,spe:32},moveSet:['Ice Punch','Close Combat']});
            ours.item='Life Orb'; // Even a stale invalid saved item must be overridden.
            const usage=getUsage(species),items=JSON.stringify(usage.items);
            const analyze=items=>Balance.analyze(oursSpecies,ours,{species,usage:{...usage,items},field:{},abilities:[{name:'Sand Force',percent:100}]},{samples:32,seed:'mega-items'});
            const scarf=await analyze([{name:'Choice Scarf',percent:100}]);
            const sash=await analyze([{name:'Focus Sash',percent:100}]);
            return {scarf,sash,seen:Object.fromEntries(Object.entries(seen).map(([id,set])=>[id,[...set]])),
              expected:{[oursSpecies.id]:[Battle.requiredMegaItem(oursSpecies)],[species.id]:[Battle.requiredMegaItem(species)]},
              unchanged:items===JSON.stringify(usage.items)};
          } finally {Battle.range=original;}
        }""")
        self.assertEqual(result['seen'],result['expected'])
        self.assertEqual(result['scarf'],result['sash'])
        self.assertIn('Opponent item: Garchompite (required Mega Stone; 100%)',result['scarf']['detail'])
        self.assertNotIn('Choice Scarf',result['scarf']['detail'])
        self.assertNotIn('Focus Sash',result['sash']['detail'])
        self.assertTrue(result['unchanged'])

    def test_balance_worker_renders_usage_weighted_matchups_without_editing_team(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',nature:'Jolly',investment:{atk:32,spe:32},moveSet:['Dragon Claw','Earthquake']})];
          state.activeOurIndex=0;state.builderTopN=3;render();
        }""")
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        library=self.evaluate('localStorage.getItem(LIBRARY_KEY)')
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="balance"]').click()
        self.page.wait_for_function('balanceTrial.finished',timeout=60000)
        self.assertIsNone(self.evaluate('balanceTrial.error || null'))
        self.assertEqual(self.page.locator('#builderPanelTitle').inner_text(),'Balance')

        self.assertEqual(self.page.locator('[data-balance-species]').count(),self.evaluate('balanceTrial.total'))
        self.assertTrue(self.evaluate('balanceTrial.rows.every(row=>row.wins+row.losses+row.draws+row.unknown===256)'))
        self.assertIn('Estimated wins',self.page.locator('[data-balance-species]').first.get_attribute('title'))
        self.assertTrue(self.page.locator('#offenseFaintedInput').is_visible())
        self.assertTrue(self.page.locator('#defenseFaintedInput').is_visible())
        self.assertTrue(self.page.locator('#builderDefenseTrialRow').is_hidden())
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.assertEqual(self.evaluate('localStorage.getItem(LIBRARY_KEY)'),library)
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        self.page.locator('#offenseWeatherInput [data-field-value="Sand"]').click()
        self.page.locator('#battleViewButton').click()
        self.assertIsNone(self.evaluate('balanceTrial.worker'))
        self.page.locator('#teamBuilderButton').click()
        self.page.reload()
        self.assertEqual(self.page.locator('#builderPanelTitle').inner_text(),'Balance')

    def test_engine_current_hp_and_multi_hit_adapter_support_duel_state(self):
        self.load()
        result=self.evaluate("""() => {
          const species=getPokemonByName('Garchomp'),ours=sanitizeTeamEntry({name:'Garchomp',investment:{atk:32}});
          const target=getPokemonByName('Dragonite'),defender=sanitizeTeamEntry({name:'Dragonite',ability:'Multiscale'});
          const full=Battle.range(species,ours,target,defender,'Dragon Claw');
          const chipped=Battle.range(species,ours,target,{...defender,curHP:full.hp-1},'Dragon Claw');
          const grass=getPokemonByName('Rillaboom'),attacker=sanitizeTeamEntry({name:'Rillaboom',investment:{atk:32}});
          const one=Battle.range(grass,attacker,species,ours,'Bullet Seed',{hits:1});
          const three=Battle.range(grass,attacker,species,ours,'Bullet Seed',{hits:3});
          return {full,chipped,one,three};
        }""")
        self.assertGreater(result['chipped']['minDamage'],result['full']['maxDamage'])
        self.assertEqual(result['three']['hits'],3)
        self.assertEqual(result['three']['minDamage'],result['one']['minDamage']*3)

    def test_balance_worker_keeps_ui_responsive_and_rejects_stale_rows(self):
        worker=(app_tests.ROOT/'balance-worker.js').read_text()
        busy="self.postMessage({type:'progress'});const deadline=performance.now()+1500;while(performance.now()<deadline){};\n"
        self.page.route('**/balance-worker.js*',lambda route:route.fulfill(status=200,content_type='application/javascript',body=busy+worker))
        self.load()
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="balance"]').click()
        self.page.wait_for_function('balanceTrial.started')
        delay=self.evaluate('async()=>{const start=performance.now();await new Promise(r=>setTimeout(r,30));return performance.now()-start;}')
        self.assertLess(delay,300)
        self.evaluate('()=>{window.oldBalanceHandler=balanceTrial.worker.onmessage;}')
        self.page.locator('#offenseWeatherInput [data-field-value="Sun"]').click()
        self.evaluate("oldBalanceHandler({data:{type:'row',row:{scenarioId:'stale'}}})")
        self.assertFalse(self.evaluate("balanceTrial.rows.some(r=>r.scenarioId==='stale')"))
        start=time.monotonic()
        self.page.locator('#battleViewButton').click()
        self.assertLess(time.monotonic()-start,0.75)
        self.assertIsNone(self.evaluate('balanceTrial.worker'))



if __name__ == '__main__':
    unittest.main()
