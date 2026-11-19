import unittest
import test_app as app_tests


class WeatherSpeedTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

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
