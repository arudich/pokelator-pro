import unittest
import test_app as app_tests


class TeamHistoryTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def shortcut(self, redo=False, mac=False):
        self.evaluate('document.activeElement.blur()')
        self.page.keyboard.press(('Meta' if mac else 'Control')+('+Shift' if redo else '')+'+z')

    def test_build_edits_add_remove_redo_branch_and_storage(self):
        self.load()
        before=self.evaluate('JSON.stringify(state.ourTeam)')
        self.evaluate("commitTeamInvestment(state.ourTeam[0],'atk',20)")
        changed=self.evaluate('JSON.stringify(state.ourTeam)')
        self.assertNotEqual(before,changed)
        self.shortcut()
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),before)
        self.assertEqual(self.evaluate('localStorage.getItem(STORAGE_KEY)'),before)
        self.shortcut(redo=True)
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),changed)
        self.evaluate("addTeamPokemon('Sylveon')")
        self.shortcut()
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),changed)
        self.shortcut(redo=True,mac=True)
        self.assertEqual(self.evaluate('state.ourTeam.at(-1).name'),'Sylveon')
        self.evaluate('removeTeamPokemon(state.ourTeam.length-1)')
        self.shortcut(mac=True)
        self.assertEqual(self.evaluate('state.ourTeam.at(-1).name'),'Sylveon')
        self.shortcut()
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),changed)
        self.evaluate("updateItem(state.ourTeam[0],'Life Orb')")
        self.assertFalse(self.evaluate('restoreTeamHistory(true)'))

    def test_noop_selection_library_edits_and_reload(self):
        self.load()
        self.evaluate('saveTeamToStorage();state.activeOurIndex=1;render();saveTeamToStorage()')
        self.assertEqual(self.evaluate('teamHistory.past.length'),0)
        original_id=self.evaluate('state.activeTeamId')
        self.evaluate('createLibraryTeam(true)')
        copy_id=self.evaluate('state.activeTeamId')
        self.shortcut()
        self.assertEqual(self.evaluate('state.teamLibrary.length'),1)
        self.assertEqual(self.evaluate('state.activeTeamId'),original_id)
        self.shortcut(redo=True)
        self.assertEqual(self.evaluate('state.activeTeamId'),copy_id)
        self.evaluate("selectLibraryTeam(state.teamLibrary[0].id);updateNature(state.ourTeam[0],'Adamant')")
        self.shortcut()
        self.assertEqual(self.evaluate('state.ourTeam[0].nature.name'),'Jolly')
        self.shortcut(redo=True)
        self.assertEqual(self.evaluate('state.ourTeam[0].nature.name'),'Adamant')
        self.page.locator('#deleteTeamButton').evaluate('(button)=>button.click()')
        self.assertEqual(self.evaluate('state.teamLibrary.length'),1)
        self.shortcut()
        self.assertEqual(self.evaluate('state.teamLibrary.length'),2)
        self.assertEqual(self.evaluate('state.activeTeamId'),original_id)
        self.shortcut(redo=True)
        self.assertEqual(self.evaluate('state.teamLibrary.length'),1)
        self.page.reload()
        self.assertEqual(self.evaluate('state.teamLibrary.length'),1)
        self.assertEqual(self.evaluate('teamHistory.past.length'),0)

    def test_typing_keeps_native_undo_and_committed_field_undoes_team(self):
        self.load()
        self.evaluate("updateItem(state.ourTeam[0],'Life Orb')")
        field=self.page.locator('#teamPokemonInput')
        field.click()
        self.page.keyboard.type('Pikachu')
        self.page.keyboard.press('ControlOrMeta+z')
        self.assertEqual(self.evaluate('state.ourTeam[0].item'),'Life Orb')
        self.assertNotEqual(field.input_value(),'Pikachu')
        self.shortcut()
        self.assertEqual(self.evaluate('state.ourTeam[0].item'),'Focus Sash')
        self.evaluate("commitTeamInvestment(state.ourTeam[0],'atk',20)")
        self.page.locator('.expanded-team input[data-stat="atk"]').focus()
        self.page.keyboard.press('Control+z')
        self.assertEqual(self.evaluate('state.ourTeam[0].investment.atk'),32)
