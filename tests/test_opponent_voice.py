import unittest
import json
from pathlib import Path
import test_app as app_tests


MOCK = r"""(() => {
  window.voiceTest={starts:0,stops:0,sessions:[],mediaRequests:0};
  const permission={state:'prompt',addEventListener(name,fn){voiceTest.permissionChanged=()=>fn();}};
  voiceTest.permission=permission;
  Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>permission}});
  if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{voiceTest.mediaRequests++;throw new Error('Unexpected microphone request');};
  window.SpeechRecognition=class {
    constructor(){voiceTest.sessions.push(this);}
    start(){voiceTest.starts++;queueMicrotask(()=>this.onstart?.());}
    stop(){voiceTest.stops++;queueMicrotask(()=>this.onend?.());}
    abort(){this.stop();}
  };
})();"""


class OpponentVoiceTests(unittest.TestCase):
    setUpClass=classmethod(app_tests.AppTests.setUpClass.__func__)
    tearDownClass=classmethod(app_tests.AppTests.tearDownClass.__func__)
    setUp=app_tests.AppTests.setUp
    tearDown=app_tests.AppTests.tearDown
    load=app_tests.AppTests.load
    evaluate=app_tests.AppTests.evaluate

    def mock(self, permission='prompt'):
        self.page.add_init_script(MOCK+f"voiceTest.permission.state='{permission}';")

    def test_duplicate_reuses_opponent_and_keeps_overrides(self):
        self.load()
        result=self.evaluate("""() => {
          addOpponentFromSearch('Garchomp');const original=state.opponentList[0];
          getPreferences(original,'opponent').itemChoice='Life Orb';
          addOpponentFromSearch('Sneasler');addOpponentFromSearch('Garchomp');
          const reused=state.opponentList[0]===original;
          addOpponentsByName(['Sneasler','Garchomp','Sneasler']);
          return {reused,names:state.opponentList.map(e=>e.name),active:state.activeOpponentIndex,
            item:getPreferences(original,'opponent').itemChoice};
        }""")
        self.assertTrue(result['reused'])
        self.assertEqual(result['names'][:2],['Sneasler','Garchomp'])
        self.assertEqual(len(set(result['names'])),len(result['names']))
        self.assertEqual(result['item'],'Life Orb')
        self.assertEqual(result['active'],0)

    def test_click_is_first_microphone_use_and_group_results_are_deduplicated(self):
        self.mock();self.load()
        self.assertEqual(self.evaluate('voiceTest.starts'),0)
        self.assertEqual(self.page.locator('.opponent-panel .pokemon-filter-toggle').count(),0)
        button=self.page.locator('#opponentVoiceButton')
        self.assertEqual(button.get_attribute('data-state'),'idle')
        self.assertIn('hold down Space',button.get_attribute('data-quick-tooltip'))
        button.click()
        self.assertEqual(self.evaluate('voiceTest.starts'),1)
        self.assertEqual(button.get_attribute('data-state'),'listening')
        self.evaluate("""() => {
          const result=Object.assign([{transcript:'King gambit, Sneasler and mega charizard why, king gambit',confidence:1}],{isFinal:true});
          const event={resultIndex:0,results:[result]};
          voiceTest.sessions.at(-1).onresult(event);voiceTest.sessions.at(-1).onresult(event);
        }""")
        self.assertEqual(self.evaluate('state.opponentList.slice(0,3).map(e=>e.name)'),['Kingambit','Sneasler','Mega Charizard Y'])
        self.assertEqual(self.evaluate('state.opponentList.filter(e=>e.name==="Kingambit").length'),1)
        button.click()
        self.assertEqual(button.get_attribute('data-state'),'idle')
        self.assertEqual(self.evaluate('voiceTest.mediaRequests'),0)

    def test_unknown_permission_space_hold_opens_consent_without_native_request(self):
        self.mock();self.load();self.page.clock.install();self.page.clock.pause_at(1000000000000)
        self.page.keyboard.down('Space');self.page.clock.fast_forward(499)
        self.assertFalse(self.page.locator('#opponentVoiceConsent').is_visible())
        self.page.clock.fast_forward(1)
        self.assertTrue(self.page.locator('#opponentVoiceConsent').is_visible())
        self.assertEqual(self.evaluate('voiceTest.starts'),0)
        self.page.keyboard.up('Space')
        self.page.locator('[data-voice-allow]').click()
        self.assertEqual(self.evaluate('voiceTest.starts'),1)
        self.assertEqual(self.page.locator('#opponentVoiceButton').get_attribute('data-state'),'listening')

    def test_space_hold_works_after_clear_and_outside_opponent_pane(self):
        self.mock('granted');self.load();self.page.clock.install();self.page.clock.pause_at(1000000000000)
        self.page.locator('#clearOpponentsButton').click()
        for selector in ['#clearOpponentsButton','#battleViewButton','#metaModeToggle']:
            with self.subTest(focus=selector):
                self.page.locator(selector).focus()
                starts=self.evaluate('voiceTest.starts')
                self.page.keyboard.down('Space');self.page.clock.fast_forward(500)
                self.assertEqual(self.evaluate('voiceTest.starts'),starts+1)
                self.assertEqual(self.page.locator('#opponentVoiceStatus').inner_text(),'Listening…')
                self.page.keyboard.up('Space')
                self.assertEqual(self.page.locator('#opponentVoiceButton').get_attribute('data-state'),'idle')
                self.assertFalse(self.page.locator('#opponentVoiceStatus').is_visible())

    def test_short_space_activates_focused_button_but_hold_only_records(self):
        self.mock('granted');self.load();self.page.clock.install();self.page.clock.pause_at(1000000000000)
        self.evaluate("voiceTest.clicks=0;document.getElementById('clearOpponentsButton').addEventListener('click',()=>voiceTest.clicks++)")
        button=self.page.locator('#clearOpponentsButton');button.focus()
        self.page.keyboard.press('Space')
        self.assertEqual(self.evaluate('voiceTest.clicks'),1)
        self.assertEqual(self.evaluate('voiceTest.starts'),0)
        self.page.keyboard.down('Space');self.page.clock.fast_forward(500);self.page.keyboard.up('Space')
        self.assertEqual(self.evaluate('voiceTest.clicks'),1)
        self.assertEqual(self.evaluate('voiceTest.starts'),1)

    def test_click_stop_clears_listening_before_browser_end_and_can_restart(self):
        self.mock('granted')
        self.page.add_init_script('SpeechRecognition.prototype.stop=function(){voiceTest.stops++;};')
        self.load();self.page.clock.install();self.page.clock.pause_at(1000000000000)
        button=self.page.locator('#opponentVoiceButton')
        button.click()
        self.assertEqual(self.page.locator('#opponentVoiceStatus').inner_text(),'Listening…')
        button.click()
        self.assertEqual(button.get_attribute('data-state'),'idle')
        self.assertFalse(self.page.locator('#opponentVoiceStatus').is_visible())
        self.evaluate('voiceTest.sessions.at(-1).onend()')
        self.page.clock.fast_forward(200)
        self.assertEqual(self.evaluate('voiceTest.starts'),1)
        button.click()
        self.assertEqual(self.evaluate('voiceTest.starts'),2)
        self.assertEqual(button.get_attribute('data-state'),'listening')

    def test_granted_space_hold_lights_up_and_release_stops(self):
        self.mock('granted');self.load();self.page.clock.install();self.page.clock.pause_at(1000000000000)
        self.page.keyboard.down('Space');self.page.clock.fast_forward(499)
        self.assertEqual(self.evaluate('voiceTest.starts'),0)
        self.page.clock.fast_forward(1)
        self.assertEqual(self.evaluate('voiceTest.starts'),1)
        self.assertEqual(self.page.locator('#opponentVoiceButton').get_attribute('data-state'),'listening')
        self.page.keyboard.up('Space')
        self.assertEqual(self.evaluate('voiceTest.stops'),1)
        self.assertEqual(self.page.locator('#opponentVoiceButton').get_attribute('data-state'),'idle')
        self.page.clock.fast_forward(200)
        self.assertEqual(self.evaluate('voiceTest.starts'),1)

    def test_declining_consent_and_native_denial_disable_the_control(self):
        self.mock();self.load();self.page.clock.install();self.page.clock.pause_at(1000000000000)
        self.page.keyboard.down('Space');self.page.clock.fast_forward(500);self.page.keyboard.up('Space')
        self.page.locator('[data-voice-decline]').click()
        self.assertTrue(self.page.locator('#opponentVoiceButton').is_disabled())
        self.assertEqual(self.page.locator('#opponentVoiceButton').get_attribute('data-state'),'disabled')
        self.assertEqual(self.evaluate('voiceTest.starts'),0)
        self.page.reload();self.page.wait_for_selector('.move-row')
        self.page.locator('#opponentVoiceButton').click()
        self.evaluate("voiceTest.sessions.at(-1).onerror({error:'not-allowed'})")
        self.assertTrue(self.page.locator('#opponentVoiceButton').is_disabled())
        self.assertEqual(self.page.locator('#opponentVoiceButton').get_attribute('aria-pressed'),'false')

    def test_service_errors_are_specific_and_do_not_claim_microphone_denial(self):
        self.mock('granted');self.load();self.page.clock.install();self.page.clock.pause_at(1000000000000)
        button=self.page.locator('#opponentVoiceButton')
        for code in ['network','service-not-allowed','audio-capture','language-not-supported','aborted','unexpected-error']:
            button.click()
            self.evaluate('(code)=>{const session=voiceTest.sessions.at(-1);session.onerror({error:code});session.onend();}',code)
            self.assertIn(code,self.page.locator('#opponentVoiceStatus').inner_text())
            self.assertFalse(button.is_disabled())
            self.assertEqual(button.get_attribute('data-state'),'idle')
            starts=self.evaluate('voiceTest.starts')
            self.page.clock.fast_forward(500)
            self.assertEqual(self.evaluate('voiceTest.starts'),starts)

    def test_short_tap_typing_and_builder_do_not_start_voice(self):
        self.mock('granted');self.load();self.page.clock.install();self.page.clock.pause_at(1000000000000)
        self.page.keyboard.down('Space');self.page.clock.fast_forward(499);self.page.keyboard.up('Space');self.page.clock.fast_forward(10)
        self.page.locator('#pokemonSearchInput').focus();self.page.keyboard.down('Space');self.page.clock.fast_forward(600);self.page.keyboard.up('Space')
        self.page.locator('#teamBuilderButton').click();self.page.keyboard.down('Space');self.page.clock.fast_forward(600);self.page.keyboard.up('Space')
        self.assertEqual(self.evaluate('voiceTest.starts'),0)

    def test_late_start_after_space_release_is_stopped(self):
        self.mock('granted')
        self.page.add_init_script("""SpeechRecognition.prototype.start=function(){voiceTest.starts++;};
          SpeechRecognition.prototype.stop=function(){if(!this.started)throw new DOMException('Not started','InvalidStateError');voiceTest.stops++;queueMicrotask(()=>this.onend?.());};""")
        self.load();self.page.clock.install();self.page.clock.pause_at(1000000000000)
        self.page.keyboard.down('Space');self.page.clock.fast_forward(500);self.page.keyboard.up('Space')
        self.evaluate("const session=voiceTest.sessions.at(-1);session.started=true;session.onstart();")
        self.assertEqual(self.evaluate('voiceTest.stops'),1)
        self.assertEqual(self.page.locator('#opponentVoiceButton').get_attribute('data-state'),'idle')
        self.page.clock.fast_forward(200)
        self.assertEqual(self.evaluate('voiceTest.starts'),1)

    def test_unsupported_browser_has_disabled_mic_without_permission_prompt(self):
        self.mock()
        self.page.add_init_script("window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;")
        self.load()
        button=self.page.locator('#opponentVoiceButton')
        self.assertTrue(button.is_disabled())
        self.assertEqual(button.get_attribute('data-state'),'disabled')
        self.assertIn('unavailable',button.get_attribute('data-quick-tooltip'))
        self.assertEqual(self.evaluate('voiceTest.starts'),0)

    def firefox(self):
        self.page.add_init_script("Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 Firefox/159.0'});")

    def test_firefox_unavailable_voice_shows_setup_without_requesting_microphone(self):
        self.firefox();self.mock()
        self.page.add_init_script("window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;")
        self.load()
        help=self.page.locator('.firefox-voice-help')
        self.assertTrue(help.is_visible())
        self.assertIn('AI Controls',help.inner_text())
        help.locator('summary').click()
        self.assertIn('media.webspeech.recognition.enable',help.inner_text())
        self.assertIn('media.webspeech.recognition.force_enable',help.inner_text())
        self.assertEqual(self.evaluate('[voiceTest.starts,voiceTest.mediaRequests]'),[0,0])

    def test_firefox_error_shows_help_and_successful_retry_hides_it(self):
        self.firefox();self.mock('granted');self.load()
        help=self.page.locator('.firefox-voice-help')
        self.assertFalse(help.is_visible())
        self.page.locator('#opponentVoiceButton').click()
        self.evaluate("const s=voiceTest.sessions.at(-1);s.onerror({error:'network'});s.onend();")
        self.assertTrue(help.is_visible())
        self.page.locator('#opponentVoiceButton').click()
        self.assertFalse(help.is_visible())
        self.evaluate("const s=voiceTest.sessions.at(-1);s.onerror({error:'not-allowed'});s.onend();")
        self.assertTrue(help.is_visible())
        self.assertTrue(self.page.locator('#opponentVoiceButton').is_disabled())

    def test_other_browsers_do_not_show_firefox_setup(self):
        self.mock('denied');self.load()
        self.assertFalse(self.page.locator('.firefox-voice-help').is_visible())

    def test_parser_handles_groups_forms_and_conservative_misspellings(self):
        self.mock();self.load()
        result=self.evaluate("""() => {
          const parse=OpponentVoice.matcher(pokemonCatalog,s=>pokemonUsageReference(s)?.percent || 0);
          return {group:parse('add king gambit, sneezler and mega charizard why').map(m=>m.species.name),
            fuzzy:parse('Vulcarona and gar chomp').map(m=>m.species.name),
            nothing:parse('please add the opposing team').map(m=>m.species.name)};
        }""")
        self.assertEqual(result['group'],['Kingambit','Sneasler','Mega Charizard Y'])
        self.assertEqual(result['fuzzy'],['Volcarona','Garchomp'])
        self.assertEqual(result['nothing'],[])

    def test_maushold_speech_spellings_and_unrecognized_transcript(self):
        self.mock();self.load()
        result=self.evaluate("""() => {
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['mouse hold','mouse held','mouse hole','mouse old','mows hold','maus hold',
            'Kingambit and mouse hold and Sneasler','my household needs a new mouse'].map(text=>parse(text).map(m=>m.species.name));
        }""")
        for names in result[:6]:
            self.assertEqual(names,['Maushold'])
        self.assertEqual(result[6],['Kingambit','Maushold','Sneasler'])
        self.assertEqual(result[7],[])
        self.page.locator('#opponentVoiceButton').click()
        self.evaluate("""() => {
          const result=Object.assign([{transcript:'unrecognized name',confidence:1}],{isFinal:true});
          voiceTest.sessions.at(-1).onresult({resultIndex:0,results:[result]});
        }""")
        self.assertIn('Heard “unrecognized name”',self.page.locator('#opponentVoiceStatus').inner_text())

    def test_recorded_speech_corrections_and_regional_prefix_precedence(self):
        self.mock();self.load()
        rows=self.evaluate("""() => {
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['obama snow','bomba snow','agron','al cram','arbach','our believa','our caledon','aromatus',
            'alolin ninetales','olin raichu','alolin ninetales and raichu','Ninetales and Raichu',
            'i did not know','abs','h','aerodact','ageslash shield'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(rows[:8],[['Abomasnow'],['Abomasnow'],['Aggron'],['Alcremie'],['Arbok'],['Arboliva'],['Archaludon'],['Aromatisse']])
        self.assertEqual(rows[8:12],[['Alolan Ninetales'],['Alolan Raichu'],['Alolan Ninetales','Raichu'],['Ninetales','Raichu']])
        self.assertEqual(rows[12:16],[[],[],[],[]])
        self.assertEqual(rows[16],['Aegislash'])

    def test_second_export_corrections_in_groups_and_ambiguous_fragments(self):
        self.mock();self.load()
        phrases={
            'kaludon':'Archaludon','guard jump':'Garchomp','as gilligin mail':'Basculegion Male',
            'in dd female':'Indeedee Female','mega raju y':'Mega Raichu Y','goldango':'Gholdengo',
            'mega fluet':'Mega Floette','mega galissipod':'Mega Golisopod','sinistra':'Sinistcha',
            'graham snarl':'Grimmsnarl','basciligian female':'Basculegion Female','ex goodrill':'Excadrill',
            'twerkle':'Torkoal','make a swampert':'Mega Swampert','glamora':'Glimmora','mega camera':'Mega Camerupt'}
        rows=self.evaluate("""phrases=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return phrases.map(s=>parse(s).map(m=>m.species.name));
        }""",list(phrases))
        self.assertEqual(rows,[[name] for name in phrases.values()])
        result=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['guard jump, goldango, graham snarl, make a swampert and mega camera',
            'make a swampert and swampert','comma indeed milit megastara mega frost',
            'make a team'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(result,[['Garchomp','Gholdengo','Grimmsnarl','Mega Swampert','Mega Camerupt'],['Mega Swampert','Swampert'],['Indeedee'],[]])

    def test_later_recorded_batches_preserve_forms_and_reject_missing_names(self):
        self.mock();self.load()
        batches=json.loads((Path(__file__).parent/'voice_batches_20261123.json').read_text())
        matches=self.evaluate("""batches=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return batches.map(b=>parse(b.transcript).map(m=>m.species.id));
        }""",batches)
        for row,actual in zip(batches,matches):
            with self.subTest(transcript=row['transcript']):
                self.assertEqual(actual,[name for name in row['expected'] if name not in row['unresolved']])
        self.assertEqual(sum(map(len,matches)),71)

    def test_natural_form_suffixes_and_new_full_batch_pronunciations(self):
        self.mock();self.load()
        rows=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['gudra h gudra','slow king gallerian and slowking','tauros aqua tauros blaze toros combat',
            'gorges jumbo lichen rock midnight','avalug h avalug','goodra hisuian arcanine',
            'meowstick palafin cast form','phalanx salazl ambor concilder are believa',
            'quaka vowel cliitzer bonet metacham kafagus','right you camera indeed come o'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(rows,[['Hisuian Goodra','Goodra'],['Galarian Slowking','Slowking'],
          ['Paldean Tauros Aqua Breed','Paldean Tauros Blaze Breed','Paldean Tauros Combat Breed'],
          ['Gourgeist Jumbo Variety','Lycanroc Midnight Form'],['Hisuian Avalugg','Avalugg'],
          ['Goodra','Hisuian Arcanine'],['Meowstic','Palafin Zero Form','Castform'],
          ['Falinks','Salazzle','Emboar','Conkeldurr','Arboliva'],
          ['Quaquaval','Clawitzer','Banette','Medicham','Cofagrigus'],
          ['Raichu','Camerupt','Indeedee','Kommo-o']])

    def test_chrome_and_firefox_spellings_and_castform_identity(self):
        self.mock();self.load()
        result=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['arcalidon garchomp baskyn mail ferigorath indeedy female',
            'masculation male vigorath glissopod in DD vasculation female',
            'cleft key crookedil alchemy slowking glarion lie part',
            'galerians slowking valyrian stunfisk',
            'Roserade stunfisk semaphore Rotom avalug',
            'Castform Rainy Form Castform Sunny Castform',
            'hitler quieter Singapore photograph'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(result,[['Archaludon','Garchomp','Basculegion Male','Farigiraf','Indeedee Female'],
          ['Basculegion Male','Farigiraf','Golisopod','Indeedee','Basculegion Female'],
          ['Klefki','Krookodile','Alcremie','Galarian Slowking','Liepard'],
          ['Galarian Slowking','Galarian Stunfisk'],['Roserade','Stunfisk','Simipour','Rotom','Avalugg'],['Castform'],[]])

    def test_remaining_name_validation_pronunciations(self):
        self.mock();self.load()
        result=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['basky legion mail for rigoraf pelipur glycopod sinistra',
            'kenghis khan miyoscarada overquill samurat h aranguru',
            'miyauskarada krugadile ripurier pursuer quackaval',
            'quack of owl cliot sir benet kafagus aromatus',
            'pelipper indeed basilgian f blazikin cerelej',
            'quiet sir mebostif simisir palafin toxtricity'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(result,[['Basculegion Male','Farigiraf','Pelipper','Golisopod','Sinistcha'],
          ['Kangaskhan','Meowscarada','Overqwil','Hisuian Samurott','Oranguru'],
          ['Meowscarada','Krookodile','Rhyperior','Perrserker','Quaquaval'],
          ['Quaquaval','Clawitzer','Banette','Cofagrigus','Aromatisse'],
          ['Pelipper','Indeedee','Basculegion Female','Blaziken','Ceruledge'],
          ['Clawitzer','Mabosstiff','Simisear','Palafin Zero Form','Toxtricity']])

    def test_shortlist_spellings_and_unique_fused_names(self):
        self.mock();self.load()
        result=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['a skeleton m ferigoraf pelipper indeed basilgian f',
            'basiligian m threigorf kangaskon riper',
            'quack waval clyitzer bonett coffigus conkeldor',
            'quakueval banet kafagusimopor vivellon',
            'kafagussimopor','per circarivale coffees','household'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(result,[['Basculegion Male','Farigiraf','Pelipper','Indeedee','Basculegion Female'],
          ['Basculegion Male','Farigiraf','Kangaskhan','Rhyperior'],
          ['Quaquaval','Clawitzer','Banette','Cofagrigus','Conkeldurr'],
          ['Quaquaval','Banette','Cofagrigus','Simipour','Vivillon Icy Snow Pattern'],
          ['Cofagrigus','Simipour'],[],[]])

    def test_last_shortlist_spellings_do_not_guess_missing_speech(self):
        self.mock();self.load()
        rows=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['ask illegion m ferigraph asciligian f cvor',
            'quakuevow client sir benet coffeis conkeler',
            'vasclegian male ferigorf basilgian female cerelej clevor',
            'quakovale clients are cafrgus concletter cimapore',
            'simopur mabostef'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(rows,[['Basculegion Male','Farigiraf','Basculegion Female'],
          ['Quaquaval','Clawitzer','Banette','Conkeldurr'],
          ['Basculegion Male','Farigiraf','Basculegion Female','Ceruledge','Kleavor'],
          ['Quaquaval','Clawitzer','Cofagrigus','Conkeldurr','Simipour'],['Simipour','Mabosstiff']])

    def test_canonical_basculegion_gender_initials(self):
        self.mock();self.load()
        result=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['Basculegion M','Basculegion F','Basculegion male','Basculegion female',
            'Basculegion F Kingambit Basculegion M','Basculegion F Basculegion female'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(result,[['Basculegion Male'],['Basculegion Female'],['Basculegion Male'],['Basculegion Female'],
          ['Basculegion Female','Kingambit','Basculegion Male'],['Basculegion Female']])

    def test_gender_first_and_latest_remaining_pronunciations(self):
        self.mock();self.load()
        result=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['male Basculegion female Basculegion','M Basculegion F Basculegion',
            'female basilgian male vascular',
            'kangas khan ripuria quakwal kliitsr bonet',
            'kartha gregus concilder semapur mabastiff',
            'ask allegian m ferigoraf vascalgian ferlge riper',
            'basiligen masculine falitzer'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(result,[['Basculegion Male','Basculegion Female'],['Basculegion Male','Basculegion Female'],
          ['Basculegion Female','Basculegion Male'],['Kangaskhan','Rhyperior','Quaquaval','Clawitzer','Banette'],
          ['Cofagrigus','Conkeldurr','Simipour','Mabosstiff'],['Basculegion Male','Farigiraf','Rhyperior'],['Clawitzer']])

    def test_latest_gender_order_and_merged_names(self):
        self.mock();self.load()
        rows=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['vasculation for rigora female vasculation cereleich ripuria',
            'quakueval quiet sir kafagas conkeldor semapur',
            'as gilligion m ferigoraferatj kafagus',
            'vascular m thigorath seriledge','vasculation f'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(rows,[['Basculegion Male','Farigiraf','Basculegion Female','Ceruledge','Rhyperior'],
          ['Quaquaval','Clawitzer','Cofagrigus','Conkeldurr','Simipour'],['Basculegion Male','Cofagrigus'],
          ['Basculegion Male','Farigiraf','Ceruledge'],['Basculegion Female']])

    def test_last_five_names_and_fused_farigiraf_quaquaval(self):
        self.mock();self.load()
        rows=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['male vascular female basculgion cerelej quakoval',
            'clyde sir kaffa grigus','fowregorafwakwavell cliotus',
            'ferigorath quakwaval kleitzer kafagus'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(rows,[['Basculegion Male','Basculegion Female','Ceruledge','Quaquaval'],
          ['Clawitzer','Cofagrigus'],['Farigiraf','Quaquaval','Clawitzer'],
          ['Farigiraf','Quaquaval','Clawitzer','Cofagrigus']])

    def test_farigiraf_ceruledge_cofagrigus_final_spellings(self):
        self.mock();self.load()
        result=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['the regraph serelage quakwal clyitzer kothagus',
            'theregarath serelich cophagus','farregaraferilage kafagus',
            'fabricorath sarah ledge quakwaval kafagas','farregaraf'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(result,[['Farigiraf','Ceruledge','Quaquaval','Clawitzer','Cofagrigus'],
          ['Farigiraf','Ceruledge','Cofagrigus'],['Farigiraf','Ceruledge','Cofagrigus'],
          ['Farigiraf','Ceruledge','Quaquaval','Cofagrigus'],['Farigiraf']])

    def test_farigiraf_ceruledge_generalize_near_spellings_conservatively(self):
        self.mock();self.load()
        rows=self.evaluate("""()=>{
          const parse=OpponentVoice.matcher(pokemonCatalog);
          return ['thorigarath sariledge','ferigarath serelge','ferigaraferatj',
            'household paragraph heritage coffees'].map(s=>parse(s).map(m=>m.species.name));
        }""")
        self.assertEqual(rows,[['Farigiraf','Ceruledge'],['Farigiraf','Ceruledge'],[],[]])
