import unittest
import test_app as app_tests


class BaseStatsTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def fixture(self):
        self.load()
        self.evaluate("""() => {
          state.activeOurIndex=2;
          state.opponentList=['Sylveon','Mega Garchomp','Bellibolt','Basculegion Female'].map(name=>sanitizeOpponentEntry({name}));
          state.activeOpponentIndex=0;render();
        }""")

    def test_actual_species_base_stats_forms_and_independence_from_build(self):
        self.fixture()
        values=lambda selector:self.page.locator(selector).evaluate_all('(els)=>els.map(e=>Number(e.dataset.baseValue))')
        self.assertEqual(values('#ourActiveBaseStats [data-base-stat]'),[108,130,95,80,85,102])
        self.assertEqual(values('[data-opponent-index="1"] [data-base-stat]'),[108,170,115,120,95,92])
        self.assertEqual(values('[data-opponent-index="2"] [data-base-stat]'),[109,64,91,103,83,45])
        self.assertEqual(values('[data-opponent-index="3"] [data-base-stat]'),[120,92,65,100,75,78])
        self.evaluate("""() => {
          commitTeamInvestment(state.ourTeam[2],'atk',0);updateNature(state.ourTeam[2],'Modest');
          getPreferences(state.ourTeam[2],'our').offenseStage=6;render();
        }""")
        self.assertEqual(values('#ourActiveBaseStats [data-base-stat]'),[108,130,95,80,85,102])
        self.assertEqual(self.page.locator('#opponentList .base-stat-strip').count(),4)

    def test_stats_use_existing_card_space_and_do_not_overlap(self):
        self.fixture()
        for width in [1440,1280,1200,390]:
            self.page.set_viewport_size({'width':width,'height':900})
            self.evaluate('render()')
            result=self.evaluate("""() => {
              const cards=[...document.querySelectorAll('.active-card,.opponent-row')];
              const heights=cards.map(card=>card.getBoundingClientRect().height);
              const originalItemCardHeights=cards.map(card=>card.querySelector('.item-hint') ? (card.classList.contains('expanded') ? 154 : 92) : null);
              const valid=[...document.querySelectorAll('.base-stat')].every(stat=>{
                const label=stat.querySelector('.base-stat-label').getBoundingClientRect(),value=stat.querySelector('strong').getBoundingClientRect();
                return label.right<=stat.getBoundingClientRect().right+1 && value.right<=stat.getBoundingClientRect().right+1;
              });
              document.querySelectorAll('.base-stat-strip').forEach(strip=>strip.remove());
              return {valid,before:heights,without:cards.map((card,index)=>originalItemCardHeights[index] ?? card.getBoundingClientRect().height),width:document.documentElement.scrollWidth};
            }""")
            self.assertTrue(result['valid'],width)
            self.assertLessEqual(result['width'],width)
            for before,without in zip(result['before'],result['without']):
                self.assertLessEqual(before,without+1,msg=f'Card grew at width {width}')
