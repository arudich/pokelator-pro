import unittest
import re
import test_app as app_tests


class ReferenceSetTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def builder(self):
        self.load()
        self.evaluate("state.builderTopN=3;state.builderPanel='speed';setView('builder')")

    def select_reference(self,name):
        field=self.page.locator('#builderReferenceSearch');field.fill(name)
        display=self.evaluate('name=>getPokemonByName(name).name',name)
        self.page.locator('#searchResults .choice-heading strong').filter(has_text=re.compile('^'+re.escape(display)+'$')).click()

    def test_keyboard_search_outside_top_n_and_shared_highlights_in_all_views(self):
        self.builder()
        self.assertFalse(self.evaluate("builderRoster(getPokemonByName(state.ourTeam[0].name)).some(p=>p.id==='Gogoat')"))
        before=self.page.locator('.builder-heading').bounding_box()['height']
        self.page.locator('#builderPanelTitle').click()
        self.page.keyboard.type('Gogoat')
        self.assertEqual(self.page.locator('#builderReferenceSearch').input_value(),'Gogoat')
        self.assertEqual(self.page.locator('.builder-heading').bounding_box()['height'],before)
        self.page.locator('#builderReferenceSearch').press('Enter')
        icon=self.page.locator('[data-reference-id="Gogoat"]')
        self.assertTrue(icon.first.evaluate("el=>el.classList.contains('reference-highlighted')"))
        self.page.locator('#builderReferenceOnly').click()
        for panel in ['offense','team-offense','defense','balance','speed']:
            self.page.locator(f'[data-builder-panel="{panel}"]').click()
            self.page.wait_for_selector('[data-reference-id="Gogoat"]:visible',timeout=30000)
            self.assertEqual(set(self.page.locator('[data-reference-id]:visible').evaluate_all('(rows)=>rows.map(row=>row.dataset.referenceId)')),{'Gogoat'})
            self.assertEqual(self.page.locator('[data-reference-id="Gogoat"][aria-pressed="true"]:visible').count(),self.page.locator('[data-reference-id="Gogoat"]:visible').count())
            self.assertEqual(self.evaluate("builderRoster(getPokemonByName(state.ourTeam[0].name),false).map(p=>p.id)"),['Gogoat'])
        self.page.reload();self.page.wait_for_selector('[data-reference-id="Gogoat"]')
        self.assertEqual(self.page.locator('#builderReferenceOnly').get_attribute('aria-pressed'),'true')
        self.assertTrue(self.evaluate("builderReferences.has('Gogoat')"))
        self.page.locator('#builderReferenceClear').click()
        self.assertEqual(self.evaluate('builderReferences.active.ids'),[])
        self.assertFalse(self.evaluate('builderReferences.only'))
        self.assertFalse(self.evaluate("builderRoster(getPokemonByName(state.ourTeam[0].name)).some(p=>p.id==='Gogoat')"))

    def test_named_sets_keep_saved_original_and_persist_draft_until_save_or_save_as(self):
        self.builder();self.select_reference('Gogoat')
        self.page.locator('#builderReferenceSetsButton').click()
        name=self.page.locator('#builderReferenceSetName')
        name.fill('Grass matchups');name.press('Enter')
        original=self.evaluate('builderReferences.activeId')
        self.assertEqual(self.evaluate('builderReferences.saved.ids'),[])
        self.assertTrue(self.evaluate('builderReferences.dirty'))
        self.page.locator('#builderReferenceSave').click()
        self.assertFalse(self.evaluate('builderReferences.dirty'))
        self.page.locator('#builderReferenceSetsClose').click();self.select_reference('Furfrou')
        self.assertEqual(set(self.evaluate('builderReferences.active.ids')),{'Gogoat','Furfrou'})
        self.assertEqual(self.evaluate('builderReferences.saved.ids'),['Gogoat'])
        self.page.reload();self.page.wait_for_selector('[data-reference-id="Furfrou"]')
        self.assertEqual(self.evaluate('builderReferences.saved.ids'),['Gogoat'])
        self.assertTrue(self.evaluate('builderReferences.dirty'))
        self.page.locator('#builderReferenceSetsButton').click()
        self.page.locator('#builderReferenceSetName').fill('Coverage checks')
        self.page.locator('#builderReferenceSetName').press('Enter')
        self.page.locator('#builderReferenceSaveAs').click()
        copy=self.evaluate('builderReferences.activeId')
        self.assertNotEqual(original,copy)
        self.assertFalse(self.evaluate('builderReferences.dirty'))
        self.assertEqual(self.evaluate('builderReferences.sets.length'),2)
        self.page.locator(f'[data-reference-set="{original}"]').click()
        self.assertEqual(self.evaluate('builderReferences.active.name'),'Grass matchups')
        self.assertEqual(self.evaluate('builderReferences.active.ids'),['Gogoat'])
        self.page.locator(f'[data-reference-set="{copy}"]').click()
        self.assertEqual(set(self.evaluate('builderReferences.active.ids')),{'Gogoat','Furfrou'})
        self.page.reload();self.page.wait_for_selector('[data-reference-id="Furfrou"]')
        self.assertEqual(self.evaluate('builderReferences.active.name'),'Coverage checks')
        self.assertEqual(set(self.evaluate('builderReferences.active.ids')),{'Gogoat','Furfrou'})

    def test_save_overwrites_only_when_clicked_and_revert_restores_saved_group(self):
        self.builder();self.select_reference('Gogoat')
        self.page.locator('#builderReferenceSetsButton').click()
        self.page.locator('#builderReferenceSave').click()
        self.page.locator('#builderReferenceSetsClose').click();self.select_reference('Furfrou')
        self.page.locator('#builderReferenceSetsButton').click()
        self.page.locator('#builderReferenceRevert').click()
        self.assertEqual(self.evaluate('builderReferences.active.ids'),['Gogoat'])
        self.assertFalse(self.evaluate('builderReferences.dirty'))
        self.page.locator('#builderReferenceSetsClose').click();self.select_reference('Furfrou')
        self.page.locator('#builderReferenceSetsButton').click()
        self.assertEqual(self.evaluate('builderReferences.saved.ids'),['Gogoat'])
        self.page.locator('#builderReferenceSave').click()
        self.assertEqual(set(self.evaluate('builderReferences.saved.ids')),{'Gogoat','Furfrou'})
        self.assertFalse(self.evaluate('builderReferences.dirty'))

    def test_save_shortcuts_prevent_page_save_and_clear_follows_sets(self):
        self.builder();self.select_reference('Gogoat')
        self.page.locator('#builderReferenceSetsButton').click()
        self.page.locator('#builderReferenceSetName').fill('Keyboard group')
        for modifier in ['ctrlKey','metaKey']:
            self.evaluate("builderReferences.toggle('Furfrou')")
            prevented=self.evaluate("""modifier=>{
              const event=new KeyboardEvent('keydown',{key:'s',[modifier]:true,bubbles:true,cancelable:true});
              document.getElementById('builderReferenceSetName').dispatchEvent(event);
              return event.defaultPrevented;
            }""",modifier)
            self.assertTrue(prevented)
            self.assertFalse(self.evaluate('builderReferences.dirty'))
            self.assertEqual(self.evaluate('builderReferences.saved.name'),'Keyboard group')
            self.assertEqual(self.evaluate('builderReferences.saved.ids'),self.evaluate('builderReferences.active.ids'))
        self.assertIn('Ctrl+S',self.page.locator('#builderReferenceSetsButton').get_attribute('title'))
        self.assertTrue(self.evaluate("document.getElementById('builderReferenceSetsButton').nextElementSibling.id==='builderReferenceClear'"))

    def test_click_highlight_preserves_field_fill_and_does_not_steal_text_input(self):
        self.builder()
        self.evaluate("getPokemonByName('Tyranitar').usage.Doubles.rank=1;builderReferences.toggle('Tyranitar',true);state.builderPanel='offense';renderTeamBuilder()")
        cards=self.page.locator('[data-reference-id="Tyranitar"]')
        self.assertEqual(cards.count(),2)
        before=cards.evaluate_all('(cards)=>cards.map(card=>getComputedStyle(card).backgroundColor)')
        cards.first.click()
        self.assertTrue(all(value=='false' for value in cards.evaluate_all('(cards)=>cards.map(card=>card.getAttribute("aria-pressed"))')))
        cards.first.click()
        self.page.mouse.move(5,5)
        self.assertEqual(cards.evaluate_all('(cards)=>cards.map(card=>getComputedStyle(card).backgroundColor)'),before)
        self.assertTrue(all(value=='true' for value in cards.evaluate_all('(cards)=>cards.map(card=>card.getAttribute("aria-pressed"))')))
        self.page.locator('.set-editor summary').click()
        move=self.page.locator('[data-set-field="move-0"]');move.fill('Rock')
        self.assertEqual(self.page.locator('#builderReferenceSearch').input_value(),'')
        self.assertEqual(move.input_value(),'Rock')

    def test_header_fits_mobile_and_empty_only_mode_has_a_way_back(self):
        self.builder()
        for width in [1440,800,390]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            self.assertTrue(self.page.locator('.builder-heading').evaluate("row=>[...row.querySelectorAll('input,button')].every(el=>el.getBoundingClientRect().right<=row.getBoundingClientRect().right+1)"))
        self.page.locator('#builderReferenceOnly').click()
        self.assertIn('Search above',self.page.locator('#builderSpeedTiers').inner_text())
        self.page.locator('#builderReferenceClear').click()
        self.assertGreater(self.page.locator('[data-reference-id]').count(),0)

    def test_corrupt_storage_and_missing_species_are_safe(self):
        self.builder()
        result=self.evaluate("""() => {
          const storage={getItem:()=>'{invalid json',setItem:()=>{throw Error('Blocked')}};
          const broken=new ReferenceSets(['Gogoat'],storage);broken.toggle('Gogoat');
          const legacy=new ReferenceSets(['Gogoat'],{getItem:()=>JSON.stringify({sets:[{id:'a',name:'Saved',ids:['Gogoat','Missing','Gogoat']}],activeId:'a'}),setItem:()=>{}});
          return {broken:broken.active.ids,saved:broken.save(),legacy:legacy.active.ids};
        }""")
        self.assertEqual(result,{'broken':['Gogoat'],'saved':False,'legacy':['Gogoat']})
