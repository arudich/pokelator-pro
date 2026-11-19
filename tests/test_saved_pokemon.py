import unittest
import test_app as app_tests


class SavedPokemonTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def fixture(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam=[sanitizeTeamEntry({name:'Malamar',nature:'Adamant',item:'Leftovers',ability:'Contrary',investment:{hp:32,atk:32,spd:2},moveSet:['Superpower','Knock Off','Protect','Psycho Cut']})];
          state.teamLibrary.find(t=>t.id===state.activeTeamId).name='Team A';
          state.activeOurIndex=0;saveTeamToStorage();window.teamA=state.activeTeamId;render();
        }""")

    def test_removed_latest_build_persists_and_can_restore_from_search(self):
        self.fixture()
        self.evaluate("state.ourTeam[0].investment={hp:30,atk:32,def:4,spa:0,spd:0,spe:0};saveTeamToStorage();window.savedBuild=JSON.stringify(state.ourTeam[0]);removeTeamPokemon(0)")
        self.page.reload()
        self.page.locator('#teamPokemonInput').fill('malamar')
        self.assertEqual(self.page.locator('#searchResults .saved-build-team').all_text_contents(),['Team A'])
        self.assertIn('HP 30',self.page.locator('#searchResults .search-item').last.inner_text())
        self.page.locator('#searchResults .search-item').last.click()
        expected=self.evaluate("state.teamLibrary[0].savedPokemon.find(p=>p.name==='Malamar')")
        self.assertEqual(self.evaluate('state.ourTeam[0]'),expected)
        self.assertEqual(expected['item'],'Leftovers')
        self.assertEqual(expected['investment']['hp'],30)
        self.assertEqual(expected['nature']['name'],'Adamant')

    def test_versions_are_per_team_and_deleted_team_is_excluded(self):
        self.fixture()
        self.evaluate("removeTeamPokemon(0);createLibraryTeam();state.teamLibrary.find(t=>t.id===state.activeTeamId).name='Team B';addTeamPokemon('Malamar');state.ourTeam[0].nature=getNatureDefinition('Careful');saveTeamToStorage();removeTeamPokemon(0)")
        self.page.locator('#teamPokemonInput').fill('mala')
        self.assertEqual(self.page.locator('#searchResults .saved-build-team').all_text_contents(),['Team B','Team A'])
        self.page.locator('#teamPokemonInput').press('Escape')
        self.page.locator('#teamLibraryPanel summary').click()
        self.page.locator('#deleteTeamButton').click()
        self.page.locator('#teamPokemonInput').fill('mala')
        self.assertEqual(self.page.locator('#searchResults .saved-build-team').all_text_contents(),['Team A'])
        self.page.locator('#teamPokemonInput').press('Escape')
        self.page.locator('#undoTeamDeleteButton').click()
        self.page.locator('#teamPokemonInput').fill('mala')
        self.assertEqual(self.page.locator('#searchResults .saved-build-team').all_text_contents(),['Team B','Team A'])

    def test_existing_library_migrates_and_latest_duplicate_survives_reload(self):
        self.fixture()
        self.evaluate("state.ourTeam.push(sanitizeTeamEntry({name:'Malamar',nature:'Careful'}));saveTeamToStorage();state.ourTeam[0].item='Life Orb';saveTeamToStorage()")
        self.page.reload()
        archived=self.evaluate("state.teamLibrary[0].savedPokemon.filter(p=>p.name==='Malamar')")
        self.assertEqual(len(archived),1)
        self.assertEqual(archived[0]['item'],'Life Orb')
        self.assertEqual(archived[0]['nature']['name'],'Adamant')
        self.evaluate("""() => {
          const saved=JSON.parse(localStorage.getItem(LIBRARY_KEY));
          for(const t of saved.teams) delete t.savedPokemon;
          localStorage.setItem(LIBRARY_KEY,JSON.stringify(saved));
        }""")
        self.page.reload()
        self.assertTrue(self.evaluate("state.teamLibrary[0].savedPokemon.some(p=>p.name==='Malamar')"))

    def test_undo_addition_keeps_build_available_while_team_exists(self):
        self.load()
        self.evaluate("addTeamPokemon('Malamar');restoreTeamHistory()")
        self.assertFalse(self.evaluate("state.ourTeam.some(p=>p.name==='Malamar')"))
        self.assertTrue(self.evaluate("buildTeamSearchResults('Malamar').some(p=>p.savedBuild)"))
