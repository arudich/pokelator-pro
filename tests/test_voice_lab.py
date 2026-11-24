import unittest
import json
import test_app as app_tests
from test_opponent_voice import MOCK


class VoiceLabTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown

    def load_lab(self):
        self.page.route('**/voice-validation-data.js',lambda route:route.fulfill(content_type='application/javascript',body='window.VOICE_VALIDATION_DATA=[];'))
        self.page.add_init_script(MOCK)
        self.page.goto(self.url+'/debug/voice.html')

    def names(self):
        return self.page.locator('#batch strong').all_text_contents()

    def final(self, text):
        self.page.evaluate("""text=>{
          const r=voiceTest.sessions.at(-1);r.onspeechstart();r.onspeechend();
          r.testResults||=[];r.testResults.push(Object.assign([{transcript:text,confidence:.9}],{isFinal:true}));
          r.onresult({resultIndex:r.testResults.length-1,results:r.testResults});
        }""",text)

    def run_data(self):
        return self.page.evaluate("JSON.parse(localStorage.getItem('pokelator-voice-lab-v2'))")

    def test_one_start_records_five_then_reconnects_and_persists(self):
        self.load_lab();self.page.clock.install()
        names=self.names();self.assertEqual(len(names),5)
        self.assertEqual(names[0],self.page.locator('#species option').first.inner_text())
        self.assertEqual(self.page.evaluate('voiceTest.starts'),0)
        self.page.keyboard.press('Space');self.final(', '.join(names))
        self.assertEqual(self.names(),names)
        self.page.clock.fast_forward(2500)
        run=self.run_data();self.assertEqual(len(run['attempts']),5)
        self.assertTrue(all(a['correct'] for a in run['attempts']))
        self.assertEqual(run['batches'][0]['matchedCount'],5)
        self.assertIn('speechend',[e['name'] for e in run['batches'][0]['events']])
        self.page.clock.fast_forward(150)
        self.assertEqual(self.page.evaluate('voiceTest.starts'),2)
        self.assertTrue(set(names).isdisjoint(self.names()))
        self.page.keyboard.press('Space');self.page.reload()
        self.assertEqual(self.page.locator('#results tr').count(),5)
        with self.page.expect_download() as download:
            self.page.locator('#export').click()
        self.assertTrue(download.value.suggested_filename.endswith('.json'))

    def test_final_chunks_do_not_advance_until_group_is_finished(self):
        self.load_lab();self.page.clock.install();names=self.names();self.page.keyboard.press('Space')
        self.final(', '.join(names[:2]));self.page.clock.fast_forward(1000)
        self.assertEqual(self.names(),names)
        self.final(', '.join(names[2:]));self.page.clock.fast_forward(2499)
        self.assertEqual(self.page.evaluate('voiceTest.stops'),0)
        self.page.clock.fast_forward(1)
        self.assertEqual(self.run_data()['batches'][0]['matchedCount'],5)
        self.assertEqual(len(self.run_data()['batches']),1)

    def test_pause_keeps_delayed_final_without_result_deadline(self):
        self.load_lab();self.page.clock.install();names=self.names();self.page.keyboard.press('Space')
        self.page.evaluate("voiceTest.sessions.at(-1).stop=function(){voiceTest.stops++;};voiceTest.sessions.at(-1).onspeechstart();")
        self.page.keyboard.press('Space');self.page.clock.fast_forward(4000)
        self.final(', '.join(names));self.page.evaluate('voiceTest.sessions.at(-1).onend()')
        self.assertEqual(self.run_data()['batches'][0]['matchedCount'],5)
        self.assertEqual(self.page.evaluate('voiceTest.starts'),1)

    def test_unexpected_names_are_not_substituted_with_expected_names(self):
        self.load_lab();self.page.clock.install();names=self.names();self.page.keyboard.press('Space')
        self.final(names[0]+', Abomasnow');self.page.clock.fast_forward(2500)
        batch=self.run_data()['batches'][0]
        self.assertEqual(batch['matchedCount'],1)
        self.assertEqual([p['name'] for p in batch['unexpected']],['Abomasnow'])
        self.assertEqual(sum(a['correct'] for a in self.run_data()['attempts']),1)

    def test_service_error_pauses_and_records_batch(self):
        self.load_lab();self.page.keyboard.press('Space')
        self.page.evaluate("""()=>{const r=voiceTest.sessions.at(-1);r.onspeechstart();r.onerror({error:'network',message:'Service failed'});r.onend();}""")
        self.assertEqual(len(self.run_data()['attempts']),5)
        self.assertEqual(self.run_data()['batches'][0]['error']['code'],'network')
        self.assertIn('network',self.page.locator('#status').inner_text())
        self.assertEqual(self.page.locator('#record').get_attribute('aria-pressed'),'false')

    def test_preserves_previous_single_results_and_retries_failures_only(self):
        self.load_lab()
        data=self.page.evaluate("""()=>{
          const data={version:2,startedAt:new Date().toISOString(),index:0,attempts:[],sessions:[]};
          for(const p of PokemonForms.catalog(CHAMPIONS_ROSTER))data.attempts.push({expected:{id:p.id,name:p.name},attempt:1,alternatives:[],matches:[],correct:p.name!=='Sneasler',events:[]});
          return data;
        }""")
        self.page.add_init_script("localStorage.setItem('pokelator-voice-lab-v2',"+json.dumps(json.dumps(data))+");")
        self.page.reload();self.page.clock.install();self.assertEqual(self.names(),['Sneasler'])
        self.page.keyboard.press('Space');self.final('Sneasler');self.page.clock.fast_forward(2500)
        self.assertIn('Run complete',self.page.locator('#status').inner_text())
        self.assertEqual(len([a for a in self.run_data()['attempts'] if a['expected']['name']=='Sneasler']),2)

    def test_mega_prompts_removed_but_old_mega_progress_and_matching_preserved(self):
        self.load_lab()
        options=self.page.locator('#species option').all_text_contents()
        self.assertFalse(any(name.startswith('Mega ') for name in options))
        self.assertNotIn('Palafin Hero Form',options)
        self.assertNotIn('Toxtricity Low Key Form',options)
        data={'version':2,'startedAt':'2026-11-23T20:00:00Z','index':4,'sessions':[],
              'attempts':[{'expected':{'id':'Charizard-Mega-Y','name':'Mega Charizard Y'},'attempt':1,
                           'alternatives':[{'transcript':'mega charizard y','confidence':.9}],
                           'matches':[{'id':'Charizard-Mega-Y','name':'Mega Charizard Y'}],'correct':True}]}
        self.page.add_init_script("localStorage.setItem('pokelator-voice-lab-v2',"+json.dumps(json.dumps(data))+");")
        self.page.reload()
        self.assertNotIn('Charizard',self.names())
        self.assertEqual(self.page.locator('#results tr').count(),1)
        self.assertIn('1 /',self.page.locator('#progress').inner_text())
        self.page.locator('#species').select_option(label='Charizard');self.page.clock.install();self.page.keyboard.press('Space')
        self.final('Mega Charizard Y');self.page.clock.fast_forward(2500)
        last=self.run_data()['batches'][-1]
        self.assertIn('Mega Charizard Y',[m['name'] for m in last['matches']])
        self.assertIn('Mega Charizard Y',[m['name'] for m in last['unexpected']])

    def test_consecutive_successes_retire_across_runs_and_failure_resets(self):
        history=[{'id':'Sneasler','key':f'past-{i}','at':f'2000-01-0{i}T00:00:00Z','correct':True} for i in [1,2]]
        self.page.add_init_script("localStorage.setItem('pokelator-voice-validation-v1',"+json.dumps(json.dumps(history))+");")
        self.load_lab();self.page.clock.install()
        self.assertNotIn('Sneasler',self.names())
        self.assertIn('1 reliable names skipped',self.page.locator('#progress').inner_text())
        # Explicit navigation still permits validation of a retired name.
        self.page.locator('#species').select_option(label='Sneasler')
        self.assertIn('Sneasler',self.names())
        self.page.keyboard.press('Space');self.final('unknown words');self.page.clock.fast_forward(2500)
        self.assertNotIn('Sneasler',self.run_data()['reliableIds'])
        self.page.keyboard.press('Space')
        self.page.once('dialog',lambda dialog:dialog.accept())
        self.page.locator('#reset').click()
        self.assertNotIn('Sneasler',self.run_data()['reliableIds'])
        self.page.locator('#species').select_option(label='Sneasler')
        self.assertIn('Sneasler',self.names())

    def test_success_failure_success_is_not_a_reliable_streak(self):
        history=[{'id':'Sneasler','key':f'past-{i}','at':f'2000-01-0{i}T00:00:00Z','correct':i!=2} for i in [1,2,3]]
        self.page.add_init_script("localStorage.setItem('pokelator-voice-validation-v1',"+json.dumps(json.dumps(history))+");")
        self.load_lab()
        self.page.locator('#species').select_option(label='Sneasler')
        self.assertNotIn('Sneasler',self.run_data()['reliableIds'])
        self.assertIn('Sneasler',self.names())
        self.assertIn('0 reliable names skipped',self.page.locator('#progress').inner_text())

    def test_microphone_activity_prevents_transcript_stall_from_cutting_audio(self):
        self.load_lab();self.page.clock.install();names=self.names()
        self.page.evaluate("""()=>{
          voiceTest.level=.03;voiceTest.trackStops=0;voiceTest.contextCloses=0;
          navigator.mediaDevices.getUserMedia=async()=>{voiceTest.mediaRequests++;return {getTracks:()=>[{stop(){voiceTest.trackStops++;}}]};};
          window.AudioContext=class{
            resume(){return Promise.resolve();}
            createMediaStreamSource(){return {connect(){},disconnect(){}};}
            createAnalyser(){return {getFloatTimeDomainData(samples){samples.fill(voiceTest.level);}};}
            close(){voiceTest.contextCloses++;return Promise.resolve();}
          };
        }""")
        self.assertEqual(self.page.evaluate('voiceTest.mediaRequests'),0)
        self.page.keyboard.press('Space');self.final(', '.join(names))
        self.page.clock.fast_forward(5000)
        self.assertEqual(self.page.evaluate('voiceTest.stops'),0)
        self.assertEqual(self.names(),names)
        self.page.evaluate('voiceTest.level=0');self.page.clock.fast_forward(2499)
        self.assertEqual(self.page.evaluate('voiceTest.stops'),0)
        self.page.clock.fast_forward(201)
        self.assertEqual(self.run_data()['batches'][0]['matchedCount'],5)
        self.assertTrue(self.run_data()['sessions'][0]['microphoneActivityAvailable'])
        self.page.clock.fast_forward(150);self.page.keyboard.press('Space')
        self.assertEqual(self.page.evaluate('voiceTest.trackStops'),1)
        self.assertEqual(self.page.evaluate('voiceTest.contextCloses'),1)
