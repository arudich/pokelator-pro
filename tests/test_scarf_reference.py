import datetime
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
        self.load(frozen_usage=True)
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
        self.load(frozen_usage=True)
        for width in [1440,390]:
            self.page.set_viewport_size({'width':width,'height':844})
            item=self.page.locator('#opponentList [data-opponent-item="Life Orb"]')
            self.assertIsNone(item.get_attribute('title'))
            item.hover()
            tooltip=self.page.locator('.item-tooltip:popover-open')
            tooltip.wait_for(state='visible')
            box=tooltip.bounding_box()
            self.assertGreaterEqual(box['x'],0)
            self.assertLessEqual(box['x']+box['width'],width)
            self.assertGreaterEqual(box['y'],0)
            self.assertLessEqual(box['y']+box['height'],844)
            item.click()
            self.page.mouse.move(5,5)
            self.assertEqual(self.page.locator('.item-tooltip:popover-open').count(),0)

    def test_known_items_and_form_controls_share_the_half_second_tooltip(self):
        self.load(frozen_usage=True)
        self.evaluate("""() => {
          state.ourTeam=[
            sanitizeTeamEntry({name:'Aerodactyl',item:'Focus Sash'}),
            sanitizeTeamEntry({name:'Aegislash',item:'Life Orb'}),
            sanitizeTeamEntry({name:'Mega Medicham'})
          ];
          state.opponentList=[sanitizeOpponentEntry({name:'Kingambit'})];
          state.activeOurIndex=state.activeOpponentIndex=0;render();
        }""")
        self.page.clock.install()
        self.page.clock.pause_at(datetime.datetime.now(datetime.timezone.utc))
        active_tooltip=self.page.locator('.item-tooltip:popover-open')
        controls=[
            ('#opponentList [data-opponent-item="Life Orb"]','Life Orb'),
            ('#ourTeamList .known-item','Focus Sash'),
            ('#ourTeamList .stance-toggle','Blade Forme'),
            ('#ourTeamList [data-mega-side="our"]','Medichamite'),
        ]
        opponent_style=None
        for selector,label in controls:
            with self.subTest(control=label):
                target=self.page.locator(selector).first
                self.assertIsNone(target.get_attribute('title'))
                target.dispatch_event('pointerover',{'pointerType':'mouse'})
                self.page.clock.run_for(499)
                self.assertEqual(active_tooltip.count(),0)
                self.page.clock.run_for(1)
                self.assertIn(label,active_tooltip.inner_text())
                style=active_tooltip.evaluate("""tooltip => {
                  const {backgroundColor,border,color}=getComputedStyle(tooltip);
                  return {backgroundColor,border,color};
                }""")
                if opponent_style is None:
                    opponent_style=style
                self.assertEqual(style,opponent_style)
                self.assertIn('solid',style['border'])
                target.dispatch_event('pointerout',{'pointerType':'mouse'})
                self.assertEqual(active_tooltip.count(),0)
