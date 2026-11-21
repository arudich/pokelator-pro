import unittest
import re
import test_app as app_tests


class WeatherSpeedTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_speed_tie_estimates_and_compact_badges_use_current_styles(self):
        stale_styles=[]
        self.page.route('**/styles.css?v=20261119-cyan-background-default',
                        lambda route:(stale_styles.append(route.request.url),route.fulfill(body='')))
        self.load()
        self.evaluate("""() => {
          const usage=getPokemonByName('Sylveon').usage.Doubles;
          usage.spreads=[{percent:75,investment:{spe:32}},{percent:25,investment:{spe:0}}];
          usage.natures=[{name:'Jolly',percent:60},{name:'Adamant',percent:40}];
          state.ourTeam=[sanitizeTeamEntry({name:'Sylveon',nature:'Serious',investment:{}})];
          state.opponentList=[sanitizeOpponentEntry({name:'Sylveon'})];
          state.activeOurIndex=state.activeOpponentIndex=0;render();
        }""")
        normal=self.page.locator('#speedSummary .speed-scenario').first
        self.assertEqual(normal.locator('.speed-chance').inner_text(),'90%')
        self.assertIn('10% chance of an actual Speed tie',normal.locator('.speed-chance').get_attribute('title'))
        for width in [1440,390]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.assertTrue(normal.evaluate("row=>{const label=row.querySelector('.speed-tier').getBoundingClientRect(),badge=row.querySelector('.speed-chance').getBoundingClientRect();return badge.left>=label.right+8 && badge.right<=row.getBoundingClientRect().right+1}"))
        self.page.set_viewport_size({'width':1440,'height':900})
        self.evaluate("state.builderPanel='speed';state.builderTopN=347;setView('builder')")
        icon=self.page.locator('#builderSpeedTie [data-tier-species="Sylveon"]')
        self.assertEqual(icon.locator('.speed-chance-badge').inner_text(),'90%')
        self.assertTrue(icon.evaluate("icon=>{const box=icon.getBoundingClientRect(),badge=icon.querySelector('.speed-chance-badge').getBoundingClientRect();return badge.left>=box.left && badge.right<=box.right && badge.bottom<=box.bottom && badge.width<box.width/2 && badge.height<box.height/3}"))
        self.assertEqual(stale_styles,[])

    def test_rapid_opponent_switches_bypass_pre_percentage_cached_adapter(self):
        stale=re.sub(r'speedTier,speedUsageChance,speedField','speedTier,speedField',
                     (app_tests.ROOT/'battle.js').read_text())
        requested=[]
        def old_adapter(route):
            requested.append(route.request.url)
            route.fulfill(status=200,content_type='application/javascript',body=stale)
        self.page.route('**/battle.js?v=20261118-fainted-skulls',old_adapter)
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Aerodactyl',nature:'Jolly',investment:{hp:2,atk:32,spe:32}})];
          state.activeOurIndex=0;state.activeOpponentIndex=0;
          state.opponentList=['Kingambit','Basculegion Male','Mega Kangaskhan','Mega Charizard Y'].map(name=>sanitizeOpponentEntry({name}));
          getPreferences(state.opponentList[0],'opponent').abilityChoice='Defiant';
          getPreferences(state.opponentList[1],'opponent').abilityChoice='Swift Swim';
          render();
        }""")
        for _ in range(5):
            for name in ['Basculegion Male','Kingambit']:
                self.page.locator('.opponent-row .pokemon-name').filter(has_text=re.compile('^'+re.escape(name)+'$')).click()
                self.assertEqual(self.page.locator('#opponentActiveSummary .summary-name').inner_text(),name)
                expected=self.evaluate("getUsage(getPokemonByName(state.opponentList[state.activeOpponentIndex].name)).name")
                self.assertIn('usage for '+expected,self.page.locator('#usageReference').inner_text())
                self.assertEqual(self.page.locator('#speedSummary .speed-tier').all_text_contents(),
                    ['Always Slower','Faster only with speed-boosted nature','Faster with 3 points invested']
                    if name=='Basculegion Male' else ['Always Slower','Always Slower','Faster with 31 points invested'])
                self.assertEqual(self.page.locator('[data-assumed-ability="Defiant"]').count(),0 if name=='Basculegion Male' else 1)
        self.assertEqual(requested,[])

    def test_nature_only_outspeed_estimate_uses_spreads_and_natures_in_both_views(self):
        self.load()
        result=self.evaluate("""() => {
          const species=getPokemonByName('Kingambit');
          const usage=species.usage.Doubles;
          usage.spreads=[{percent:75,investment:{spe:32}},{percent:25,investment:{spe:0}}];
          usage.natures=[{name:'Jolly',percent:60},{name:'Adamant',percent:40}];
          state.ourTeam=[sanitizeTeamEntry({name:'Sylveon',nature:'Serious',investment:{spe:30}})];
          state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];
          state.activeOurIndex=state.activeOpponentIndex=0;render();
          const ours=Battle.speed(getPokemonByName('Sylveon'),state.ourTeam[0]);
          const chance=Battle.speedUsageChance(species,{item:'',ability:''},ours,usage);
          const tie=Battle.speedUsageChance(species,{item:'',ability:''},112,usage);
          return {ours,chance:chance.chance,tie:tie.chance,missing:Battle.speedUsageChance(species,{},ours,{})};
        }""")
        self.assertEqual(result['ours'],110)
        self.assertAlmostEqual(result['chance'],0.45)
        self.assertEqual(result['tie'],0)
        self.assertIsNone(result['missing'])
        normal=self.page.locator('#speedSummary .speed-scenario').first
        self.assertIn('speed-boosted nature',normal.inner_text())
        self.assertEqual(normal.locator('.speed-chance').inner_text(),'45%')
        self.assertIn('independently',normal.locator('.speed-chance').get_attribute('title'))
        self.evaluate("state.builderPanel='speed';state.builderTopN=347;setView('builder')")
        icon=self.page.locator('[data-speed-group="nature"] [data-tier-species="Kingambit"]')
        self.assertEqual(icon.locator('.speed-chance-badge').inner_text(),'45%')
        self.assertEqual(icon.locator('.speed-investment-badge').count(),1)

    def test_opposing_basculegion_rain_changes_speed_and_ability_toggle_updates_it(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Garchomp',nature:'Jolly',investment:{spe:32}})];
          state.opponentList=[sanitizeOpponentEntry({name:'Basculegion Female'})];
          state.activeOurIndex=state.activeOpponentIndex=0;render();
        }""")
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        tiers=self.page.locator('#speedSummary .speed-tier')
        self.assertEqual(tiers.first.inner_text(),'Always Slower')
        self.page.locator('#weatherInput [data-field-value="Rain"]').click()
        self.assertEqual(tiers.all_text_contents(),['Always faster']*3)
        self.assertEqual(self.evaluate('appliedOpponentAbility(state.opponentList[0])'),'Swift Swim')
        self.page.locator('[data-assumed-ability="Swift Swim"]').click()
        self.assertEqual(tiers.first.inner_text(),'Always Slower')
        self.page.locator('[data-assumed-ability="Swift Swim"]').click()
        self.assertEqual(tiers.first.inner_text(),'Always faster')
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.page.locator('#weatherInput [data-field-value=""]').click()
        self.assertEqual(tiers.first.inner_text(),'Always Slower')

    def test_our_swift_swim_applies_to_battle_and_builder_speeds(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Basculegion Female',ability:'Swift Swim',investment:{spa:32,spe:32}})];
          state.opponentList=[sanitizeOpponentEntry({name:'Garchomp'})];
          state.activeOurIndex=state.activeOpponentIndex=0;state.builderTopN=5;render();
        }""")
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        self.assertEqual(self.evaluate("getEffectiveStat(state.ourTeam[0],'spe')"),130)
        self.page.locator('#weatherInput [data-field-value="Rain"]').click()
        self.assertEqual(self.evaluate("getEffectiveStat(state.ourTeam[0],'spe')"),260)
        self.assertEqual(self.page.locator('#speedSummary .speed-tier').first.inner_text(),'Always Slower')
        self.page.locator('#teamBuilderButton').click()
        self.assertIn('260',self.page.locator('#builderSelectedSummary').inner_text())
        self.assertEqual(self.evaluate("""() => {
          const data=Battle.builderSpeedGroups([getPokemonByName('Garchomp')],getPokemonByName(state.ourTeam[0].name),state.ourTeam[0],
            {...state,opponentAbility:appliedOpponentAbility});
          return data.groups.find(group=>group.members.length).kind;
        }"""),'always-slower')
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)

    def test_weather_terrain_boosts_stack_with_items_tailwind_and_respect_suppression(self):
        self.load()
        result=self.evaluate("""() => {
          const species={stats:{spe:100}},entry={investment:{spe:0},item:'Choice Scarf'};
          const cases=[['Swift Swim','Rain',''],['Chlorophyll','Sun',''],['Sand Rush','Sand',''],
            ['Slush Rush','Snow',''],['Surge Surfer','','Electric']];
          return {cases:cases.map(([ability,weather,terrain])=>Battle.speed(species,{...entry,ability},{weather,terrain,tailwind:true})),
            wrongWeather:Battle.speed(species,{...entry,ability:'Swift Swim'},{weather:'Sun'}),
            suppressed:Battle.speed(species,{...entry,ability:'Swift Swim'},Battle.speedField({weather:'Rain'},'Swift Swim','Cloud Nine'))};
        }""")
        self.assertEqual(result['cases'],[600]*5)
        self.assertEqual(result['wrongWeather'],150)
        self.assertEqual(result['suppressed'],150)
