import unittest
import test_app as app_tests


class FieldIconTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_effect_tooltips_have_second_line_and_abilities_keep_effect_when_disabled(self):
        self.load()
        self.assertTrue(self.evaluate("Array.from(document.querySelectorAll('[data-field-option]')).every(b=>b.title.split('\\n').length===2 && b.title.split('\\n')[1].length>10)"))
        self.assertIn('×1.5',self.page.locator('#weatherInput [data-field-value="Rain"]').get_attribute('title'))
        self.assertIn('grounded',self.page.locator('#terrainInput [data-field-value="Psychic"]').get_attribute('title'))
        self.evaluate("addOpponentFromSearch('Mega Garchomp')")
        ability=self.page.locator('[data-assumed-ability="Sand Force"]')
        tooltip=ability.get_attribute('title')
        self.assertTrue(tooltip.startswith('Sand Force\n'))
        self.assertIn('1.3',tooltip)
        self.assertNotIn('Click',tooltip)
        ability.click()
        self.assertEqual(ability.get_attribute('title'),tooltip)
        self.assertEqual(ability.get_attribute('aria-pressed'),'false')
        self.assertTrue(self.evaluate('pokerData.every(p=>p.abilities.every(name=>ABILITY_EFFECTS[calc.toID(name)]))'))

    def test_exclusive_icons_header_alignment_reset_and_shared_builder_state(self):
        self.load()
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        self.assertEqual(self.page.locator('.damage-toolbar .field-icon').count(),10)
        self.assertEqual(self.page.locator('#weatherInput select, #terrainInput select').count(),0)
        self.assertTrue(self.evaluate("""() => {
          const row=document.querySelector('.damage-toolbar'),items=[row.querySelector('h3'),row.querySelector('.direction-controls'),row.querySelector('.battle-field-icons')];
          const centers=items.map(el=>{const r=el.getBoundingClientRect();return r.top+r.height/2;});
          return Math.max(...centers)-Math.min(...centers)<2;
        }"""))
        for value in ['Sun','Rain']:
            self.page.locator(f'#weatherInput [data-field-value="{value}"]').click()
        self.assertEqual(self.page.locator('#weatherInput [aria-pressed="true"]').count(),1)
        self.assertEqual(self.evaluate('state.weather'),'Rain')
        self.page.locator('#terrainInput [data-field-value="Psychic"]').click()
        self.page.locator('#weatherInput [data-field-value=""]').click()
        self.assertEqual(self.evaluate('[state.weather,state.terrain]'),['','Psychic'])
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="offense"]').click()
        self.assertEqual(self.page.locator('#offenseTerrainInput [aria-pressed="true"]').get_attribute('data-field-value'),'Psychic')
        self.page.locator('#offenseWeatherInput [data-field-value="Sand"]').click()
        self.page.locator('#battleViewButton').click()
        self.assertEqual(self.page.locator('#weatherInput [aria-pressed="true"]').get_attribute('data-field-value'),'Sand')
        self.page.locator('#resetBattleButton').click()
        self.assertEqual(self.evaluate('[state.weather,state.terrain]'),['',''])
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
