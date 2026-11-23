import unittest
import test_app as app_tests


class QuickTooltipTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_view_title_and_info_icon_explain_hover_across_tabs(self):
        self.load()
        self.evaluate("state.builderPanel='speed';state.builderTopN=3;setView('builder')")
        self.assertEqual(self.page.locator('#builderPanelTitle').inner_text(),'Speed Tiers')
        button=self.page.locator('.view-info-button')
        button.focus()
        self.page.wait_for_selector('#quickTooltip:popover-open')
        self.assertIn('Hover over Pokémon',self.page.locator('#quickTooltip').inner_text())
        self.page.keyboard.press('Escape')
        self.assertFalse(self.evaluate("document.getElementById('quickTooltip').matches(':popover-open')"))
        self.page.locator('[data-builder-panel=defense]').click()
        self.assertEqual(self.page.locator('.view-info-button').count(),1)

    def test_matchup_tooltip_has_short_delay_no_native_duplicate_and_restores_title(self):
        self.load()
        self.evaluate("state.builderPanel='speed';state.builderTopN=3;setView('builder')")
        icon=self.page.locator('#builderSpeedTiers .tier-pokemon').first
        original=icon.get_attribute('title')
        icon.hover()
        self.page.wait_for_selector('#quickTooltip:popover-open',timeout=1500)
        self.assertEqual(self.page.locator('#quickTooltip').inner_text(),original)
        self.assertIsNone(icon.get_attribute('title'))
        bounds=self.page.locator('#quickTooltip').bounding_box()
        self.assertGreaterEqual(bounds['x'],0)
        self.assertLessEqual(bounds['x']+bounds['width'],1440)
        self.page.locator('#builderPanelTitle').hover()
        self.assertEqual(icon.get_attribute('title'),original)
        self.assertFalse(self.evaluate("document.getElementById('quickTooltip').matches(':popover-open')"))
