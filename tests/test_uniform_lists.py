import unittest
import test_app as app_tests


class UniformListTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_name_type_spacing_does_not_depend_on_items(self):
        self.load()
        self.evaluate("""() => {
          state.opponentList=['Pelipper','Maushold','Kingambit'].map(name=>sanitizeOpponentEntry({name}));render();
        }""")
        for width in [1440,390]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.assertTrue(self.evaluate("""() => {
              const rows=[...document.querySelectorAll('.opponent-row,.team-row.compact-team')];
              const gaps=rows.map(row=>{
                const name=row.querySelector('.pokemon-name').getBoundingClientRect(),type=row.querySelector('.pokemon-type').getBoundingClientRect();
                const portrait=row.querySelector('.team-avatar').getBoundingClientRect();
                if(name.left<portrait.right+5) throw Error('Portrait overlaps text');
                return type.top-name.bottom;
              });
              return Math.max(...gaps)-Math.min(...gaps)<1;
            }"""))

    def test_uniform_opponents_and_known_team_items_and_base_stats(self):
        self.load()
        self.evaluate("['Sylveon','Bellibolt'].forEach(addOpponentFromSearch)")
        self.assertEqual(self.page.locator('.opponent-row.expanded').count(),0)
        self.assertEqual(self.page.locator('.opponent-row.compact').count(),3)
        self.assertTrue(self.evaluate("Array.from(document.querySelectorAll('.opponent-row')).every(row=>row.querySelectorAll('[data-base-stat]').length===6 && row.querySelector('[data-opponent-action=delete]'))"))
        self.page.locator('.opponent-row').last.locator('.pokemon-name').click()
        self.assertEqual(self.page.locator('.opponent-row.expanded').count(),0)
        self.assertEqual(self.page.locator('.team-row .known-item').count(),3)
        self.assertTrue(self.evaluate("Array.from(document.querySelectorAll('.known-item')).every(item=>item.tagName==='SPAN' && !item.hasAttribute('aria-pressed') && getComputedStyle(item).borderTopColor==='rgba(0, 0, 0, 0)')"))
        self.assertTrue(self.evaluate("Array.from(document.querySelectorAll('.team-row')).every(row=>row.querySelectorAll('[data-base-stat]').length===6)"))
        self.assertEqual(self.page.locator('.expanded-team .known-item img').get_attribute('alt'),'Focus Sash')
        for width in [1440,390]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.assertTrue(self.evaluate("""() => {
              const plus=document.querySelector('[data-nature-mode=plus]').getBoundingClientRect(),minus=document.querySelector('[data-nature-mode=minus]').getBoundingClientRect();
              const base=document.querySelector('.selected-base-stats').getBoundingClientRect();
              return Math.abs(plus.top-minus.top)<1 && base.top>=Math.max(plus.bottom,minus.bottom) && document.documentElement.scrollWidth<=innerWidth;
            }"""))
