import unittest
import test_app as app_tests


class ItemSizeTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_kangaskhan_items_stay_in_the_name_row_when_they_fit(self):
        self.load()
        self.evaluate("""() => {
          const species=getPokemonByName('Kangaskhan');
          species.usage[state.format]={...getUsage(species),items:[
            {name:'Life Orb',percent:60}, {name:'Choice Scarf',percent:40}
          ]};
          render();
        }""")
        row=self.page.locator('#opponentList .opponent-row').first
        stone=row.locator('[data-mega-side="opponent"]')
        for width in [1440,1722]:
            self.page.set_viewport_size({'width':width,'height':900})
            for form,items in [('Mega Kangaskhan',1),('Kangaskhan',3)]:
                self.assertEqual(row.locator('.pokemon-name').inner_text(),form)
                self.assertEqual(row.locator('.item-hint').count(),items)
                name=row.locator('.pokemon-name').bounding_box()
                icons=row.locator('.item-hints').bounding_box()
                self.assertGreaterEqual(icons['x'], name['x']+name['width'])
                self.assertLess(icons['y'],name['y']+name['height'])
                self.assertGreater(icons['y']+icons['height'],name['y'])
                stone.click()

    def test_fixed_size_and_name_row_position(self):
        self.load(frozen_usage=True)
        self.evaluate("['Sylveon','Bellibolt'].forEach(addOpponentFromSearch)")
        self.assertTrue(self.evaluate("""() => [...document.querySelectorAll('.opponent-row .item-hints')].every(hints=>{
          const row=hints.closest('.opponent-name-line'),tag=row.querySelector('.column-tag').getBoundingClientRect();
          const name=row.querySelector('.pokemon-name').getBoundingClientRect(),icons=hints.getBoundingClientRect();
          return (icons.right<=tag.left && icons.top<name.bottom && icons.bottom>name.top)
            || (icons.top>=tag.bottom && icons.top>=name.bottom && icons.left===name.left);
        })"""))
        self.assertEqual(self.page.locator('#itemIconSizeSlider').count(),0)
        self.assertTrue(self.evaluate('Array.from(document.querySelectorAll(".item-hint img")).every(img=>img.getBoundingClientRect().width===28 && img.getBoundingClientRect().height===28)'))
        self.page.reload()
        self.assertEqual(self.page.locator('.item-hint img').first.bounding_box()['width'],28)
        self.evaluate("addOpponentFromSearch('Kingambit');getOpponentPreferences().itemChoice='';render()")
        self.page.locator('.opponent-row[data-opponent-index="0"] [data-opponent-item="Life Orb"]').click()
        self.assertNotEqual(self.evaluate('appliedOpponentItem(state.opponentList[state.activeOpponentIndex])'),'')
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
