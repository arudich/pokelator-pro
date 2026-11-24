import unittest
import test_app as app_tests


class AegislashToggleTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_one_entry_two_stances_preserve_item_and_change_damage(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Aegislash Shield Forme',item:'Life Orb',moveSet:['Iron Head'],investment:{atk:32}})];
          state.opponentList=[sanitizeOpponentEntry({name:'Aegislash'})];
          state.activeOurIndex=state.activeOpponentIndex=0;state.builderTopN=1;render();
        }""")
        self.assertEqual(self.evaluate("pokemonCatalog.filter(p=>p.name.startsWith('Aegislash')).map(p=>p.name)"),['Aegislash'])
        self.assertEqual(self.evaluate("getPokemonByName('Aegislash-Shield')===getPokemonByName('Aegislash Blade Forme')"),True)
        own=self.page.locator('[data-stance-side="our"]')
        foe=self.page.locator('[data-stance-side="opponent"]')
        self.assertEqual(own.get_attribute('aria-pressed'),'true')
        self.assertEqual(foe.get_attribute('aria-pressed'),'true')
        baseline=self.evaluate("calculateMoveRange(state.ourTeam[0],state.opponentList[0],'Iron Head',0).high")
        foe.click()
        self.assertEqual(self.page.locator('#opponentActiveSummary .summary-name').inner_text(),'Aegislash Shield Forme')
        self.assertLess(self.evaluate("calculateMoveRange(state.ourTeam[0],state.opponentList[0],'Iron Head',0).high"),baseline)
        self.assertEqual(self.page.locator('#opponentActiveBaseStats [data-base-stat="def"]').get_attribute('data-base-value'),'140')
        own.click()
        self.assertEqual(self.evaluate("getEffectiveStat(state.ourTeam[0],'atk')"),102)
        self.assertEqual(self.evaluate('state.ourTeam[0].item'),'Life Orb')
        self.assertIn('Blade',self.page.locator('.expanded-team > img').get_attribute('src'))
        self.assertEqual(self.page.locator('.expanded-team .pokemon-name').inner_text(),'Aegislash')
        self.page.locator('#teamBuilderButton').click()
        self.assertEqual(self.page.locator('[data-stance-side="our"]').get_attribute('aria-pressed'),'false')
        self.assertIn('Aegislash Shield Forme',self.page.locator('#builderSelectedSummary').inner_text())
        self.evaluate('saveTeamToStorage()')
        self.page.reload()
        self.assertEqual(self.evaluate("battleSpecies(state.ourTeam[0],'our').stanceForm"),'Shield')

    def test_voice_lab_presents_one_blade_icon(self):
        self.page.goto(self.url+'/debug/voice.html')
        options=self.page.locator('#species option').all_text_contents()
        self.assertEqual([name for name in options if 'Aegislash' in name],['Aegislash'])
        self.page.locator('#species').select_option(label='Aegislash')
        self.assertIn('Blade',self.page.locator('#batch img').first.get_attribute('src'))
