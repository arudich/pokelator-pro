import unittest
import test_app as app_tests


class CastformWeatherTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def fixture(self):
        self.load()
        self.evaluate("""()=>{
          state.ourTeam=[sanitizeTeamEntry({name:'Raichu',nature:'Serious',moveSet:['Thunderbolt']})];
          state.opponentList=[sanitizeOpponentEntry({name:'Castform Sunny Form'})];
          state.activeOurIndex=state.activeOpponentIndex=0;state.weather='';render();
        }""")

    def test_weather_changes_active_form_type_and_damage_but_not_list(self):
        self.fixture()
        normal=self.evaluate("calculateMoveRange(state.ourTeam[0],state.opponentList[0],'Thunderbolt',0).maxDamage")
        for weather,form,type_ in [('Sun','Sunny','Fire'),('Rain','Rainy','Water'),('Snow','Snowy','Ice'),('Sand','','Normal'),('','','Normal')]:
            self.page.locator(f'#weatherInput [data-field-value="{weather}"]').click()
            self.assertEqual(self.page.locator('#opponentList .pokemon-name').inner_text(),'Castform')
            self.assertTrue(self.page.locator('#opponentList img').first.get_attribute('src').endswith('/Castform.png'))
            self.assertEqual(self.page.locator('#opponentActiveSummary .summary-name').inner_text(),f'Castform {form} Form' if form else 'Castform')
            self.assertEqual(self.page.locator('#opponentActiveSummary .summary-types').inner_text(),type_)
            self.assertEqual(self.evaluate('state.opponentList[0].types'),['Normal'])
            if weather=='Rain':
                self.assertGreater(self.evaluate("calculateMoveRange(state.ourTeam[0],state.opponentList[0],'Thunderbolt',0).maxDamage"),normal*1.8)
            move=self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Weather Ball',null)")
            self.assertNotIn('error',move)
            self.assertEqual(move['meta']['type'],type_ if weather not in ['Sand',''] else 'Rock' if weather=='Sand' else 'Normal')
        self.evaluate("addOpponentFromSearch('Castform Rainy Form')")
        self.assertEqual(self.evaluate('state.opponentList.length'),1)
        self.assertEqual(self.evaluate("pokemonCatalog.filter(p=>p.name.startsWith('Castform')).map(p=>p.name)"),['Castform'])

    def test_forecast_disabled_and_weather_suppression_return_to_normal(self):
        self.fixture();self.page.locator('#weatherInput [data-field-value="Sun"]').click()
        damage=self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Weather Ball',null).maxDamage")
        self.page.locator('[data-assumed-ability="Forecast"]').click()
        self.assertEqual(self.page.locator('#opponentActiveSummary .summary-types').inner_text(),'Normal')
        self.assertLess(self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Weather Ball',null).maxDamage"),damage)
        self.page.locator('[data-assumed-ability="Forecast"]').click()
        self.evaluate("state.ourTeam=[sanitizeTeamEntry({name:'Altaria',ability:'Cloud Nine',moveSet:['Dragon Pulse']})];render()")
        self.assertEqual(self.page.locator('#opponentActiveSummary .summary-name').inner_text(),'Castform')
        self.assertEqual(self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Weather Ball',null).meta.type"),'Normal')

    def test_our_castform_and_pure_engine_use_the_supplied_weather(self):
        self.fixture()
        self.evaluate("state.ourTeam=[sanitizeTeamEntry({name:'Castform',moveSet:['Weather Ball']})];state.opponentList=[sanitizeOpponentEntry({name:'Raichu'})];render()")
        self.page.locator('#weatherInput [data-field-value="Rain"]').click()
        self.assertEqual(self.page.locator('#ourActiveSummary .summary-types').inner_text(),'Water')
        self.assertEqual(self.page.locator('.expanded-team .pokemon-name').inner_text(),'Castform')
        self.assertEqual(self.evaluate("Battle.forecastSpecies(getPokemonByName('Castform'),'Forecast','Hail').types"),['Ice'])
        self.assertEqual(self.evaluate("Battle.forecastSpecies(getPokemonByName('Castform'),'','Sun').types"),['Normal'])
        # A calculation's explicit field overrides the current UI weather.
        self.assertEqual(self.evaluate("calculateMoveRange(state.ourTeam[0],state.opponentList[0],'Weather Ball',null,{weather:'Sun'}).meta.type"),'Fire')
