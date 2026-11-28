import unittest
import test_app as app_tests


class StatDisplayTests(unittest.TestCase):
    setUpClass = classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass = classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp = app_tests.AppTests.setUp
    tearDown = app_tests.AppTests.tearDown
    load = app_tests.AppTests.load
    evaluate = app_tests.AppTests.evaluate

    def fixture(self):
        self.load()
        self.evaluate("""() => {
          state.ourTeam[2]=sanitizeTeamEntry({name:'Garchomp',item:'Choice Scarf',nature:'Adamant',investment:{hp:2,atk:32,spe:32}});
          state.activeOurIndex=2;
          state.opponentList=['Sylveon','Mega Garchomp','Bellibolt','Basculegion Female'].map(name=>sanitizeOpponentEntry({name}));
          state.activeOpponentIndex=0;render();
        }""")

    def test_built_stats_and_opponent_ranges(self):
        self.fixture()
        ours=self.page.locator('#ourActiveStats [data-raw-stat]')
        editor=self.page.locator('.expanded-team [data-stat-total]')
        self.assertEqual(ours.all_text_contents(),['185','200','115','90','105','154'])
        self.assertEqual(editor.all_text_contents(),ours.all_text_contents())
        foe=self.page.locator('[data-opponent-index="1"]')
        self.assertEqual(foe.locator('[data-range-stat="spe"] [data-point]').all_text_contents(),['100','112','144','158'])
        self.assertEqual(foe.locator('[data-range-stat="hp"] [data-point]').all_text_contents(),['183','215'])
        self.evaluate("getPreferences(state.ourTeam[2],'our').offenseStage=6;render()")
        self.assertEqual(ours.nth(1).inner_text(),'200')
        attack=self.page.locator('.expanded-team input[data-stat="atk"]')
        breakdown=self.page.locator('.expanded-team [data-stat-breakdown="atk"]')
        self.assertEqual(breakdown.inner_text(),'(150 + 32 + 18)')
        attack.fill('0')
        self.assertEqual(breakdown.inner_text(),'(150 + 15)')
        attack.press('Enter')
        self.assertEqual(ours.nth(1).inner_text(),'165')
        self.assertEqual(breakdown.inner_text(),'(150 + 15)')
        item=self.page.locator('.expanded-team [data-field="item"]')
        item.fill('Garchompite');item.press('Enter')
        self.assertEqual(self.page.locator('.expanded-team [data-mega-stat="atk"]').inner_text(),'+44')

    def test_base_stats_stay_in_pokemon_picker(self):
        self.fixture()
        self.assertEqual(self.page.locator('#ourTeamList [data-base-stat], #opponentList [data-base-stat], .active-card [data-base-stat]').count(),0)
        self.page.locator('#pokemonSearchInput').fill('Mega Garchomp')
        name=self.page.get_by_text('Mega Garchomp',exact=True)
        choice=self.page.locator('#searchResults [role="option"]').filter(has=name)
        self.assertEqual(choice.locator('[data-base-stat="spe"]').inner_text(),'Spe\n92')
        self.assertEqual(choice.locator('[data-base-stat="spe"] strong').evaluate('el=>getComputedStyle(el).color'),'rgb(215, 226, 236)')

    def test_pokemon_names_do_not_repeat_as_tooltips(self):
        self.fixture()
        names=self.page.locator('.team-row .pokemon-name, .opponent-row .pokemon-name, .active-summary .summary-name')
        self.assertGreater(names.count(),4)
        self.assertEqual(names.locator('xpath=ancestor-or-self::*[@title]').count(),0)
        self.assertIn('investment and nature',self.page.locator('#ourActiveStats .raw-stat-strip').get_attribute('title'))

    def test_base_stat_colors_follow_strength_on_each_roster_scale(self):
        self.load()
        colors=self.evaluate("""() => {
          const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
          const context=canvas.getContext('2d');
          const color=(stat,value)=>{
            context.fillStyle=baseStatColor(stat,value);
            context.fillRect(0,0,1,1);
            return [...context.getImageData(0,0,1,1).data].slice(0,3);
          };
          return {low:color('atk',30), modest:color('atk',60), yellow:color('def',80),
            high:color('atk',150), sameAttack:color('atk',105), sameSpeed:color('spe',105)};
        }""")
        self.assertGreater(colors['low'][0],2*colors['low'][1])
        self.assertGreater(colors['modest'][0],colors['modest'][1])
        self.assertGreater(colors['yellow'][0],colors['yellow'][1])
        self.assertGreater(colors['yellow'][1],1.5*colors['yellow'][2])
        self.assertGreater(colors['high'][1],colors['high'][0])
        self.assertGreater(colors['sameSpeed'][1]-colors['sameSpeed'][0],colors['sameAttack'][1]-colors['sameAttack'][0])

    def test_nature_key_opens_over_ranges_and_roster_line_is_removed(self):
        self.fixture()
        self.assertEqual(self.page.locator('#rosterStatus').count(),0)
        for width in [1440,320]:
            self.page.set_viewport_size({'width':width,'height':900})
            for selector in ['#opponentActiveStats', '#opponentList']:
                chart=self.page.locator(f'{selector} .opponent-stat-ranges').first
                key=chart.locator('[role="tooltip"]')
                self.assertTrue(key.is_hidden())
                before=chart.bounding_box()['height']
                self.assertEqual(chart.locator('[data-range-stat][title]').count(),0)
                chart.locator('[data-range-stat="spe"]').hover()
                self.assertTrue(key.is_hidden())
                self.assertEqual(key.evaluate('(element)=>getComputedStyle(element).transitionDelay'),'0.5s')
                key.wait_for(state='visible')
                bounds=chart.bounding_box()
                self.assertGreaterEqual(key.bounding_box()['y'],bounds['y']+bounds['height'])
                self.assertTrue(key.evaluate("""legend=>{
                  const key=legend.getBoundingClientRect();
                  return [...document.querySelectorAll('.summary-name,.pokemon-name')].every(name=>{
                    const box=name.getBoundingClientRect();
                    return key.bottom<=box.top || key.top>=box.bottom || key.right<=box.left || key.left>=box.right;
                  });
                }"""),width)
                self.assertEqual(key.locator('span').all_text_contents(),['− Nature','Neutral · 0–32 SP','+ Nature'])
                self.assertEqual(chart.bounding_box()['height'],before)
                self.page.mouse.move(0,0)
                self.assertTrue(key.is_hidden())
                self.page.keyboard.press('Tab')
                chart.focus()
                self.assertTrue(key.is_visible())
                chart.evaluate('(element)=>element.blur()')
                self.assertTrue(key.is_hidden())

    def test_stat_editor_and_range_markers_fit_at_desktop_and_mobile_widths(self):
        self.fixture()
        for width in [2240,1920,1800,1680,1440,1280,1200,768,390,320]:
            self.page.set_viewport_size({'width':width,'height':900})
            result=self.evaluate("""() => {
              const charts=[...document.querySelectorAll('.opponent-stat')].every(stat=>{
                const chart=stat.getBoundingClientRect();
                const bar=stat.querySelector('.opponent-range-scale').getBoundingClientRect();
                const label=stat.querySelector('.opponent-stat-label').getBoundingClientRect();
                const points=[...stat.querySelectorAll('[data-point]')];
                return points.every((point,index)=>{
                  const bounds=point.getBoundingClientRect();
                  const mark=point.querySelector('.opponent-range-marker');
                  const marker=mark.getBoundingClientRect();
                  const segment=point.parentElement.getBoundingClientRect();
                  const edge=point.parentElement.classList.contains('opponent-range-fixed') ? (segment.left+segment.right)/2
                    : ['neutral-max','max'].includes(point.dataset.point) ? segment.right : segment.left;
                  const previous=points[index-1]?.getBoundingClientRect().right ?? label.right;
                  return bounds.left>=previous-0.5 && bounds.right<=chart.right+0.5 && bounds.bottom<bar.top
                    && Math.abs(label.bottom-bounds.bottom)<0.5
                    && Math.abs((marker.left+marker.right)/2-edge)<0.5
                    && marker.top<=bounds.bottom+0.5 && marker.bottom>=bar.top+2
                    && getComputedStyle(mark,'::after').width==='1px';
                });
              });
              const wide=[...document.querySelectorAll('.opponent-row .opponent-stat-ranges')].every(ranges=>{
                const columns=getComputedStyle(ranges).gridTemplateColumns.split(' ').length;
                return columns===(ranges.getBoundingClientRect().width<230 ? 1 : 2);
              });
              const card=document.querySelector('.expanded-team').getBoundingClientRect();
              const inputs=[...document.querySelectorAll('.expanded-team .stat-grid input')].map(input=>input.getBoundingClientRect());
              const editor=inputs.length===6 && inputs.every(input=>input.width>0 && input.left>=card.left && input.right<=card.right);
              const formulas=[...document.querySelectorAll('.stat-investment-label')].every(label=>{
                const name=label.querySelector('strong').getBoundingClientRect();
                const breakdown=label.querySelector('[data-stat-breakdown]').getBoundingClientRect();
                return !breakdown.width || (Math.abs(name.bottom-breakdown.bottom)<3 && breakdown.right<=label.getBoundingClientRect().right+0.5);
              });
              const ownStats=[...document.querySelectorAll('#ourActiveStats [data-raw-stat]')];
              const ownCard=document.querySelector('.our-active-card').getBoundingClientRect();
              const portrait=document.querySelector('.our-active-portrait').getBoundingClientRect();
              const details=document.querySelector('.our-active-details').getBoundingClientRect();
              const columns=getComputedStyle(document.querySelector('#ourActiveStats .raw-stat-strip')).gridTemplateColumns.split(' ').length;
              const rows=new Set(ownStats.map(stat=>Math.round(stat.getBoundingClientRect().top)));
              const lastValue=ownStats.at(-1).getBoundingClientRect().bottom;
              const ownGrid=document.querySelector('#ourActiveStats .raw-stat-strip').getBoundingClientRect();
              const upperRowBottom=Math.max(...ownStats.slice(0,3).map(stat=>stat.getBoundingClientRect().bottom));
              const dividerClear=columns===6 || ownGrid.top+ownGrid.height/2-upperRowBottom>=3;
              const own=rows.size===6/columns && ownCard.bottom-lastValue<=18
                && Math.abs(portrait.top-details.top)<0.5 && Math.abs(portrait.bottom-details.bottom)<0.5
                && portrait.right<details.left && dividerClear;
              const neutralColors=['.opponent-stat-label','.opponent-range-point','.opponent-range-marker'].every(selector=>
                new Set([...document.querySelectorAll(selector)].map(element=>getComputedStyle(element).color)).size===1);
              return {charts,wide,editor,formulas,own,neutralColors,page:document.documentElement.scrollWidth<=innerWidth};
            }""")
            self.assertEqual(result,dict(charts=True,wide=True,editor=True,formulas=True,own=True,neutralColors=True,page=True),width)
