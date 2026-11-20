import unittest
import test_app as app_tests


class ScarfReferenceTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_common_threshold_highlight_persistence_and_no_calculation_effect(self):
        self.load()
        self.evaluate("state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];state.activeOpponentIndex=0;getOpponentPreferences().itemChoice='';render()")
        self.evaluate("""() => {
          const usage=getUsage(getPokemonByName('Kingambit'));
          usage.items=usage.items.filter(row=>row.name!=='Choice Scarf');
          usage.items.push({name:'Choice Scarf',percent:4.9});render();
        }""")
        self.assertEqual(self.page.locator('[data-opponent-item="Choice Scarf"]').count(),0)
        self.evaluate("getUsage(getPokemonByName('Kingambit')).items.at(-1).percent=5;render()")
        scarf=self.page.locator('[data-opponent-item="Choice Scarf"]')
        self.assertIn('5% Doubles usage',scarf.get_attribute('aria-label'))
        self.evaluate("state.damageDirection='incoming';renderDamageRanges()")
        self.page.locator('[data-opponent-item="Life Orb"]').click()
        damage=self.page.locator('#damageRangeSummary').inner_html()
        speed=self.page.locator('#speedSummary').inner_html()
        scarf.click()
        self.assertEqual(scarf.get_attribute('aria-pressed'),'true')
        self.assertIn('Reference only',scarf.get_attribute('aria-label'))
        self.assertEqual(self.evaluate('appliedOpponentItem(state.opponentList[0])'),'')
        self.assertEqual(self.page.locator('#opponentList [data-opponent-item][aria-pressed="true"]').count(),1)
        self.assertNotEqual(self.page.locator('#damageRangeSummary').inner_html(),damage)
        self.assertEqual(self.page.locator('#speedSummary').inner_html(),speed)
        self.page.reload()
        self.assertEqual(scarf.get_attribute('aria-pressed'),'true')
        self.evaluate("state.activeOpponentIndex=state.opponentList.findIndex(p=>p.name==='Kingambit');render()")
        scarf.click()
        self.assertEqual(self.evaluate('getOpponentPreferences().itemChoice'),'')
        self.evaluate("getOpponentPreferences().itemChoice='Choice Scarf';savePreferences();render()")
        self.page.locator('#resetBattleButton').click()
        self.assertEqual(self.evaluate('getOpponentPreferences().itemChoice'),'')
        self.assertEqual(self.evaluate("getItemHints(getPokemonByName('Mega Garchomp')).length"),0)

    def test_tooltip_dismisses_after_click_and_stays_in_viewport(self):
        self.load()
        for width in [1440,390]:
            self.page.set_viewport_size({'width':width,'height':844})
            item=self.page.locator('#opponentList [data-opponent-item="Life Orb"]')
            self.assertIsNone(item.get_attribute('title'))
            item.hover()
            tooltip=self.page.locator('.item-tooltip:popover-open')
            self.assertTrue(tooltip.is_visible())
            box=tooltip.bounding_box()
            self.assertGreaterEqual(box['x'],0)
            self.assertLessEqual(box['x']+box['width'],width)
            self.assertGreaterEqual(box['y'],0)
            self.assertLessEqual(box['y']+box['height'],844)
            item.click()
            self.page.mouse.move(5,5)
            self.assertEqual(self.page.locator('.item-tooltip:popover-open').count(),0)
