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
        self.assertEqual(x.count(),0)
        self.assertEqual(self.evaluate("battleSpecies(state.opponentList[0]).calcId"),'Charizard-Mega-Y')
        self.assertEqual(self.evaluate("appliedOpponentAbility(state.opponentList[0])"),'Drought')
        self.assertEqual(self.evaluate("appliedOpponentItem(state.opponentList[0])"),'Charizardite Y')
        self.assertEqual(self.page.locator('#opponentActiveSummary .summary-name').inner_text(),'Mega Charizard Y')
        self.assertEqual(self.page.locator('#opponentList .pokemon-name').inner_text(),'Mega Charizard Y')
        self.assertEqual(self.page.locator('#opponentList .pokemon-type').inner_text(),'Fire / Flying')
        before=self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Flamethrower',0).high")
        self.page.locator('[data-assumed-ability="Drought"]').click()
        y.click()
        self.assertEqual(x.get_attribute('aria-pressed'),'false')
        after=self.evaluate("calculateMoveRange(state.opponentList[0],state.ourTeam[0],'Flamethrower',0).high")
        self.assertGreater(before,after)
        x.click()
        self.assertEqual(self.evaluate("battleSpecies(state.opponentList[0]).types"),['Fire','Dragon'])
        self.assertEqual(self.evaluate("appliedOpponentAbility(state.opponentList[0])"),'Tough Claws')
        x.click()
        y.click()
        self.assertEqual(self.page.locator('[data-assumed-ability="Drought"]').get_attribute('aria-pressed'),'false')
        y.click()
        x.click()
        self.page.reload()
        self.evaluate("state.opponentList=[];addOpponentFromSearch('Charizard')")
        self.assertEqual(self.evaluate("battleSpecies(state.opponentList[0]).name"),'Mega Charizard X')

    def test_kangaskhan_restores_scarf_scenario_and_item_after_each_toggle(self):
        self.load()
        self.evaluate("state.opponentList=[];addOpponentFromSearch('Mega Kangaskhan')")
        stone=self.page.locator('#opponentList [data-mega-side="opponent"]')
        scarf=self.page.locator('#speedSummary .speed-scenario').filter(has_text='Choice Scarf')
        self.assertIn('Mega Stone required',scarf.inner_text())
        stone.click()
        self.assertEqual(self.page.locator('#opponentActiveSummary .summary-name').inner_text(),'Kangaskhan')
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[0])'),'')
        self.assertEqual(scarf.locator('.speed-tier').count(),1)
        self.assertEqual(self.evaluate("""() => {
          const species=battleSpecies(state.opponentList[0]);
          return Battle.speed(species,{item:'Choice Scarf',investment:{}});
        }"""),165)
        self.evaluate("getOpponentPreferences().itemChoice='Life Orb';render()")
        stone.click()
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[0])'),'Kangaskhanite')
        self.assertIn('Mega Stone required',scarf.inner_text())
        stone.click()
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[0])'),'Life Orb')
        self.assertEqual(scarf.locator('.speed-tier').count(),1)

    def test_other_item_choices_hide_and_restore_with_mega_evolution(self):
        self.load(frozen_usage=True);self.evaluate("state.opponentList=[];addOpponentFromSearch('Garchomp')")
        stone=self.page.locator('[data-opponent-item="Garchompite"]')
        life_orb=self.page.locator('[data-opponent-item="Life Orb"]')
        life_orb.click()
        stone.click()
        self.assertEqual(life_orb.count(),0)
        self.assertEqual(self.evaluate("appliedOpponentItem(state.opponentList[0])"),'Garchompite')
        points=self.page.locator('#opponentList [data-range-stat="spe"] [data-point^="neutral"]')
        self.assertEqual(points.all_text_contents(),['112','144'])
        stone.click()
        self.assertEqual(life_orb.get_attribute('aria-pressed'),'true')
        self.assertEqual(points.all_text_contents(),['122','154'])
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
