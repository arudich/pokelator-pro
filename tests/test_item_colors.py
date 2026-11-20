import unittest
import test_app as app_tests


class ItemColorTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    def load(self):
        app_tests.AppTests.load(self)
        self.assertFalse(self.evaluate("document.getElementById('itemColorDialog').open"))
        self.page.locator('#itemColorsButton').click()

    evaluate = app_tests.AppTests.evaluate

    def test_independent_live_colors_selection_and_storage(self):
        self.load()
        self.evaluate("""() => {
          state.opponentList=['Mega Garchomp','Mega Kangaskhan'].map(name=>sanitizeOpponentEntry({name}));
          state.activeOpponentIndex=0;render();
          window.teamBefore=JSON.stringify(state.ourTeam);
        }""")
        self.page.locator('[data-color-key=selected] summary').click()
        self.page.locator('#selectedItemColor').get_by_label('Hex color',exact=True).fill('#ff0000')
        self.page.locator('[data-color-key=other] summary').click()
        self.assertEqual(self.page.locator('.color-editor-row[open]').count(),1)
        self.page.locator('#otherItemColor').get_by_label('Hex color',exact=True).fill('#00ff00')
        colors=lambda: self.evaluate("Array.from(document.querySelectorAll('#opponentList .mega-stone'),el=>getComputedStyle(el).borderTopColor)")
        self.assertEqual(colors(),['rgb(255, 0, 0)','rgb(0, 255, 0)'])
        self.evaluate('state.activeOpponentIndex=1;renderOpponentList()')
        self.assertEqual(colors(),['rgb(255, 0, 0)','rgb(0, 255, 0)'])
        self.assertEqual(self.page.locator('.item-color-selected .pokemon-name').inner_text(),'Mega Kangaskhan')
        self.assertTrue(self.evaluate('JSON.stringify(state.ourTeam)===teamBefore'))
        self.page.locator('#lockItemColors').click()
        self.page.reload()
        self.page.wait_for_selector('.move-row')
        self.assertEqual(self.evaluate('itemHighlightColors'),{'selected':'#ff0000','other':'#00ff00'})
        self.assertFalse(self.evaluate("document.getElementById('itemColorDialog').open"))
        self.page.locator('#itemColorsButton').click()
        self.page.locator('#resetItemColors').click()
        self.assertEqual(self.evaluate('itemHighlightColors.selected'),'#ff0000')

    def test_picker_channels_and_mobile_fit(self):
        self.load()
        self.page.set_viewport_size({'width':390,'height':700})
        self.page.locator('[data-color-key=selected] summary').click()
        picker=self.page.locator('#selectedItemColor')
        picker.get_by_label('Hex color',exact=True).fill('#ff000080')
        self.assertEqual(self.evaluate("document.getElementById('selectedItemColor').value"),'#ff000080')
        picker.get_by_label('Green',exact=True).fill('255')
        self.assertEqual(self.evaluate("document.getElementById('selectedItemColor').value"),'#ffff0080')
        self.evaluate("""() => {
          const picker=document.getElementById('selectedItemColor');picker.value='#ff0000';
          const hue=picker.shadowRoot.querySelector('[data-channel=h]');hue.value=120;hue.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        self.assertEqual(self.evaluate('itemHighlightColors.selected'),'#00ff00')
        bounds=self.page.locator('#itemColorDialog').bounding_box()
        self.assertGreaterEqual(bounds['x'],0)
        self.assertLessEqual(bounds['x']+bounds['width'],390)
        self.assertLessEqual(bounds['y']+bounds['height'],700)
        picker.get_by_role('button',name='Use #70d7ff').click()
        self.assertEqual(self.evaluate('itemHighlightColors.selected'),'#70d7ff')

    def test_defaults_app_colors_and_drag(self):
        self.load()
        self.assertEqual(self.evaluate('itemHighlightColors.other'),'#3e7a91')
        self.assertEqual(self.evaluate('itemHighlightColors.selected'),'#70d7ff')
        dialog=self.page.locator('#itemColorDialog')
        initial=dialog.bounding_box()
        self.assertAlmostEqual(initial['x']+initial['width'],1428,delta=2)
        self.assertLess(initial['height'],600)
        header=self.page.locator('.item-color-header').bounding_box()
        self.page.mouse.move(header['x']+30,header['y']+10)
        self.page.mouse.down()
        self.page.mouse.move(header['x']-170,header['y']-90)
        self.page.mouse.up()
        moved=dialog.bounding_box()
        self.assertLess(moved['x'],initial['x']-100)
        self.page.locator('[data-color-key=accent] summary').click()
        self.page.locator('#accentItemColor').get_by_label('Hex color',exact=True).fill('#ff55aa')
        self.assertEqual(self.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()"),'#ff55aa')
        self.page.locator('#lockItemColors').click()
        self.page.reload()
        self.page.wait_for_selector('.move-row')
        self.assertEqual(self.evaluate('appColors.accent'),'#ff55aa')

    def test_pick_element_opens_matching_editor_without_activating_target(self):
        self.load()
        self.page.locator('#pickElementColor').click()
        self.page.locator('#teamBuilderButton').click()
        self.assertEqual(self.evaluate('state.view'),'battle')
        self.assertEqual(self.page.locator('.color-editor-row[open]').get_attribute('data-color-key'),'text')
        self.page.locator('#pickElementColor').click()
        self.page.locator('.expanded-team select[data-nature-mode]').first.click()
        self.assertEqual(self.page.locator('.color-editor-row[open]').get_attribute('data-color-key'),'control-bg')
        self.page.locator('#pickElementColor').click()
        self.page.keyboard.press('Escape')
        self.assertEqual(self.page.locator('#pickElementColor').get_attribute('aria-pressed'),'false')
        self.assertTrue(self.evaluate("document.getElementById('itemColorDialog').open"))

    def test_reset_and_other_ui_saves_preserve_locked_palette(self):
        self.load()
        self.page.locator('[data-color-key=accent] summary').click()
        field=self.page.locator('#accentItemColor').get_by_label('Hex color',exact=True)
        field.fill('#123456')
        self.page.locator('#lockItemColors').click()
        field.fill('#abcdef')
        self.page.locator('#resetItemColors').click()
        self.assertEqual(field.input_value(),'#123456')
        field.fill('#987654')
        self.page.locator('#metaModeToggle').click()
        self.page.reload()
        self.page.wait_for_selector('.move-row')
        self.assertEqual(self.evaluate('appColors.accent'),'#123456')

    def test_site_defaults_capture_current_palette_and_survive_later_edits(self):
        self.context.add_init_script("""if(!localStorage.getItem('palette-test-seeded')) {
          localStorage.setItem('pokelator-pro-ui-v1',JSON.stringify({colorEditorVersion:2,deepBackgroundVersion:1,toolbarColorsVersion:2,
            itemHighlightColors:{selected:'#aabbcc',other:'#445566'},appColors:{accent:'#112233','panel':'#223344'}}));
          localStorage.setItem('palette-test-seeded','yes');
        }""")
        self.load()
        self.page.locator('[data-color-key=accent] summary').click()
        self.page.locator('#accentItemColor').get_by_label('Hex color',exact=True).fill('#abcdef')
        self.page.locator('#lockItemColors').click()
        self.page.reload();self.page.wait_for_selector('.move-row')
        self.page.locator('#itemColorsButton').click()
        self.page.locator('#defaultItemColors').click()
        self.assertEqual(self.evaluate('appColors.accent'),'#112233')
        self.assertEqual(self.evaluate('appColors.panel'),'#223344')
        self.assertEqual(self.evaluate('itemHighlightColors'),{'selected':'#aabbcc','other':'#445566'})
        self.page.locator('#resetItemColors').click()
        self.assertEqual(self.evaluate('appColors.accent'),'#abcdef')

    def test_new_browser_uses_cyan_deep_background(self):
        self.load()
        self.assertEqual(self.evaluate("appColors['bg-strong']"),'#70d7ff')
        self.assertEqual(self.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg-strong').trim()"),'#70d7ff')

    def test_legacy_yellow_default_migrates_in_saved_palette_and_reference(self):
        self.context.add_init_script("""if(!localStorage.getItem('background-test-seeded')) {
          localStorage.setItem('pokelator-pro-ui-v1',JSON.stringify({deepBackgroundVersion:1,toolbarColorsVersion:2,appColors:{'bg-strong':'#e5aa68',panel:'#123456'}}));
          localStorage.setItem('pokelator-pro-color-defaults-v1',JSON.stringify({'bg-strong':'#e5aa68'}));
          localStorage.setItem('background-test-seeded','yes');
        }""")
        self.load()
        self.assertEqual(self.evaluate("appColors['bg-strong']"),'#70d7ff')
        self.assertEqual(self.evaluate("appColors.panel"),'#123456')
        self.page.locator('#defaultItemColors').click()
        self.assertEqual(self.evaluate("appColors['bg-strong']"),'#70d7ff')
        self.page.reload();self.page.wait_for_selector('.move-row')
        self.assertEqual(self.evaluate("appColors['bg-strong']"),'#70d7ff')

    def test_non_yellow_custom_background_is_preserved(self):
        self.context.add_init_script("localStorage.setItem('pokelator-pro-ui-v1',JSON.stringify({deepBackgroundVersion:1,appColors:{'bg-strong':'#223344'}}))")
        self.load()
        self.assertEqual(self.evaluate("appColors['bg-strong']"),'#223344')
