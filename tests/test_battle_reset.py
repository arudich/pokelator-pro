import unittest
import test_app as app_tests


class BattleResetTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def test_each_opponent_has_delete_and_removing_other_preserves_selection(self):
        self.load()
        ours=self.evaluate('JSON.stringify(state.ourTeam)')
        self.evaluate("""() => {
          state.opponentList=['Kingambit','Sylveon','Pelipper'].map(name=>sanitizeOpponentEntry({name}));
          state.activeOpponentIndex=2;render();
        }""")
        self.assertEqual(self.page.locator('#opponentList [data-opponent-action="delete"]').count(),3)
        self.page.get_by_role('button',name='Remove Kingambit from opposition',exact=True).click()
        self.assertEqual(self.evaluate('state.opponentList[state.activeOpponentIndex].name'),'Pelipper')
        self.page.get_by_role('button',name='Remove Pelipper from opposition',exact=True).click()
        self.assertEqual(self.evaluate('state.opponentList[state.activeOpponentIndex].name'),'Sylveon')
        self.assertEqual(self.evaluate('JSON.stringify(state.ourTeam)'),ours)
        self.assertEqual(self.page.locator('#clearOpponentsButton').text_content(),'Clear Pokémon')
        self.page.locator('#clearOpponentsButton').click()
        self.assertEqual(self.evaluate('state.opponentList.length'),0)
        self.page.locator('#resetBattleButton').click()
        self.assertEqual(self.evaluate('state.opponentList.length'),0)

    def test_reset_all_modifiers_and_persist_defaults_without_changing_rosters_or_builds(self):
        self.load()
        self.evaluate("""() => {
          state.opponentList=['Kingambit','Sylveon'].map(name=>sanitizeOpponentEntry({name}));
          for(const member of state.ourTeam) {
            getPreferences(member,'our').offenseStage=2;getPreferences(member,'our').defenseStage=-1;
            member.damageMultiplier=2;
          }
          for(const name of ['Kingambit','Sylveon','Pelipper']) {
            Object.assign(getPreferences(getPokemonByName(name),'opponent'),{offenseStage:3,defenseStage:-2,
              abilityChoice:'',itemChoice:'Life Orb',defenseNatureChoice:true,offenseNatureChoice:false});
          }
          state.weather='Rain';state.terrain='Psychic';state.alliesFainted=3;state.opponentsFainted=2;
          state.format='Singles';state.damageDirection='incoming';savePreferences();saveTeamToStorage();render();
        }""")
        roster=self.evaluate('JSON.stringify(state.opponentList)')
        builds=self.evaluate('JSON.stringify(TeamFiles.pack(state.teamLibrary))')
        self.page.locator('#resetBattleButton').click()
        self.assertEqual(self.evaluate('[state.weather,state.terrain,state.alliesFainted,state.opponentsFainted]'),['','',0,0])
        self.assertEqual(self.evaluate('JSON.stringify(state.opponentList)'),roster)
        self.assertEqual(self.evaluate('JSON.stringify(TeamFiles.pack(state.teamLibrary))'),builds)
        self.assertEqual(self.evaluate('state.format'),'Singles')
        self.assertTrue(self.evaluate('Object.values(state.preferences).every(p=>JSON.stringify(p)===JSON.stringify(sanitizePreferences()))'))
        self.assertTrue(self.evaluate('state.ourTeam.every(p=>p.damageMultiplier===1) && state.teamLibrary.every(t=>t.pokemon.every(p=>p.damageMultiplier===1))'))
        self.assertEqual(self.page.locator('#attackerStageControl input:checked').input_value(),'0')
        self.assertEqual(self.page.locator('#defenderStageControl input:checked').input_value(),'0')
        self.assertEqual(self.page.locator('#weatherInput [aria-pressed="true"]').get_attribute('data-field-value'),'')
        self.page.reload()
        self.assertTrue(self.evaluate('Object.values(state.preferences).every(p=>p.offenseStage===0 && p.defenseStage===0 && p.itemChoice==="" && p.abilityChoice==="auto" && p.defenseNatureChoice==="auto" && p.offenseNatureChoice==="auto")'))
        self.assertEqual(self.evaluate('JSON.stringify(TeamFiles.pack(state.teamLibrary))'),builds)
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.evaluate('document.documentElement.scrollWidth<=innerWidth'))
