import unittest
import test_app as app_tests


class ItemSizeTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_fixed_size_and_name_row_position(self):
        self.load()
        self.evaluate("['Sylveon','Bellibolt'].forEach(addOpponentFromSearch)")
        self.assertTrue(self.evaluate("""() => [...document.querySelectorAll('.opponent-row .item-hints')].every(hints=>{
          const row=hints.closest('.opponent-name-line'),tag=row.querySelector('.column-tag').getBoundingClientRect();
          const name=row.querySelector('.pokemon-name').getBoundingClientRect(),icons=hints.getBoundingClientRect();
          return icons.right<=tag.left && icons.top<name.bottom && icons.bottom>name.top;
        })"""))
        self.assertEqual(self.page.locator('#itemIconSizeSlider').count(),0)
        self.assertTrue(self.evaluate('Array.from(document.querySelectorAll(".item-hint img")).every(img=>img.getBoundingClientRect().width===28 && img.getBoundingClientRect().height===28)'))
        self.page.reload()
        self.assertEqual(self.page.locator('.item-hint img').first.bounding_box()['width'],28)
        self.page.locator('#opponentList .item-hint').first.click()
        self.assertNotEqual(self.evaluate('appliedOpponentItem(state.opponentList[state.activeOpponentIndex])'),'')
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
