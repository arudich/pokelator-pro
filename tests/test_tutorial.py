import unittest
import test_app as app_tests


class TutorialTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def test_first_visit_navigation_close_and_remembered_dismissal(self):
        # An isolated context without the ordinary test harness's seen flag.
        context=self.browser.new_context(viewport={'width':1440,'height':1000})
        context.route('https://**/*',lambda route:route.abort())
        page=context.new_page()
        page.on('pageerror',lambda error:self.errors.append(str(error)))
        try:
            page.goto(self.url)
            page.wait_for_selector('#tutorialDialog[open]')
            bounds=page.locator('#tutorialDialog').bounding_box()
            self.assertGreater(bounds['width'],1400)
            self.assertGreater(bounds['height'],960)
            self.assertEqual(page.locator('#tutorialProgress').inner_text(),'1 / 4')
            self.assertTrue(page.locator('#tutorialPrevious').is_disabled())
            for index in range(4):
                page.wait_for_function('document.getElementById("tutorialImage").complete && document.getElementById("tutorialImage").naturalWidth===4320')
                self.assertEqual(page.locator('#tutorialImage').get_attribute('height'),'810')
                self.assertLessEqual(page.locator('#tutorialCaption').inner_text().count('.'),1)
                if index<3:page.keyboard.press('ArrowRight')
            self.assertTrue(page.locator('#tutorialDone').is_visible())
            page.locator('#tutorialDone').click()
            self.assertFalse(page.locator('#tutorialDialog').is_visible())
            page.reload();page.wait_for_selector('#tutorialButton')
            self.assertFalse(page.locator('#tutorialDialog').is_visible())
            page.locator('#tutorialButton').click()
            self.assertEqual(page.locator('#tutorialProgress').inner_text(),'1 / 4')
            page.keyboard.press('Escape')
            self.assertFalse(page.locator('#tutorialDialog').is_visible())
        finally:context.close()

    def test_reopening_does_not_change_team_and_fits_mobile(self):
        self.load()
        saved=self.evaluate('JSON.stringify(state.ourTeam)')
        self.page.set_viewport_size({'width':390,'height':844})
        self.page.locator('#tutorialButton').click()
        self.page.wait_for_selector('#tutorialDialog[open]')
        bounds=self.page.locator('#tutorialDialog').bounding_box()
        self.assertGreaterEqual(bounds['x'],0)
        self.assertLessEqual(bounds['x']+bounds['width'],391)
        self.assertGreaterEqual(bounds['y'],0)
        self.assertLessEqual(bounds['y']+bounds['height'],845)
        self.page.locator('#tutorialNext').click()
        self.page.locator('.tutorial-close').click()
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),saved)
