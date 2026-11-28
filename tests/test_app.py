"""Run against the actual static app in Chromium; all game scripts are local.

    .venv/bin/python -m unittest discover -s tests -v
"""
import functools
import http.server
import json
import os
import threading
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 900})
        # Network-independent tests; real asset availability is checked separately.
        self.context.route('https://**/*', lambda route: route.abort())
        self.context.add_init_script("localStorage.setItem('pokelator-pro-tutorial-seen-v1','true')")
        # Exercise extreme but valid usage changes without changing game mechanics.
        shifted=os.getenv('POKELATOR_TEST_META')=='shifted'
        mutation=(ROOT/'tests/fixtures/meta-shift.js').read_text()
        for filename,variable,kind in [('champions-roster.js','CHAMPIONS_ROSTER','roster'),('meta-usage.js','META_USAGE','meta')]:
            def serve(route,request=None,filename=filename,variable=variable,kind=kind):
                source=(ROOT/'data'/filename).read_text()
                body=source+'\n('+mutation+')(window.'+variable+','+json.dumps(kind)+','+json.dumps(shifted)+',window.__TEST_USAGE_FIXTURES || {});'
                route.fulfill(status=200,content_type='application/javascript',body=body)
            self.context.route('**/data/'+filename+'*',serve)
        self.page = self.context.new_page()
        self.page.set_default_timeout(5000)
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [], 'Browser runtime errors')

    def load(self, format=None, frozen_usage=False):
        if frozen_usage:
            fixtures=json.loads((ROOT/'tests/usage_fixtures.json').read_text())
            self.context.add_init_script('window.__TEST_USAGE_FIXTURES='+json.dumps(fixtures)+';')
        response = self.page.goto(self.url)
        self.assertEqual(response.status, 200)
        self.page.wait_for_selector('.move-row')
        if format:
            self.page.locator(f'[data-format="{format}"]').click()

    def evaluate(self, code, arg=None):
        return self.page.evaluate(code, arg)

    def set_nature_preference(self, role, choice):
        # Exercise persisted pre-comparison overrides used by builder calculations.
        self.evaluate("args=>{getOpponentPreferences()[args.role+'NatureChoice']=args.choice;savePreferences();renderDamageRanges();}",{'role':role,'choice':choice})

    def reset_nature_preferences(self):
        self.evaluate("getOpponentPreferences().defenseNatureChoice=getOpponentPreferences().offenseNatureChoice='auto';savePreferences();renderDamageRanges()")

    def fixture(self):
        self.evaluate('''() => {
          window.sneasler = sanitizeTeamEntry({name:'Sneasler', nature:'Jolly',
            item:'Focus Sash', ability:'Pressure', investment:{hp:1, atk:32, spe:32}});
          window.kingambit = sanitizeTeamEntry({name:'Kingambit', nature:'Adamant',
            item:'Leftovers', ability:'Defiant', investment:{atk:32,def:1}});
        }''')

    def test_golden_damage_executes_eight_cases(self):
        self.load("Singles")
        self.fixture()
        fixtures = json.loads((ROOT / 'tests/golden_cases.json').read_text())
        for case in fixtures:
            with self.subTest(move=case['move']):
                result = self.evaluate(f"calculateMoveRange({case['attacker']},{case['defender']},{json.dumps(case['move'])})")
                self.assertNotIn('error', result)
                self.assertEqual([result['minDamage'], result['maxDamage']], case['damage'])
                actual = self.evaluate(f"[formatPercent({result['low']}),formatPercent({result['high']})]")
                self.assertEqual(actual, case['percent'])
                if case['move'] == 'Acrobatics':
                    self.assertEqual(len(result['rolls']), 16)

    def test_champions_stats_and_limits(self):
        self.load()
        self.fixture()
        self.assertEqual(self.evaluate("[getEffectiveStat(sneasler,'hp'),getEffectiveStat(sneasler,'atk'),getEffectiveStat(sneasler,'spe')]"), [156, 182, 189])
        self.assertEqual(self.evaluate("[MAX_TEAM_POINTS,MAX_STAT_POINTS]"), [66,32])
        self.assertEqual(self.evaluate("getPokemonByName('Mega Garchomp').stats.spe"),112)
        self.assertEqual(self.evaluate("getEffectiveStat(sanitizeTeamEntry({name:'Mega Garchomp'}),'spe')"),112)

    def test_type_immunities_and_correct_chart(self):
        self.load()
        self.fixture()
        for defender, move in [('Gengar','Close Combat'), ('Charizard','Earthquake'), ('Kingambit','Dire Claw')]:
            result = self.evaluate(f"calculateMoveRange(sneasler,sanitizeTeamEntry({{name:{json.dumps(defender)}}}),{json.dumps(move)})")
            self.assertEqual(result['maxDamage'],0)
        # Ghost is super effective against Psychic; Electric is neutral to Steel.
        self.assertEqual(self.evaluate("Battle.generation.types.get('ghost').effectiveness.Psychic"),2)
        self.assertEqual(self.evaluate("Battle.generation.types.get('electric').effectiveness.Steel"),1)

    def test_status_and_unknown_moves(self):
        self.load()
        self.fixture()
        self.assertEqual(self.evaluate("calculateMoveRange(kingambit,sneasler,'Swords Dance').maxDamage"),0)
        self.assertEqual(self.evaluate("calculateMoveRange(kingambit,sneasler,'not a move').error"),'Unknown move')
        self.assertIsNone(self.evaluate("Battle.moveMeta('')"))

    def test_defense_tiers_affect_relevant_stat_and_hp(self):
        self.load()
        self.fixture()
        ranges = self.evaluate("[0,35,64].map(t=>calculateMoveRange(sneasler,kingambit,'Close Combat',t).high)")
        self.assertGreater(ranges[0], ranges[1])
        self.assertGreater(ranges[1], ranges[2])
        self.assertEqual(self.evaluate("getDefenseInvestmentLevels().map(t=>t.points)"),[0,35,64])
        allocation=self.evaluate("calculateMoveRange(sneasler,kingambit,'Close Combat',35).allocation")
        self.assertEqual(allocation['hp']+allocation['defense'],35)
        self.assertLessEqual(max(allocation['hp'],allocation['defense']),32)
        self.assertEqual(allocation['stat'],'def')
        full=self.evaluate("calculateMoveRange(sneasler,kingambit,'Close Combat',64).allocation")
        self.assertEqual([full['hp'],full['defense']],[32,32])

    def test_items_are_conditional(self):
        self.load()
        self.fixture()
        result = self.evaluate('''() => {
          const hit = (item, move) => calculateMoveRange({...sneasler,item},kingambit,move).maxDamage;
          return [hit('', 'Close Combat'),hit('Choice Scarf','Close Combat'),
            hit('Black Glasses','Close Combat'),hit('Expert Belt','Acrobatics'),
            hit('','Acrobatics'),hit('Focus Sash','Acrobatics')];
        }''')
        self.assertEqual(result[0],result[1])
        self.assertEqual(result[0],result[2])
        self.assertEqual(result[3],result[5])  # Expert Belt does not boost resisted Flying.
        self.assertGreater(result[4],result[5])  # Acrobatics doubles without a held item.

    def test_mega_forms_lock_required_item_and_restore_base_item_editor(self):
        self.load()
        self.page.locator('.team-row[data-team-index="2"]').click()
        self.assertEqual(self.page.locator('[data-field="item"]').input_value(),'Life Orb')
        self.page.locator('.set-editor summary').click()
        name=self.page.locator('[data-set-field="name"]')
        name.fill('Mega Garchomp');name.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[2].item'),'Garchompite')
        self.assertEqual(self.page.locator('[data-field="item"]').count(),0)
        self.assertIn('Garchompite',self.page.locator('.required-mega-item').inner_text())
        self.assertIn('Garchompite',self.page.locator('#ourActiveSummary').inner_text())
        name.fill('Mega Charizard X');name.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[2].item'),'Charizardite X')
        self.assertEqual(self.page.locator('[data-field="item"]').count(),0)
        self.page.reload()
        self.page.locator('.team-row[data-team-index="2"]').click()
        self.assertEqual(self.evaluate('state.ourTeam[2].item'),'Charizardite X')
        self.page.locator('.set-editor summary').click()
        name.fill('Charizard');name.press('Enter')
        self.assertEqual(self.page.locator('[data-field="item"]').input_value(),'')
        self.page.locator('[data-field="item"]').fill('Life Orb')
        self.page.locator('[data-field="item"]').press('Tab')
        self.assertEqual(self.evaluate('state.ourTeam[2].item'),'Life Orb')

    def test_legacy_mega_items_are_repaired_and_required_stones_reach_engine(self):
        self.context.add_init_script("localStorage.setItem('pokelator-pro-team',JSON.stringify([{name:'Mega Garchomp',item:'Life Orb',nature:'Jolly',investment:{spe:32}}]))")
        self.load()
        self.assertEqual(self.evaluate('state.ourTeam[0].item'),'Garchompite')
        self.assertEqual(self.evaluate('JSON.parse(localStorage.getItem(STORAGE_KEY))[0].item'),'Garchompite')
        self.evaluate("updateItem(state.ourTeam[0],'Choice Scarf')")
        self.assertEqual(self.evaluate('state.ourTeam[0].item'),'Garchompite')
        result=self.evaluate("""() => {
          const a=state.ourTeam[0],s=getPokemonByName(a.name),d=sanitizeTeamEntry({name:'Snorlax'});
          return {
            missing:getPokemonRoster().filter(p=>p.isMega&&!Battle.requiredMegaItem(p)).map(p=>p.name),
            damage:['','Life Orb','Choice Band'].map(item=>calculateMoveRange({...a,item},d,'Earthquake').maxDamage),
            speed:['','Choice Scarf','Iron Ball'].map(item=>Battle.speed(s,{...a,item})),
            flying:['Acrobatics','Aerial Ace'].map(move=>calculateMoveRange({...a,item:''},d,move).maxDamage)
          };
        }""")
        self.assertEqual(result['missing'],[])
        self.assertEqual(len(set(result['damage'])),1)
        self.assertEqual(len(set(result['speed'])),1)
        # Required stone counts as held: Acrobatics remains 55 BP, below Aerial Ace's 60.
        self.assertLess(result['flying'][0],result['flying'][1])
        self.evaluate("addOpponentFromSearch('Mega Garchomp')")
        self.assertIn('Mega Stone required',self.page.locator('#speedSummary .speed-unavailable').inner_text())
        self.assertEqual(self.page.locator('#speedSummary .speed-tier').count(),2)
        self.evaluate("addOpponentFromSearch('Kingambit')")
        self.assertEqual(self.page.locator('#speedSummary .speed-tier').count(),3)

    def test_team_addition_editing_and_persistence(self):
        self.load()
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        field=self.page.locator('#teamPokemonInput')
        field.fill('Unknown Pokémon');self.page.locator('#addTeamButton').click()
        self.assertIn('Choose a Pokémon',self.page.locator('#teamAddStatus').inner_text())
        self.assertEqual(before,self.evaluate('JSON.stringify(state.ourTeam)'))
        field.fill('Gardevoir');self.page.locator('#addTeamButton').click()
        self.assertEqual(self.page.locator('.team-row').count(),4)
        self.assertEqual(self.evaluate('state.activeOurIndex'),3)
        self.assertEqual(before,self.evaluate('JSON.stringify(state.ourTeam.slice(0,3))'))
        self.assertEqual(self.evaluate('getTotalInvestment(state.ourTeam[3])'),66)
        expected=self.evaluate("getNatureDefinition(getUsage(getPokemonByName('Gardevoir')).natures.slice().sort((a,b)=>b.percent-a.percent)[0].name).name")
        self.assertEqual(self.evaluate('state.ourTeam[3].nature.name'),expected)
        speed=self.page.locator('.expanded-team input[data-stat="spe"]')
        speed.fill('17');speed.press('Enter')
        hp=self.page.locator('.expanded-team input[data-stat="hp"]')
        hp.fill('17');hp.press('Enter')
        field.fill('Mega Charizard X');field.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[4].item'),'Charizardite X')
        self.assertEqual(self.page.locator('[data-field="item"]').count(),0)
        field.fill('Scizor');self.page.locator('#addTeamButton').click()
        self.assertEqual(self.page.locator('.team-row').count(),6)
        self.assertEqual(self.page.locator('#teamCount').text_content(),'6 Pokémon')
        self.assertFalse(field.is_disabled())
        self.assertFalse(self.page.locator('#addTeamButton').is_disabled())
        self.assertTrue(self.evaluate("addTeamPokemon('Kingambit')"))
        self.assertEqual(self.page.locator('.team-row').count(),7)
        self.page.reload()
        self.assertEqual(self.page.locator('.team-row').count(),7)
        self.assertEqual(self.evaluate('state.ourTeam[3].investment.hp'),17)
        self.assertEqual(self.evaluate('state.ourTeam[4].item'),'Charizardite X')
        self.assertEqual(before,self.evaluate('JSON.stringify(state.ourTeam.slice(0,3))'))

    def test_team_removal_reopens_slots_and_keeps_selection_valid(self):
        self.load()
        self.evaluate("addTeamPokemon('Gardevoir');addTeamPokemon('Sylveon');addTeamPokemon('Scizor')")
        self.page.locator('[data-remove-team-index="5"]').click()
        self.assertEqual(self.page.locator('.team-row').count(),5)
        search=self.page.locator('#teamPokemonInput')
        self.assertFalse(search.is_disabled())
        self.assertEqual(search.get_attribute('aria-expanded'),'false')
        self.assertEqual(self.evaluate('state.ourTeam[state.activeOurIndex].name'),'Sylveon')
        self.page.reload()
        self.assertEqual(self.page.locator('.team-row').count(),5)
        for _ in range(4):
            self.page.locator('.expanded-team [data-remove-team-index]').click()
        self.assertEqual(self.page.locator('.team-row').count(),1)
        self.assertEqual(self.evaluate('state.activeOurIndex'),0)
        self.page.locator('.expanded-team [data-remove-team-index]').click()
        self.assertEqual(self.page.locator('.team-row').count(),0)
        self.assertEqual(search.get_attribute('aria-expanded'),'false')
        self.page.reload()
        self.assertEqual(self.page.locator('.team-row').count(),0)
        self.page.locator('#teamPokemonInput').fill('Gengar')
        self.page.locator('#addTeamButton').click()
        self.assertEqual(self.page.locator('.team-row').count(),1)

    def test_doubles_reduces_spread_only(self):
        self.load()
        self.assertEqual(self.page.locator('[data-format][aria-pressed="true"]').inner_text(),'Doubles')
        self.assertEqual(self.evaluate('state.format'),'Doubles')
        self.assertEqual(self.page.locator('#damageAssumptions').count(),0)
        result = self.evaluate('''() => {
          const a=sanitizeTeamEntry({name:'Garchomp',nature:'Jolly',investment:{atk:32}});
          const d=sanitizeTeamEntry({name:'Kingambit'});
          return ['Earthquake','Dragon Claw'].map(m => ['Singles','Doubles'].map(format=>
            calculateMoveRange(a,d,m,null,{format}).maxDamage));
        }''')
        self.assertGreater(result[0][0],result[0][1])
        self.assertEqual(result[1][0],result[1][1])

    def test_global_format_defaults_and_persists(self):
        self.load()
        self.assertEqual(self.page.locator('[data-format][aria-pressed="true"]').inner_text(),'Doubles')
        self.assertEqual(self.evaluate('state.format'),'Doubles')
        self.assertIn('Doubles',self.page.locator('#usageReference').inner_text())
        self.page.locator('[data-format="Singles"]').click()
        self.assertEqual(self.evaluate('state.format'),'Singles')
        self.assertIn('Singles',self.page.locator('#usageReference').inner_text())
        self.evaluate('render()')
        self.assertEqual(self.page.locator('[data-format][aria-pressed="true"]').inner_text(),'Singles')
        self.page.reload()
        self.assertEqual(self.page.locator('[data-format][aria-pressed="true"]').inner_text(),'Singles')

    def test_defensive_nature_reduces_outgoing_comparison_damage(self):
        self.load()
        self.fixture()
        before=self.evaluate("JSON.stringify([sneasler,kingambit,state.ourTeam])")
        for move in ['Close Combat','Shadow Ball','Psyshock','Body Press']:
            result=self.evaluate("""move => [false,true].map(boostDefenseNature =>
                calculateMoveRange(sneasler,sanitizeTeamEntry({name:'Garchomp'}),move,35,{boostDefenseNature}))""", move)
            self.assertLessEqual(result[1]['high'],result[0]['high'])
            self.assertLess(result[1]['high'],result[0]['high'])
        self.assertEqual(before,self.evaluate("JSON.stringify([sneasler,kingambit,state.ourTeam])"))
        result=self.evaluate("[false,true].map(boostDefenseNature=>calculateMoveRange(sneasler,kingambit,'Close Combat',null,{boostDefenseNature}).maxDamage)")
        self.assertEqual(result[0],result[1])
        self.set_nature_preference('defense',True)
        self.assertTrue(self.evaluate('getOpponentPreferences().defenseNatureChoice'))
        values=self.page.locator('[data-move="Close Combat"] [data-nature="boosted"] strong').all_text_contents()
        self.set_nature_preference('defense',False)
        baseline=self.page.locator('[data-move="Close Combat"] [data-nature="neutral"] strong').all_text_contents()
        for boosted,normal in zip(values,baseline):
            self.assertLessEqual(float(boosted.split('–')[1].strip('%')),float(normal.split('–')[1].strip('%')))
        self.set_nature_preference('defense',True)
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.assertEqual(self.page.locator('#boostNatureToggle').count(),0)
        self.assertEqual(self.page.locator('.move-row').first.locator('.offense-ceiling').count(),1)

    def test_defense_optimizer_matches_exhaustive_valid_spreads(self):
        self.load()
        self.fixture()
        # Independently evaluate every legal HP/defense pair using exact-build calls.
        result=self.evaluate("""() => ['Close Combat','Shadow Ball','Psyshock'].map(move => {
          const stat = move === 'Shadow Ball' ? 'spd' : 'def';
          const target=sanitizeTeamEntry({name:'Garchomp'});
          const rows=[];
          for (let hp=3; hp<=32; hp++) {
            const investment={hp,atk:0,def:0,spa:0,spd:0,spe:0,[stat]:35-hp};
            rows.push(calculateMoveRange(sneasler,{...target,investment,nature:getNatureDefinition('Neutral')},move));
          }
          const best=calculateMoveRange(sneasler,target,move,35);
          const even=rows[18-3];
          return {actual:best.high,expected:Math.min(...rows.map(r=>r.high)),
            even:even.high,allocation:best.allocation};
        })""")
        for row in result:
            self.assertEqual(row['actual'],row['expected'])
            self.assertLessEqual(row['actual'],row['even'])
        self.assertLess(result[0]['actual'],result[0]['even'])

    def test_keyboard_search_uses_current_usage_order_and_adds(self):
        self.load()
        search=self.page.locator('#pokemonSearchInput')
        search.fill('char')
        self.assertEqual(self.page.locator('#searchResults .choice-heading strong').all_text_contents(),
                         self.evaluate("buildSearchResults('char').map(p=>p.name)"))
        search.press('ArrowDown')
        selected=self.evaluate('state.searchResults[state.searchCursor].name')
        search.press('Enter')
        self.assertEqual(self.evaluate('state.opponentList[0].name'),selected)
        search.fill('not-a-real-pokemon')
        self.assertEqual(self.page.locator('.search-item').count(),0)
        search.press('Escape')
        self.assertEqual(search.input_value(),'')

    def test_roster_and_all_default_moves_calculate(self):
        self.load()
        self.assertIsNone(self.evaluate("getPokemonByName('not-a-real-pokemon') || null"))
        self.assertEqual(self.evaluate('''() => {
          const d=sanitizeTeamEntry({name:'Kingambit'});
          return pokerData.flatMap(p=>p.moves.map(m=>({name:p.name,move:m,
            result:calculateMoveRange(sanitizeTeamEntry({name:p.name}),d,m)})))
            .filter(x=>x.result.error).map(x=>[x.name,x.move,x.result.error]);
        }'''),[])
        self.assertTrue(self.evaluate("pokerData.every(p=>getPokemonImage(p.name).startsWith('https://championsbattledata.com/pokemon_champions_assets/pokemon/'))"))

    def test_stat_commit_preserves_tab_and_budget(self):
        self.load()
        attack=self.page.locator('input[data-stat="atk"]')
        attack.fill('99')
        attack.press('Tab')
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.atk'),32)
        self.assertEqual(self.evaluate('document.activeElement.dataset.stat'),'def')
        defense=self.page.locator('input[data-stat="def"]')
        defense.fill('-4')
        defense.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.def'),0)
        self.assertLessEqual(self.evaluate('getTotalInvestment(state.ourTeam[0])'),66)

    def test_nature_pair_can_be_completed(self):
        self.load()
        self.evaluate("state.ourTeam[0].nature=getNatureDefinition('Neutral');render()")
        self.page.locator('[data-nature-mode="plus"]').select_option('def')
        self.assertEqual(self.evaluate("getEffectiveStat(state.ourTeam[0],'def')"),81)
        self.page.locator('[data-nature-mode="minus"]').select_option('atk')
        self.assertEqual(self.evaluate('state.ourTeam[0].nature.name'),'Bold')
        self.assertEqual(self.page.locator('[data-nature-mode="plus"] option[value="hp"]').count(),0)

    def test_persistence_and_per_pokemon_stat_stages(self):
        self.load(frozen_usage=True)
        self.page.locator('#attackerStageControl input[value="1"]').locator('..').click()
        self.page.reload()
        self.assertEqual(self.page.locator('#attackerStageControl input:checked').input_value(),'1')
        self.page.locator('.compact-team').first.click()
        self.assertEqual(self.page.locator('#attackerStageControl input:checked').input_value(),'0')
        self.assertEqual(self.evaluate("getPreferences(state.ourTeam[0],'our').offenseStage"),1)

    def test_corrupt_and_blocked_storage(self):
        self.context.add_init_script("localStorage.setItem('pokelator-pro-team','{broken')")
        self.load()
        self.assertEqual(self.page.locator('.team-row').count(),3)
        self.page.close()
        self.page=self.context.new_page()
        self.page.on('pageerror',lambda error:self.errors.append(str(error)))
        self.page.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('Blocked')}})")
        self.load()
        hp=self.page.locator('.expanded-team input[data-stat=hp]')
        hp.fill('1'); hp.press('Enter')
        self.assertIn('Storage unavailable',self.page.locator('#storageStatus').inner_text())

    def test_saved_entry_validation_and_html_escaping(self):
        self.load()
        self.evaluate('''() => {
          localStorage.setItem(STORAGE_KEY,JSON.stringify([null,{}, {name:'Mewtwo'},
            {name:'Garchomp',investment:{hp:999,atk:999,def:'junk'},
              item:'"><img src=x onerror="window.injected=true">'}]));
          loadSavedTeam();render();
        }''')
        self.assertEqual(self.page.locator('.team-row').count(),1)
        self.assertEqual(self.evaluate('getTotalInvestment(state.ourTeam[0])'),64)
        self.assertIsNone(self.evaluate('window.injected'))
        self.assertEqual(self.page.locator('img[src="x"]').count(),0)

    def test_physical_special_and_unusual_stat_selection(self):
        self.load()
        self.fixture()
        result = self.evaluate("""() => {
          const d={...kingambit,investment:{...kingambit.investment,spd:32}};
          return [calculateMoveRange(sneasler,kingambit,'Close Combat').maxDamage,
            calculateMoveRange(sneasler,d,'Close Combat').maxDamage];
        }""")
        self.assertEqual(result[0], result[1])
        result = self.evaluate("""() => {
          const a=sanitizeTeamEntry({name:'Gengar',nature:'Modest',investment:{spa:32}});
          const d=sanitizeTeamEntry({name:'Garchomp'});
          return ['Psyshock','Shadow Ball'].map(m=>calculateMoveRange(a,d,m,35).allocation.stat);
        }""")
        self.assertEqual(result,['def','spd'])

    def test_speed_tiers_distinguish_maximum_speed_ties_and_strict_thresholds(self):
        self.load()
        # Synthetic uninvested Speed 100 makes all boundaries explicit.
        cases=[(99,'Always faster'),(100,'Faster with 1 points invested'),
               (131,'Faster with 32 points invested'),
               (132,'Faster only with speed-boosted nature'),
               (144,'Faster only with speed-boosted nature'),
               (145,'Can tie with speed-boosted nature'),(146,'Always Slower')]
        for target,expected in cases:
            result=self.evaluate("""target => Battle.speedTier({stats:{spe:100}},
                {investment:{spe:17},nature:{plus:'spe',minus:'spa'},item:''},target).label""",target)
            self.assertEqual(result,expected)
        self.assertEqual(self.evaluate("Battle.speedTier({stats:{spe:100}},{investment:{},item:'Choice Scarf'},149).label"),'Always faster')
        self.assertEqual(self.evaluate("Battle.speedTier({stats:{spe:100}},{investment:{},item:'Iron Ball'},72).label"),'Can tie with speed-boosted nature')

    def test_speed_display_varies_opponent_and_keeps_our_build_fixed(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',nature:'Jolly',investment:{spe:32}})];
          state.opponentList=[sanitizeOpponentEntry({name:'Sneasler'})];
          render();
        }""")
        tiers=self.page.locator('#speedSummary .speed-tier')
        expected=['Faster with 30 points invested','Always faster','Always faster']
        self.assertEqual(tiers.all_text_contents(),expected)
        self.assertEqual(self.page.locator('#speedSummary dt').all_text_contents(),['Normal','Choice Scarf','Tailwind'])
        original=self.evaluate('JSON.stringify(state.ourTeam)')
        opponent=self.evaluate('JSON.stringify(state.opponentList)')
        self.evaluate("renderSpeedSummary()")
        self.assertEqual(tiers.all_text_contents(),expected)
        self.assertEqual(original,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.assertEqual(opponent,self.evaluate('JSON.stringify(state.opponentList)'))
        # Our known item still applies in all three independent opponent scenarios.
        self.evaluate("state.ourTeam[0].item='Choice Scarf';renderSpeedSummary()")
        self.assertEqual(tiers.all_text_contents(),['Always Slower','Faster with 30 points invested','Always faster'])
        self.evaluate("state.ourTeam[0].item='';renderSpeedSummary()")
        speed=self.page.locator('input[data-stat="spe"]')
        speed.fill('0')
        speed.press('Enter')
        self.assertEqual(tiers.all_text_contents(),['Always faster']*3)

    def test_speed_scarf_and_tailwind_strict_thresholds(self):
        self.load()
        scenarios=[
            ('Choice Scarf',False,[(149,'Always faster'),(150,'Faster with 1 points invested'),
                (197,'Faster with 32 points invested'),(198,'Faster only with speed-boosted nature'),
                (216,'Faster only with speed-boosted nature'),(217,'Can tie with speed-boosted nature'),(218,'Always Slower')]),
            ('',True,[(199,'Always faster'),(200,'Faster with 1 points invested'),
                (263,'Faster with 32 points invested'),(264,'Faster only with speed-boosted nature'),
                (289,'Faster only with speed-boosted nature'),(290,'Can tie with speed-boosted nature'),(291,'Always Slower')])]
        for item,tailwind,cases in scenarios:
            for target,expected in cases:
                with self.subTest(item=item,tailwind=tailwind,target=target):
                    result=self.evaluate("""([item,tailwind,target]) => Battle.speedTier({stats:{spe:100}},
                        {investment:{spe:17},nature:{plus:'spe',minus:'spa'},item},target,{tailwind}).label""",
                        [item,tailwind,target])
                    self.assertEqual(result,expected)

    def test_kingambit_tailwind_beats_scarf_with_old_script_cached(self):
        # Simulate the obsolete unversioned adapter, which ignores Tailwind options.
        old_adapter=(ROOT / 'battle.js').read_text()+"""
          const currentTier=Battle.speedTier;
          Battle.speedTier=(species,entry,target)=>currentTier(species,entry,target);
        """
        stale_requests=[]
        def stale_script(route):
            stale_requests.append(route.request.url)
            route.fulfill(status=200,content_type='text/javascript',body=old_adapter)
        self.context.route('**/battle.js',stale_script)
        self.load()
        self.evaluate("state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];state.activeOpponentIndex=0;getOpponentPreferences().itemChoice='';render()")
        # Use the actual set editor, retaining our known Jolly / 32 Speed build.
        self.page.locator('[data-team-index="2"].team-row').click()
        self.page.locator('.set-editor summary').click()
        name=self.page.locator('[data-set-field="name"]')
        name.fill('Mega Garchomp')
        name.press('Enter')
        self.assertEqual(self.evaluate("getEffectiveStat(state.ourTeam[2],'spe')"),158)
        self.assertEqual(self.page.locator('#speedSummary .speed-tier').all_text_contents(),[
            'Always Slower','Faster only with speed-boosted nature','Faster with 10 points invested'])
        self.assertEqual(stale_requests,[], 'Versioned page must bypass the old battle-script URL')

    def test_sand_force_our_selected_ability_responds_to_weather(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Mega Garchomp',ability:'Sand Force',
            nature:'Adamant',investment:{atk:32},moveSet:['Earthquake','Rock Slide','Iron Head','Dragon Claw']})];
          state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];render();saveTeamToStorage();
        }""")
        moves=['Earthquake','Rock Slide','Iron Head','Dragon Claw']
        neutral={m:self.page.locator(f'[data-move="{m}"] .defense-line strong').all_text_contents() for m in moves}
        self.page.locator('#weatherInput [data-field-value="Sand"]').click()
        sand={m:self.page.locator(f'[data-move="{m}"] .defense-line strong').all_text_contents() for m in moves}
        for move in moves[:3]:
            self.assertGreater(float(sand[move][0].split('–')[1].strip('%')),float(neutral[move][0].split('–')[1].strip('%')))
        self.assertEqual(sand['Dragon Claw'],neutral['Dragon Claw'])
        self.page.locator('.set-editor summary').click()
        self.assertEqual(self.page.locator('[data-set-field="ability"]').input_value(),'Sand Force')
        self.page.reload()
        self.assertEqual(self.evaluate('state.ourTeam[0].ability'),'Sand Force')

    def test_solar_power_applies_to_our_special_damage_in_sun(self):
        self.load()
        result=self.evaluate("""() => {
          const a=sanitizeTeamEntry({name:'Charizard',ability:'Solar Power',investment:{spa:32}});
          const d=sanitizeTeamEntry({name:'Kingambit',ability:'Pressure'});
          return ['Heat Wave','Dragon Claw'].map(move => ['','Solar Power'].map(ability=>
            calculateMoveRange({...a,ability},d,move,null,{weather:'Sun'}).high));
        }""")
        self.assertGreater(result[0][1],result[0][0])
        self.assertEqual(result[1][1],result[1][0])

    def test_outgoing_moves_sort_by_damage_and_resort_with_weather(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Mega Garchomp',ability:'Sand Force',
            nature:'Adamant',investment:{atk:32},moveSet:['Protect','Rock Slide','Dragon Claw','Earthquake']})];
          state.opponentList=[sanitizeOpponentEntry({name:'Snorlax'})];render();
        }""")
        original=self.evaluate('JSON.stringify(state.ourTeam)')
        names=lambda: self.page.locator('.move-row').evaluate_all('(rows)=>rows.map(r=>r.dataset.move)')
        self.assertEqual(names(),['Dragon Claw','Earthquake','Rock Slide','Protect'])
        self.page.locator('#weatherInput [data-field-value="Sand"]').click()
        self.assertEqual(names(),['Earthquake','Dragon Claw','Rock Slide','Protect'])
        self.page.locator('#weatherInput [data-field-value=""]').click()
        self.assertEqual(names(),['Dragon Claw','Earthquake','Rock Slide','Protect'])
        self.assertEqual(original,self.evaluate('JSON.stringify(state.ourTeam)'))

    def test_opponent_ability_assumption_uses_sole_or_50_percent_ability(self):
        self.load("Singles",frozen_usage=True)
        self.evaluate("state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];state.activeOpponentIndex=0;getOpponentPreferences().itemChoice='';render()")
        self.assertEqual(self.evaluate('getOpponentAbilityAssumption().name'),'Supreme Overlord')
        self.assertIn('83.9%',self.page.locator('#abilityAssumptionBasis').inner_text())
        self.page.locator('[data-format="Doubles"]').click()
        self.assertEqual(self.evaluate('getOpponentAbilityAssumption().name'),'Defiant')
        self.assertIn('96.8%',self.page.locator('#abilityAssumptionBasis').inner_text())
        self.evaluate("addOpponentFromSearch('Mega Garchomp')")
        self.assertEqual(self.evaluate('getOpponentAbilityAssumption().name'),'Sand Force')
        self.assertEqual(self.page.locator('#abilityAssumptionBasis').inner_text(),'Only available ability')
        self.evaluate("addOpponentFromSearch('Sylveon')")
        self.assertEqual(self.evaluate('getOpponentAbilityAssumption().name'),'Pixilate')
        self.assertIn('99.9%',self.page.locator('#abilityAssumptionBasis').inner_text())
        self.evaluate("getPokemonByName('Sylveon').usage.Doubles.abilities=[{name:'Pixilate',percent:49.9,rank:1}];renderDamageRanges()")
        self.assertIsNone(self.evaluate('getOpponentAbilityAssumption()'))
        self.assertEqual(self.page.locator('[data-assumed-ability="Pixilate"]').get_attribute('aria-pressed'),'false')
        self.evaluate("getPokemonByName('Sylveon').usage.Doubles.abilities[0].percent=50;renderDamageRanges()")
        self.assertTrue(self.page.locator('#abilityAssumptionRow').is_visible())
        self.evaluate("getPokemonByName('Sylveon').usage.Doubles.abilities=[{name:'Sand Force',percent:100,rank:1}];renderDamageRanges()")
        self.assertEqual(self.evaluate('appliedOpponentAbility(state.opponentList[0])'),'')
        self.assertEqual(self.page.locator('[data-assumed-ability="Sand Force"]').count(),0)

    def test_assumed_levitate_immunity_can_be_disabled_for_all_defense_tiers(self):
        self.load()
        own_before=self.evaluate('JSON.stringify(state.ourTeam)')
        self.evaluate("""() => {
          state.ourTeam[0].moveSet=['Earthquake'];
          addOpponentFromSearch('Rotom-Wash');
        }""")
        self.assertEqual(self.evaluate('getOpponentAbilityAssumption().name'),'Levitate')
        values=self.page.locator('.move-row .defense-line strong').all_text_contents()
        self.assertEqual(values,['0%–0%']*6)
        toggle=self.page.locator('#abilityAssumptionToggle')
        self.assertEqual(toggle.get_attribute('aria-pressed'),'true')
        self.assertIn('Damage ranges are assumed to be modified by Levitate',toggle.get_attribute('aria-label'))
        opponent_before=self.evaluate('JSON.stringify(state.opponentList[0])')
        toggle.click()
        self.assertEqual(toggle.get_attribute('aria-pressed'),'false')
        self.assertEqual(toggle.evaluate('(e)=>getComputedStyle(e).filter'),'grayscale(1)')
        self.assertIn('not assumed',toggle.inner_text())
        self.assertTrue(all(v!='0%–0%' for v in self.page.locator('.move-row .defense-line strong').all_text_contents()))
        self.assertEqual(opponent_before,self.evaluate('JSON.stringify(state.opponentList[0])'))
        toggle.press('Enter')
        self.assertEqual(self.page.locator('.move-row .defense-line strong').all_text_contents(),['0%–0%']*6)

    def test_assumed_pixilate_affects_incoming_spreads_ceiling_and_type(self):
        self.load(frozen_usage=True)
        self.evaluate("addOpponentFromSearch('Sylveon')")
        ours=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.locator('[data-damage-direction="incoming"]').click()
        result=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Hyper Voice')")
        self.assertEqual(result['range']['meta']['type'],'Fairy')
        self.assertIn('Fairy',self.page.locator('[data-move="Hyper Voice"] .range-pill').inner_text())
        self.page.locator('#abilityAssumptionToggle').click()
        disabled=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Hyper Voice')")
        self.assertEqual(disabled['range']['meta']['type'],'Normal')
        self.assertGreater(result['ceiling']['high'],disabled['ceiling']['high'])
        for enabled,off in zip(result['scenarios'],disabled['scenarios']):
            self.assertEqual(enabled['investment'],off['investment'])
            self.assertEqual(enabled['percent'],off['percent'])
            self.assertGreater(enabled['range']['high'],off['range']['high'])
        self.assertEqual(ours,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.assertNotIn('ability',self.evaluate('state.opponentList[0]'))

    def test_opponent_sand_force_uses_weather_and_toggle_persists_per_pokemon(self):
        self.load(frozen_usage=True)
        self.evaluate("addOpponentFromSearch('Mega Garchomp')")
        self.page.locator('[data-damage-direction="incoming"]').click()
        neutral=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Earthquake').ceiling.high")
        self.page.locator('#weatherInput [data-field-value="Sand"]').click()
        sand=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Earthquake').ceiling.high")
        self.assertGreater(sand,neutral)
        self.page.locator('#abilityAssumptionToggle').click()
        disabled=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Earthquake').ceiling.high")
        self.assertEqual(disabled,neutral)
        self.evaluate("addOpponentFromSearch('Rotom-Wash')")
        self.assertEqual(self.page.locator('#abilityAssumptionToggle').get_attribute('aria-pressed'),'true')
        self.page.locator('.opponent-row[data-opponent-index="1"] .pokemon-name').click()
        self.assertEqual(self.page.locator('#abilityAssumptionToggle').get_attribute('aria-pressed'),'false')
        self.page.locator('[data-damage-direction="outgoing"]').click()
        self.assertEqual(self.page.locator('#abilityAssumptionToggle').get_attribute('aria-pressed'),'false')
        self.page.reload()
        self.evaluate("addOpponentFromSearch('Mega Garchomp')")
        self.assertEqual(self.page.locator('#abilityAssumptionToggle').get_attribute('aria-pressed'),'false')

    def test_rare_damage_ability_is_grey_until_selected_and_exclusive(self):
        self.load("Singles",frozen_usage=True)
        self.evaluate("""() => {
          getPokemonByName('Sylveon').usage.Singles.abilities=[
            {name:'Cute Charm',percent:90,rank:1},{name:'Pixilate',percent:10,rank:2}];
          addOpponentFromSearch('Sylveon');
        }""")
        self.page.locator('[data-damage-direction="incoming"]').click()
        common=self.page.locator('[data-assumed-ability="Cute Charm"]')
        rare=self.page.locator('[data-assumed-ability="Pixilate"]')
        self.assertEqual(common.get_attribute('aria-pressed'),'true')
        self.assertEqual(rare.get_attribute('aria-pressed'),'false')
        self.assertEqual(rare.evaluate('(e)=>getComputedStyle(e).filter'),'grayscale(1)')
        before=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Hyper Voice').ceiling.high")
        rare.click()
        self.assertEqual(rare.get_attribute('aria-pressed'),'true')
        self.assertEqual(common.get_attribute('aria-pressed'),'false')
        self.assertEqual(self.page.locator('[data-assumed-ability][aria-pressed="true"]').count(),1)
        after=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Hyper Voice').ceiling.high")
        self.assertGreater(after,before)
        self.page.reload()
        self.evaluate("addOpponentFromSearch('Sylveon')")
        self.assertEqual(self.evaluate('appliedOpponentAbility(state.opponentList[0])'),'Pixilate')
        self.page.locator('[data-assumed-ability="Pixilate"]').click()
        self.assertEqual(self.evaluate('appliedOpponentAbility(state.opponentList[0])'),'')
        self.assertEqual(self.page.locator('[data-assumed-ability][aria-pressed="true"]').count(),0)

    def test_rare_sand_force_can_be_enabled_for_weather_damage(self):
        self.load(frozen_usage=True)
        self.evaluate("addOpponentFromSearch('Hippowdon')")
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.page.locator('#weatherInput [data-field-value="Sand"]').click()
        rare=self.page.locator('[data-assumed-ability="Sand Force"]')
        self.assertEqual(rare.get_attribute('aria-pressed'),'false')
        before=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Earthquake').ceiling.high")
        rare.click()
        self.assertEqual(self.evaluate('appliedOpponentAbility(state.opponentList[0])'),'Sand Force')
        after=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Earthquake').ceiling.high")
        self.assertGreater(after,before)
        self.assertEqual(self.page.locator('[data-assumed-ability][aria-pressed="true"]').count(),1)

    def test_rare_unnerve_disables_our_resist_berry_only_when_assumed(self):
        self.load(frozen_usage=True)
        self.evaluate("state.ourTeam[0].item='Coba Berry';addOpponentFromSearch('Tyranitar')")
        rare=self.page.locator('[data-assumed-ability="Unnerve"]')
        self.assertEqual(rare.get_attribute('aria-pressed'),'false')
        before=self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Aerial Ace').high")
        rare.click()
        after=self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Aerial Ace').high")
        self.assertGreater(after,before)
        self.assertEqual(self.evaluate('state.ourTeam[0].item'),'Coba Berry')

    def test_nature_defaults_aggregate_usage_by_stat(self):
        self.load("Singles",frozen_usage=True)
        self.evaluate("addOpponentFromSearch('Umbreon')")
        self.assertEqual(self.evaluate("natureUsage(state.opponentList[0],'def')"),84.5)
        self.assertEqual(self.evaluate("natureUsage(state.opponentList[0],'spd')"),14.5)
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'defense').checked"))
        self.assertEqual(self.page.locator('#defenseNatureUsage').count(),0)
        self.assertTrue(self.evaluate("natureBoostForMove(state.opponentList[0],'defense','def')"))
        self.assertFalse(self.evaluate("natureBoostForMove(state.opponentList[0],'defense','spd')"))

    def test_automatic_offense_boosts_only_the_stat_matching_the_move(self):
        self.load("Singles")
        self.evaluate("""() => {
          const usage=getPokemonByName('Lucario').usage.Singles;
          usage.natures=[{name:'Adamant',percent:30,rank:1},{name:'Brave',percent:20,rank:2},{name:'Modest',percent:10,rank:3}];
          usage.moves=[{name:'Close Combat',percent:80,rank:1},{name:'Aura Sphere',percent:70,rank:2}];
          addOpponentFromSearch('Lucario');
        }""")
        original=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').mixed"))
        automatic=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0])")
        expected=self.evaluate("""() => {
          const p=state.opponentList[0],ours=state.ourTeam[0];
          return ['Close Combat','Aura Sphere'].map(name=>Battle.incomingScenarios(getPokemonByName(p.name),getPokemonByName(ours.name),ours,name,[],
            {opponentAbility:appliedOpponentAbility(p),boostOffenseNature:name==='Close Combat'}).ceiling.high);
        }""")
        for name,value in zip(['Close Combat','Aura Sphere'],expected):
            self.assertEqual(next(r for r in automatic if r['name']==name)['ceiling']['high'],value)
        self.set_nature_preference('offense',False)
        self.set_nature_preference('offense',True)
        forced=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Aura Sphere').ceiling.high")
        self.assertGreater(forced,expected[1])
        self.assertEqual(original,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.assertNotIn('nature',self.evaluate('state.opponentList[0]'))

    def test_automatic_defense_uses_defense_override_for_special_moves(self):
        self.load("Singles")
        self.evaluate("""() => {
          state.ourTeam[0]=sanitizeTeamEntry({name:'Gardevoir',nature:'Modest',investment:{spa:32},moveSet:['Psyshock','Shadow Ball']});
          getPokemonByName('Garchomp').usage.Singles.natures=[{name:'Bold',percent:27,rank:1},{name:'Impish',percent:23,rank:2}];
          addOpponentFromSearch('Garchomp');
        }""")
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'defense').mixed"))
        rows=[v for move in ['Psyshock','Shadow Ball'] for v in self.page.locator(f'[data-move="{move}"] .defense-line strong').all_text_contents()]
        expected=self.evaluate("""() => ['Psyshock','Shadow Ball'].flatMap(name=>[0,35,64].flatMap(points=>[false,true].map(boostDefenseNature=>{
          const r=calculateMoveRange(state.ourTeam[0],state.opponentList[0],name,points,{boostDefenseNature});
          return `${formatPercent(r.low)}–${formatPercent(r.high)}`;
        })))""")
        self.assertEqual(rows,expected)

    def test_nature_defaults_change_with_format_and_overrides_persist(self):
        self.load("Singles",frozen_usage=True)
        self.evaluate("addOpponentFromSearch('Sylveon')")
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.assertFalse(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.page.locator('[data-format="Doubles"]').click()
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.assertEqual(self.evaluate("natureUsage(state.opponentList[0],'spa')"),95)
        self.set_nature_preference('offense',False)
        self.assertIs(self.evaluate('getOpponentPreferences().offenseNatureChoice'),False)
        self.assertEqual(self.page.locator('#offenseNatureUsage').count(),0)
        self.page.locator('[data-format="Singles"]').click()
        self.page.locator('[data-format="Doubles"]').click()
        self.assertFalse(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.page.reload()
        self.evaluate("addOpponentFromSearch('Sylveon')")
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.page.locator('[data-format="Doubles"]').click()
        self.assertFalse(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.reset_nature_preferences()
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.assertEqual(self.evaluate('getOpponentPreferences().offenseNatureChoice'),'auto')
        self.assertEqual(self.page.locator('#natureUsageDefaultsButton').count(),0)
        self.evaluate("addOpponentFromSearch('Lucario')")
        self.assertFalse(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))

    def test_neutral_natures_missing_data_and_exact_threshold(self):
        self.load("Singles")
        self.evaluate("addOpponentFromSearch('Kingambit')")
        self.evaluate("""() => {
          getPokemonByName('Kingambit').usage.Singles.natures=[{name:'Hardy',percent:90,rank:1},{name:'Adamant',percent:10,rank:2}];
          renderDamageRanges();
        }""")
        self.assertEqual(self.evaluate("natureUsage(state.opponentList[0],'atk')"),10)
        self.assertFalse(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.evaluate("getPokemonByName('Kingambit').usage.Singles.natures=[{name:'Adamant',percent:49.9,rank:1},{name:'Brave',percent:0.1,rank:2}];renderDamageRanges()")
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.evaluate("getPokemonByName('Kingambit').usage.Singles.natures=[];renderDamageRanges()")
        self.assertIsNone(self.evaluate("natureUsage(state.opponentList[0],'atk')"))
        self.assertFalse(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.assertEqual(self.page.locator('#offenseNatureUsage').count(),0)

    def test_saved_legacy_nature_flags_remain_explicit_overrides(self):
        self.load(frozen_usage=True)
        result=self.evaluate('sanitizePreferences({boostDefenseNature:true,boostOffenseNature:false})')
        self.assertIs(result['defenseNatureChoice'],True)
        self.assertIs(result['offenseNatureChoice'],False)
        self.evaluate("""() => {
          localStorage.setItem(PREFERENCES_KEY,JSON.stringify({'opponent:Kingambit':{boostDefenseNature:true,boostOffenseNature:false}}));
        }""")
        self.page.reload()
        self.evaluate("addOpponentFromSearch('Kingambit')")
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'defense').checked"))
        self.assertFalse(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.reset_nature_preferences()
        self.assertFalse(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'defense').checked"))
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))

    def test_weather_changes_damage(self):
        self.load()
        self.fixture()
        result=self.evaluate("""['','Rain'].map(weather=>calculateMoveRange(sneasler,kingambit,'Scald',null,{weather}).maxDamage)""")
        self.assertGreater(result[1],result[0])
        self.page.locator('#weatherInput [data-field-value="Rain"]').click()
        self.assertEqual(self.evaluate('state.weather'),'Rain')

    def test_psychic_terrain_expanding_force_grounding_and_doubles(self):
        self.load()
        result=self.evaluate("""() => {
          const a=sanitizeTeamEntry({name:'Gardevoir',nature:'Modest',investment:{spa:32}});
          const d=sanitizeTeamEntry({name:'Snorlax'});
          return ['', 'Air Balloon'].map(item=>['', 'Psychic'].map(terrain=>['Singles','Doubles'].map(format=>
            calculateMoveRange({...a,item},d,'Expanding Force',null,{terrain,format}))));
        }""")
        grounded,airborne=result
        self.assertEqual(grounded[0][0]['maxDamage'],grounded[0][1]['maxDamage'])
        self.assertGreater(grounded[1][1]['maxDamage'],grounded[0][1]['maxDamage'])
        self.assertLess(grounded[1][1]['maxDamage'],grounded[1][0]['maxDamage'])
        for index in [0,1]:
            self.assertFalse(grounded[0][index]['meta']['spread'])
            self.assertTrue(grounded[1][index]['meta']['spread'])
            self.assertEqual(airborne[0][index]['maxDamage'],airborne[1][index]['maxDamage'])
            self.assertFalse(airborne[1][index]['meta']['spread'])

    def test_terrain_damage_effects_priority_and_resolved_move_type(self):
        self.load()
        result=self.evaluate("""() => {
          const a=sanitizeTeamEntry({name:'Gardevoir',nature:'Modest',investment:{spa:32}});
          const d=sanitizeTeamEntry({name:'Snorlax'});
          const dragon=sanitizeTeamEntry({name:'Garchomp',investment:{atk:32}});
          const flying=sanitizeTeamEntry({name:'Charizard'});
          const levitate=sanitizeTeamEntry({name:'Rotom-Wash',ability:'Levitate',investment:{spa:32}});
          const pair=(attacker,defender,move,terrain)=>['',terrain].map(t=>
            calculateMoveRange(attacker,defender,move,null,{terrain:t}).maxDamage);
          return {
            electric:pair(a,d,'Thunderbolt','Electric'),grassy:pair(a,d,'Energy Ball','Grassy'),
            levitate:pair(levitate,d,'Thunderbolt','Electric'),
            earthquake:pair(dragon,d,'Earthquake','Grassy'),
            dragon:pair(dragon,d,'Dragon Claw','Misty'),airborne:pair(dragon,flying,'Dragon Claw','Misty'),
            priority:pair(dragon,d,'Quick Attack','Psychic'),airbornePriority:pair(dragon,flying,'Quick Attack','Psychic'),
            pulse:['','Electric','Grassy','Misty','Psychic'].map(terrain=>
              calculateMoveRange(d,dragon,'Terrain Pulse',null,{terrain}).meta.type)
          };
        }""")
        for key in ['electric','grassy']:
            self.assertGreater(result[key][1],result[key][0])
        for key in ['earthquake','dragon']:
            self.assertLess(result[key][1],result[key][0])
        for key in ['levitate','airborne','airbornePriority']:
            self.assertEqual(result[key][1],result[key][0])
        self.assertGreater(result['priority'][0],0)
        self.assertEqual(result['priority'][1],0)
        self.assertEqual(result['pulse'],['Normal','Electric','Grass','Fairy','Psychic'])

    def test_terrain_selector_updates_both_directions_and_move_badges(self):
        self.load(frozen_usage=True)
        self.assertEqual(self.page.locator('#terrainInput [aria-pressed="true"]').get_attribute('data-field-value'),'')
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Gardevoir',nature:'Modest',investment:{spa:32},
            moveSet:['Expanding Force','Psychic','Thunderbolt','Protect']})];
          state.opponentList=[sanitizeOpponentEntry({name:'Snorlax'})];render();
        }""")
        ours=self.evaluate('JSON.stringify(state.ourTeam)')
        row=self.page.locator('[data-move="Expanding Force"]')
        neutral=row.locator('.defense-line strong').all_text_contents()
        self.assertNotIn('spread',row.locator('.range-pill').inner_text())
        self.page.locator('#terrainInput [data-field-value="Psychic"]').click()
        self.assertEqual(self.evaluate('state.terrain'),'Psychic')
        psychic=row.locator('.defense-line strong').all_text_contents()
        self.assertIn('spread',row.locator('.range-pill').inner_text())
        for before,after in zip(neutral,psychic):
            self.assertGreater(float(after.split('–')[1].strip('%')),float(before.split('–')[1].strip('%')))
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.evaluate("addOpponentFromSearch('Gardevoir')")
        self.assertEqual(self.page.locator('#terrainInput [aria-pressed="true"]').get_attribute('data-field-value'),'Psychic')
        self.page.locator('#terrainInput [data-field-value=""]').click()
        neutral=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Expanding Force')")
        self.page.locator('#terrainInput [data-field-value="Psychic"]').click()
        psychic=self.evaluate("incomingThreats(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Expanding Force')")
        self.assertIn('spread',row.locator('.range-pill').inner_text())
        self.assertGreater(psychic['ceiling']['high'],neutral['ceiling']['high'])
        for before,after in zip(neutral['scenarios'],psychic['scenarios']):
            self.assertGreater(after['range']['high'],before['range']['high'])
        self.assertEqual(ours,self.evaluate('JSON.stringify(state.ourTeam)'))

    def test_set_editors_and_first_six_opponents(self):
        self.load()
        self.page.locator('.expanded-team details summary').click()
        species=self.page.locator('[data-set-side="our"][data-set-field="name"]')
        species.fill('Mega Garchomp')
        species.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[0].name'),'Mega Garchomp')
        move=self.page.locator('[data-set-side="our"][data-set-field="move-0"]')
        move.fill('Earthquake')
        move.press('Enter')
        self.assertEqual(self.evaluate('state.ourTeam[0].moveSet[0]'),'Earthquake')
        self.assertEqual(self.page.locator('[data-set-side="opponent"]').count(),0)
        self.evaluate("['Gengar','Sylveon','Garchomp','Dragonite','Pelipper','Sneasler','Volcarona'].forEach(addOpponentFromSearch)")
        self.assertEqual(self.page.locator('.opponent-row').count(),6)
        self.page.locator('#toggleOpponentsButton').click()
        self.assertEqual(self.page.locator('.opponent-row').count(),9)
        self.page.locator('#clearOpponentsButton').click()
        self.assertIn('No matchup',self.page.locator('#damageRangeSummary').inner_text())

    def test_opponents_have_no_autofilled_set(self):
        self.load()
        for name in ['Kingambit','Sylveon','Gengar']:
            entry=self.evaluate('name => sanitizeOpponentEntry({name,moveSet:["Protect"],investment:{atk:32},item:"Life Orb",nature:"Adamant"})',name)
            for field in ['moveSet','investment','item','nature','ability']:
                self.assertNotIn(field,entry)
        self.evaluate("addOpponentFromSearch('Gengar')")
        self.assertEqual(self.page.locator('[data-set-side="opponent"]').count(),0)
        self.assertIn('No assumed moves',self.page.locator('#opponentActiveSummary').inner_text())
        self.assertEqual(self.page.locator('.move-row').first.locator('.defense-line').count(),3)

    def test_incoming_strongest_then_five_common_damaging_moves(self):
        self.load("Singles",frozen_usage=True)
        self.evaluate("state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];state.activeOpponentIndex=0;getOpponentPreferences().itemChoice='';render()")
        self.page.locator('[data-damage-direction="incoming"]').click()
        rows=self.evaluate('incomingThreats(state.opponentList[0],state.ourTeam[0])')
        self.assertEqual(len(rows),6)
        self.assertEqual(len({r['name'] for r in rows}),len(rows))
        self.assertTrue(rows[0]['topDamage'])
        self.assertEqual(sum(r['topDamage'] for r in rows),1)
        self.assertEqual([r['name'] for r in rows[1:]],
                         ['Iron Head','Kowtow Cleave','Sucker Punch','Guillotine','Metal Burst'])
        self.assertNotIn('Swords Dance',[r['name'] for r in rows])
        self.assertTrue(all(r['range']['meta']['category']!='Status' for r in rows))
        self.assertIn('98.3% usage',self.page.locator('[data-move="Sucker Punch"]').inner_text())
        self.assertTrue(self.page.locator('#damageRangeSummary').evaluate('(e)=>e.scrollHeight>e.clientHeight'))
        self.page.locator('[data-format="Doubles"]').click()
        rows=self.evaluate('incomingThreats(state.opponentList[0],state.ourTeam[0])')
        self.assertEqual([r['name'] for r in rows[1:]],
                         ['Iron Head','Kowtow Cleave','Sucker Punch','Brick Break','Low Kick'])
        highs=[r['range']['high'] for r in rows]
        self.assertEqual(highs,sorted(highs,reverse=True))
        self.assertNotIn('Protect',[r['name'] for r in rows])
        self.assertIn('40% usage',self.page.locator('[data-move="Low Kick"]').inner_text())
        self.assertEqual(self.page.locator('.move-row').count(),len(rows))

    def test_strongest_move_is_pinned_and_overlap_is_not_duplicated(self):
        self.load()
        result=self.evaluate("""() => [false,true].map(overlap=>{
          const candidates=Array.from({length:10},(_,i)=>({name:`Move ${i}`,percent:i<5?100-i:1,
            range:{high:overlap?100-i:i,low:0,meta:{category:'Physical'}}}));
          candidates.push({name:'Status move',percent:100,range:{high:0,meta:{category:'Status'}}});
          return Battle.selectThreats(candidates);
        })""")
        self.assertEqual([r['name'] for r in result[0]],['Move 9','Move 4','Move 3','Move 2','Move 1','Move 0'])
        self.assertEqual([r['name'] for r in result[1]],['Move 0','Move 1','Move 2','Move 3','Move 4'])
        self.assertTrue(result[1][0]['topDamage'] and result[1][0]['topCommon'])
        self.assertTrue(all(not r['topDamage'] for r in result[1][1:]))

    def test_incoming_damage_uses_complete_reported_spreads_and_frequencies(self):
        self.load("Singles",frozen_usage=True)
        original=self.evaluate('JSON.stringify(state.ourTeam)')
        self.evaluate("addOpponentFromSearch('Sylveon')")
        self.page.locator('[data-damage-direction="incoming"]').click()
        result=self.evaluate("""() => {
          const species=getPokemonByName('Sylveon');
          const usage=getUsage(species);
          const row=incomingNatureComparisons(state.opponentList[0],state.ourTeam[0]).find(r=>r.name==='Hyper Voice');
          const ours=state.ourTeam[0];
          const expected=Battle.range(species,{investment:usage.spreads[0].investment,nature:null,item:'',ability:appliedOpponentAbility(state.opponentList[0])},
            getPokemonByName(ours.name),ours,'Hyper Voice');
          return {row,groups:groupIncomingScenarios(row.scenarios),source:usage.spreads[0],expected};
        }""")
        scenario=result['row']['scenarios'][0]
        self.assertEqual(scenario['investment'],result['source']['investment'])
        self.assertEqual(scenario['percent'],16.6)
        self.assertEqual(scenario['range']['high'],result['expected']['high'])
        self.assertLess(scenario['range']['high'],result['row']['ceiling']['high'])
        move=self.page.locator('[data-move="Hyper Voice"]')
        self.assertIn(f"{result['groups'][0]['reportedPercent']:.2f}".rstrip('0').rstrip('.')+'% of reported sets',move.locator('.incoming-ranges').inner_text())
        self.assertIn('Maximum-offense ceiling',move.inner_text())
        move.locator('.spread-comparisons summary').click()
        self.assertEqual(move.locator('.spread-scenario').count(),len(result['groups']))
        self.assertTrue(move.locator('.spread-list').is_visible())
        self.assertEqual(original,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.assertNotIn('investment',self.evaluate('state.opponentList[0]'))
        self.page.locator('[data-format="Doubles"]').click()
        percent=self.evaluate("Number(groupIncomingScenarios(incomingNatureComparisons(state.opponentList[0],state.ourTeam[0]).find(row=>row.name==='Hyper Voice').scenarios)[0].reportedPercent.toFixed(2))")
        self.assertIn(f'{percent:g}% of reported sets',self.page.locator('[data-move="Hyper Voice"] .incoming-ranges').inner_text())

    def test_mixed_attacker_scenarios_reuse_each_full_spread(self):
        self.load()
        result=self.evaluate("""() => {
          const species=getPokemonByName('Lucario'),ours=state.ourTeam[0],ourSpecies=getPokemonByName(ours.name);
          const spreads=[{rank:1,percent:40,investment:{hp:32,atk:0,def:2,spa:32,spd:0,spe:0}},
                         {rank:2,percent:20,investment:{hp:32,atk:32,def:2,spa:0,spd:0,spe:0}}];
          return ['Close Combat','Aura Sphere'].map(move =>
            Battle.incomingScenarios(species,ourSpecies,ours,move,spreads).scenarios);
        }""")
        self.assertGreater(result[0][1]['range']['high'],result[0][0]['range']['high'])
        self.assertGreater(result[1][0]['range']['high'],result[1][1]['range']['high'])
        for rows in result:
            self.assertEqual([r['percent'] for r in rows],[40,20])
            self.assertEqual(rows[0]['investment'],result[0][0]['investment'])

    def test_missing_spread_data_is_explicit_and_not_synthesized(self):
        self.load("Singles")
        self.evaluate("state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];state.activeOpponentIndex=0;getOpponentPreferences().itemChoice='';render()")
        self.evaluate("getPokemonByName('Kingambit').usage.Singles.spreads=[]")
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.assertIn('Stat-spread usage unavailable',self.page.locator('.move-row').first.inner_text())
        self.assertEqual(self.page.locator('.spread-scenario').count(),0)
        self.assertGreater(self.page.locator('.offense-ceiling').count(),0)

    def test_offensive_nature_matches_each_move_for_mixed_attackers(self):
        self.load()
        original=self.evaluate('JSON.stringify(state.ourTeam)')
        result=self.evaluate("""() => {
          const species=getPokemonByName('Lucario'), ours=state.ourTeam[0];
          return ['Close Combat','Aura Sphere','Body Press'].map(move=>[false,true].map(boostOffenseNature=>
            Battle.incomingRange(species,getPokemonByName(ours.name),ours,move,{boostOffenseNature})));
        }""")
        for pair in result:
            self.assertGreater(pair[1]['high'],pair[0]['high'])
        self.assertEqual(original,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.assertEqual(self.page.locator('#boostOffenseNatureToggle').count(),0)
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.set_nature_preference('offense',False)
        self.set_nature_preference('offense',True)
        self.assertIs(self.evaluate('getOpponentPreferences().offenseNatureChoice'),True)
        self.assertEqual(original,self.evaluate('JSON.stringify(state.ourTeam)'))

    def test_controls_persist_per_pokemon_and_direction(self):
        self.load()
        def choose(role,value):
            self.page.locator(f'#{role}StageControl input[value="{value}"]').locator('..').click()
        def selected(role):
            return self.page.locator(f'#{role}StageControl input:checked').input_value()
        choose('attacker',1)
        choose('defender',-2)
        self.set_nature_preference('defense',True)
        self.page.locator('.compact-team').first.click()
        self.assertEqual(selected('attacker'),'0')
        self.assertEqual(selected('defender'),'-2')
        self.page.locator('.team-row[data-team-index="0"]').click()
        self.assertEqual(selected('attacker'),'1')
        self.page.locator('[data-damage-direction="incoming"]').click()
        choose('attacker',-1)
        choose('defender',2)
        self.set_nature_preference('offense',True)
        self.evaluate("addOpponentFromSearch('Sylveon')")
        self.assertEqual(selected('attacker'),'0')
        self.assertEqual(selected('defender'),'2')
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.assertEqual(self.evaluate('getOpponentPreferences().offenseNatureChoice'),'auto')
        self.page.locator('.opponent-row[data-opponent-index="1"] .pokemon-name').click()
        self.assertEqual(selected('attacker'),'-1')
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))
        self.page.reload()
        self.assertEqual(selected('attacker'),'1')
        self.assertEqual(selected('defender'),'-2')
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'defense').checked"))
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.assertEqual(selected('attacker'),'-1')
        self.assertEqual(selected('defender'),'2')
        self.assertTrue(self.evaluate("natureFlagState(state.opponentList[state.activeOpponentIndex],'offense').checked"))

    def test_item_hints_have_usage_description_and_do_not_change_damage(self):
        self.load(frozen_usage=True)
        self.evaluate("state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];state.activeOpponentIndex=0;getOpponentPreferences().itemChoice='';render()")
        self.assertGreater(self.page.locator('.opponent-row .item-hint img[alt="Life Orb"]').count(),0)
        self.page.locator('[data-damage-direction="incoming"]').click()
        before=self.evaluate('incomingThreats(state.opponentList[0],state.ourTeam[0])')
        hint=self.page.locator('.opponent-row .item-hint').filter(has=self.page.locator('img[alt="Life Orb"]'))
        hint.hover()
        hint.locator('[role="tooltip"]').wait_for(state='visible')
        self.assertIn('Not applied to damage',hint.get_attribute('aria-label'))
        self.assertIn('1.3',hint.get_attribute('aria-label'))
        self.assertEqual(before,self.evaluate('incomingThreats(state.opponentList[0],state.ourTeam[0])'))
        self.evaluate("state.opponentList[0].item='Life Orb'")
        self.assertEqual(before,self.evaluate('incomingThreats(state.opponentList[0],state.ourTeam[0])'))
        self.evaluate("addOpponentFromSearch('Sylveon')")
        self.assertGreater(self.page.locator('.opponent-row .item-hint img[alt="Fairy Feather"]').count(),0)
        self.assertEqual(self.page.locator('.opponent-row .item-hint img[alt="Pixie Plate"]').count(),0)

    def test_opponent_item_activation_is_exclusive_and_affects_all_incoming_ranges(self):
        self.load(frozen_usage=True)
        self.evaluate("state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];state.activeOpponentIndex=0;getOpponentPreferences().itemChoice='';render()")
        self.assertEqual(self.page.locator('[data-damage-direction]').all_text_contents(),['Us → Them','Them → Us'])
        self.page.locator('[data-damage-direction="incoming"]').click()
        ours=self.evaluate('JSON.stringify(state.ourTeam)')
        opponent=self.evaluate('JSON.stringify(state.opponentList[0])')
        baseline=self.evaluate('incomingThreats(state.opponentList[0],state.ourTeam[0])')
        self.assertEqual(self.page.locator('.opponent-row .item-hint[aria-pressed="true"]').count(),0)
        orb=self.page.locator('[data-opponent-item="Life Orb"]')
        glasses=self.page.locator('[data-opponent-item="Black Glasses"]')
        orb.click()
        self.assertEqual(orb.get_attribute('aria-pressed'),'true')
        self.assertNotEqual(orb.evaluate('(el)=>getComputedStyle(el).boxShadow'),'none')
        self.assertIn('Active for damage',orb.get_attribute('aria-label'))
        self.assertIn('Life Orb',self.page.locator('#opponentActiveSummary').inner_text())
        boosted=self.evaluate('incomingThreats(state.opponentList[0],state.ourTeam[0])')
        for name in ['Sucker Punch','Iron Head']:
            before=next(r for r in baseline if r['name']==name)
            after=next(r for r in boosted if r['name']==name)
            self.assertGreater(after['ceiling']['high'],before['ceiling']['high'])
            for previous,current in zip(before['scenarios'],after['scenarios']):
                self.assertGreater(current['range']['high'],previous['range']['high'])
        glasses.click()
        self.assertEqual(orb.get_attribute('aria-pressed'),'false')
        self.assertEqual(glasses.get_attribute('aria-pressed'),'true')
        self.assertEqual(self.page.locator('.opponent-row .item-hint[aria-pressed="true"]').count(),1)
        dark=self.evaluate('incomingThreats(state.opponentList[0],state.ourTeam[0])')
        for name,boosted_by_glasses in [('Sucker Punch',True),('Iron Head',False)]:
            before=next(r for r in baseline if r['name']==name)['ceiling']['high']
            after=next(r for r in dark if r['name']==name)['ceiling']['high']
            if boosted_by_glasses:
                self.assertGreater(after,before)
            else:
                self.assertEqual(after,before)
        glasses.click()
        self.assertEqual(baseline,self.evaluate('incomingThreats(state.opponentList[0],state.ourTeam[0])'))
        orb.press('Space')
        self.assertEqual(orb.get_attribute('aria-pressed'),'true')
        orb.press('Enter')
        self.assertEqual(orb.get_attribute('aria-pressed'),'false')
        self.assertEqual(ours,self.evaluate('JSON.stringify(state.ourTeam)'))
        self.assertEqual(opponent,self.evaluate('JSON.stringify(state.opponentList[0])'))

    def test_opponent_items_persist_per_species_across_formats_switches_and_reload(self):
        self.load(frozen_usage=True)
        self.evaluate("state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];state.activeOpponentIndex=0;getOpponentPreferences().itemChoice='';render()")
        self.page.locator('[data-opponent-item="Life Orb"]').click()
        self.evaluate("addOpponentFromSearch('Sylveon')")
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[0])'),'')
        self.page.locator('[data-opponent-item="Fairy Feather"]').click()
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[0])'),'Fairy Feather')
        # Clicking an item on a compact row changes that Pokémon's choice without selecting it.
        self.page.locator('.opponent-row.compact [data-opponent-item="Black Glasses"]').click()
        self.assertEqual(self.evaluate('state.opponentList[state.activeOpponentIndex].name'),'Sylveon')
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[1])'),'Black Glasses')
        self.page.locator('.opponent-row[data-opponent-index="1"] .pokemon-name').click()
        self.assertEqual(self.evaluate('state.opponentList[0].name'),'Kingambit')
        self.assertEqual(self.page.locator('.opponent-row[data-opponent-index="0"] [data-opponent-item="Black Glasses"]').get_attribute('aria-pressed'),'true')
        self.evaluate("getPokemonByName('Kingambit').usage.Singles.items=[]")
        self.page.locator('[data-format="Singles"]').click()
        selected=self.page.locator('.opponent-row[data-opponent-index="0"] [data-opponent-item="Black Glasses"]')
        self.assertEqual(selected.get_attribute('aria-pressed'),'true')
        self.assertIn('Usage not reported',selected.get_attribute('aria-label'))
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[0])'),'Black Glasses')
        self.page.reload()
        self.assertEqual(self.page.locator('[data-opponent-item="Black Glasses"]').get_attribute('aria-pressed'),'true')
        self.evaluate("addOpponentFromSearch('Sylveon')")
        self.assertEqual(self.page.locator('[data-opponent-item="Fairy Feather"]').get_attribute('aria-pressed'),'true')
        self.evaluate("addOpponentFromSearch('Mega Garchomp');getPreferences(state.opponentList[0],'opponent').itemChoice='Life Orb';render()")
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[0])'),'Garchompite')
        self.assertEqual(self.page.locator('.opponent-row[data-opponent-index="0"] [data-opponent-item]').count(),0)

    def test_selected_opponent_item_is_held_in_outgoing_defense_comparisons(self):
        self.load(frozen_usage=True)
        self.evaluate("state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];state.activeOpponentIndex=0;getOpponentPreferences().itemChoice='';render()")
        self.evaluate("state.ourTeam[0].moveSet=['Knock Off'];render()")
        before=self.page.locator('[data-move="Knock Off"] .defense-line strong').all_text_contents()
        self.page.locator('[data-opponent-item="Life Orb"]').click()
        held=self.page.locator('[data-move="Knock Off"] .defense-line strong').all_text_contents()
        for neutral,boosted in zip(before,held):
            self.assertGreater(float(boosted.split('–')[1].strip('%')),float(neutral.split('–')[1].strip('%')))
        self.page.locator('[data-opponent-item="Life Orb"]').click()
        self.assertEqual(before,self.page.locator('[data-move="Knock Off"] .defense-line strong').all_text_contents())

    def test_usage_ties_use_source_rank_and_missing_is_not_zero(self):
        self.load(frozen_usage=True)
        result=self.evaluate("""() => {
          const candidates=Array.from({length:6},(_,i)=>({name:`Move ${5-i}`,percent:50,usageRank:i+1,
            range:{high:i,low:0,meta:{category:'Physical'}}}));
          return Battle.selectThreats(candidates).filter(r=>r.topCommon).map(r=>r.usageRank).sort();
        }""")
        self.assertEqual(result,[1,2,3,4,5])
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.assertIn('Usage not reported',self.page.locator('#damageRangeSummary').inner_text())
        self.assertEqual(self.evaluate("getItemHints(getPokemonByName('Mega Garchomp'))"),[])
        self.evaluate("addOpponentFromSearch('Ditto')")
        self.assertEqual(self.page.locator('.move-row').count(),0)
        self.assertIn('No damaging moves',self.page.locator('#damageRangeSummary').inner_text())

    def test_directions_and_layout_do_not_overlap(self):
        self.load(frozen_usage=True)
        self.page.locator('[data-damage-direction="incoming"]').click()
        self.assertEqual(self.page.locator('#damageAssumptions').count(),0)
        self.assertGreater(self.page.locator('#damageRangeSummary .move-row').count(),0)
        damage=self.page.locator('.damage-card').bounding_box()
        speed=self.page.locator('.speed-card').bounding_box()
        self.assertLessEqual(damage['y']+damage['height'],speed['y'])
        panel=self.page.locator('.battle-panel').bounding_box()
        self.assertLessEqual(speed['y']+speed['height'],panel['y']+panel['height'])
        self.assertLess(speed['height'],120)
        self.assertGreater(self.page.locator('.damage-list').bounding_box()['height'],160)
        self.assertFalse(self.page.locator('#teamBuilderButton').is_disabled())
        self.assertGreater(self.page.locator('.opponent-row .item-hint').count(),0)
        for viewport in [{'width':1280,'height':800},{'width':390,'height':844}]:
            self.page.set_viewport_size(viewport)
            damage=self.page.locator('.damage-card').bounding_box()
            speed=self.page.locator('.speed-card').bounding_box()
            self.assertLessEqual(damage['y']+damage['height'],speed['y'])
            self.assertTrue(self.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))


if __name__ == '__main__':
    unittest.main()
