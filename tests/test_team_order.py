import unittest
import test_app as app_tests


class TeamOrderTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_large_team_files_and_order_survive_reload(self):
        self.load()
        self.evaluate("['Sylveon','Kingambit','Gardevoir','Scizor','Clefable'].forEach(addTeamPokemon)")
        self.assertEqual(self.evaluate('state.ourTeam.length'),8)
        self.assertFalse(self.page.locator('#addTeamButton').is_disabled())
        self.assertTrue(self.evaluate("""() => {
          const packet=TeamFiles.pack([state.teamLibrary[0]]);
          return TeamFiles.parse(JSON.stringify(packet),sanitizeTeamEntry)[0].pokemon.length===8
            && TeamFiles.decode(TeamFiles.encode([state.teamLibrary[0]]),sanitizeTeamEntry)[0].pokemon.length===8;
        }"""))
        self.page.locator('[data-move-team-index="7"][data-team-step="-1"]').click()
        order=self.evaluate('state.ourTeam.map(p=>p.name)')
        self.assertEqual(order[-2:],['Clefable','Scizor'])
        self.assertEqual(self.evaluate('state.ourTeam[state.activeOurIndex].name'),'Clefable')
        self.page.reload()
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),order)
        self.assertEqual(self.evaluate('getTeamFromStorage().length'),8)

    def test_reordering_is_undoable_keeps_selection_and_fits_phone(self):
        self.load()
        original=self.evaluate('state.ourTeam.map(p=>p.name)')
        self.page.locator('[data-move-team-index="2"][data-team-step="-1"]').click()
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),[original[0],original[2],original[1]])
        self.assertEqual(self.evaluate('state.ourTeam[state.activeOurIndex].name'),original[0])
        self.page.locator('[data-move-team-index="1"][data-team-step="-1"]').press('Enter')
        self.assertEqual(self.evaluate('state.activeOurIndex'),1)
        self.assertTrue(self.page.locator('[data-move-team-index="0"][data-team-step="1"]').evaluate('button => button.matches(":focus")'))
        self.page.keyboard.press('Control+z')
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),[original[0],original[2],original[1]])
        self.page.keyboard.press('Control+Shift+z')
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),[original[2],original[0],original[1]])
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))

    def test_drag_inserts_at_the_target_slot_and_keeps_the_selected_pokemon(self):
        self.load()
        original=self.evaluate('state.ourTeam.map(p=>p.name)')
        selected=original[0]

        def drag_to(source, destination, surface='.team-avatar', drop=True, allowed=True):
            source_handle=self.page.locator(f'.team-row[data-team-index="{source}"] {surface}')
            target=self.page.locator(f'.team-row[data-team-index="{destination}"]')
            start=source_handle.bounding_box()
            end=target.locator('.column-tag').bounding_box()
            self.page.mouse.move(start['x']+start['width']/2,start['y']+start['height']/2)
            self.page.mouse.down()
            self.page.mouse.move(end['x']+end['width']/2,end['y']+end['height']/2,steps=12)
            marker='before' if destination<source else 'after'
            self.assertEqual(target.get_attribute('data-team-drop'),marker if allowed else None)
            if not drop:
                self.page.keyboard.press('Escape')
            self.page.mouse.up()
            self.assertEqual(self.page.locator('[data-team-drop], .team-drag-source').count(),0)

        drag_to(2,0,drop=False)
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),original)
        drag_to(2,0)
        expected=[original[2],original[0],original[1]]
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),expected)
        self.assertEqual(self.evaluate('state.ourTeam[state.activeOurIndex].name'),selected)
        self.assertEqual(self.page.locator('.expanded-team').get_attribute('data-team-index'),'1')

        self.assertEqual(self.page.locator('.expanded-team [data-team-drag]').count(),0)
        drag_to(1,2,surface='.pokemon-name',allowed=False)
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),expected)
        drag_to(2,1,surface='.pokemon-name')
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),[original[2],original[1],original[0]])
        self.assertEqual(self.evaluate('state.ourTeam[state.activeOurIndex].name'),selected)
        self.page.keyboard.press('Control+z')
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),expected)
        self.page.reload()
        self.assertEqual(self.evaluate('state.ourTeam.map(p=>p.name)'),expected)

    def test_team_offense_defaults_to_first_two_and_respects_manual_choices(self):
        self.load()
        self.evaluate("""() => {
          state.builderTopN=1;window.searches=[];
          Offense.bestSwap=async moves=>{searches.push(moves);return null;};render();
        }""")
        self.page.locator('#teamBuilderButton').click()
        self.page.locator('[data-builder-panel="team-offense"]').click()
        self.page.wait_for_function('teamMoveTrials.size===2 && [...teamMoveTrials.values()].every(t=>t.finished)')
        self.assertEqual(self.evaluate('searches.length'),2)
        self.assertEqual(self.evaluate('teamOffenseSelected().map(m=>m.index)'),[0,1])
        self.evaluate('moveTeamPokemon(2,-1)')
        self.assertEqual(self.evaluate('teamOffenseSelected().map(m=>m.entry.name)'),['Sneasler','Garchomp'])
        self.page.locator('[data-team-offense-member="0"]').click()
        self.assertEqual(self.evaluate('teamOffenseSelected().map(m=>m.entry.name)'),['Garchomp'])
        self.evaluate('moveTeamPokemon(1,1)')
        self.assertEqual(self.evaluate('teamOffenseSelected().map(m=>m.entry.name)'),['Garchomp'])
        self.evaluate("addTeamPokemon('Sylveon')")
        self.assertEqual(self.evaluate('teamOffenseSelected().map(m=>m.entry.name)'),['Garchomp'])
        self.evaluate('createLibraryTeam(true)')
        self.assertEqual(self.evaluate('teamOffenseSelected().map(m=>m.index)'),[0,1])
