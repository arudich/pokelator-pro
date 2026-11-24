import unittest
import test_app as app_tests


class OpponentMegaChoicesTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_base_stones_default_off_and_switch_stats_ability_and_item(self):
        self.load()
        self.evaluate("state.opponentList=[];addOpponentFromSearch('Charizard')")
        x=self.page.locator('[data-opponent-item="Charizardite X"]')
        y=self.page.locator('[data-opponent-item="Charizardite Y"]')
        self.assertEqual(x.get_attribute('aria-pressed'),'false')
        self.assertEqual(y.get_attribute('aria-pressed'),'false')
        self.assertEqual(self.evaluate("battleSpecies(state.opponentList[0]).name"),'Charizard')
        y.click()
        self.assertEqual(y.get_attribute('aria-pressed'),'true')
        self.assertEqual(x.get_attribute('aria-pressed'),'false')
        self.assertEqual(self.evaluate("battleSpecies(state.opponentList[0]).calcId"),'Charizard-Mega-Y')
        self.assertEqual(self.evaluate("appliedOpponentAbility(state.opponentList[0])"),'Drought')
        self.assertEqual(self.evaluate("appliedOpponentItem(state.opponentList[0])"),'Charizardite Y')
        self.assertEqual(self.page.locator('#opponentActiveSummary .summary-name').inner_text(),'Mega Charizard Y')
        self.assertEqual(self.page.locator('#opponentList .pokemon-name').inner_text(),'Charizard')
        before=self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Flamethrower',0).high")
        y.click()
        after=self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Flamethrower',0).high")
        self.assertGreater(before,after)
        x.click()
        self.assertEqual(self.evaluate("battleSpecies(state.opponentList[0]).types"),['Fire','Dragon'])
        self.assertEqual(self.evaluate("appliedOpponentAbility(state.opponentList[0])"),'Tough Claws')
        self.page.reload()
        self.evaluate("state.opponentList=[];addOpponentFromSearch('Charizard')")
        self.assertEqual(self.evaluate("battleSpecies(state.opponentList[0]).name"),'Mega Charizard X')

    def test_ordinary_item_and_stones_are_mutually_exclusive(self):
        self.load(frozen_usage=True);self.evaluate("state.opponentList=[];addOpponentFromSearch('Garchomp')")
        self.page.locator('[data-opponent-item="Garchompite"]').click()
        self.page.locator('[data-opponent-item="Life Orb"]').click()
        self.assertEqual(self.evaluate("battleSpecies(state.opponentList[0]).name"),'Garchomp')
        self.assertEqual(self.evaluate("appliedOpponentItem(state.opponentList[0])"),'Life Orb')
        self.assertEqual(self.page.locator('#opponentList [aria-pressed="true"].item-hint').count(),1)

    def test_named_mega_reuses_base_and_restricts_item_choices(self):
        self.load();self.evaluate("state.opponentList=[];addOpponentFromSearch('Garchomp');getOpponentPreferences().offenseStage=2;addOpponentFromSearch('Mega Garchomp')")
        self.assertEqual(self.evaluate('state.opponentList.length'),1)
        self.assertEqual(self.evaluate('getOpponentPreferences().offenseStage'),2)
        self.assertEqual(self.evaluate('battleSpecies(state.opponentList[0]).name'),'Mega Garchomp')
        self.assertEqual(self.page.locator('#opponentList [data-opponent-item]').count(),0)
        self.assertEqual(self.page.locator('#opponentList [data-mega-side="opponent"]').get_attribute('aria-pressed'),'true')
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[0])'),'Garchompite')
        self.evaluate("addOpponentFromSearch('Garchomp')")
        self.assertEqual(self.evaluate('state.opponentList.length'),1)
        self.assertEqual(self.evaluate('state.opponentList[0].name'),'Mega Garchomp')
        self.evaluate("state.opponentList=[];addOpponentsByName(['Mega Charizard Y','Charizard'])")
        self.assertEqual(self.evaluate('state.opponentList.length'),1)
        self.assertEqual(self.evaluate('state.opponentList[0].name'),'Mega Charizard Y')

    def test_natural_palafin_and_multi_name_mega_boundaries(self):
        self.load()
        result=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['Palafin','Tyranitar Mega Aerodactyl','Dragonite mega back scaliber Aerodactyl Ninetales cleavore',
            'Meowscarada Overqwil Blaziken Mega Starmie Altaria'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(result,[['Palafin Zero Form'],['Tyranitar','Mega Aerodactyl'],
          ['Dragonite','Mega Baxcalibur','Aerodactyl','Ninetales','Kleavor'],['Meowscarada','Overqwil','Blaziken','Mega Starmie','Altaria']])
