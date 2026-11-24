/* Local-only evaluation. Expected names never bias recognition or matching. */
(() => {
  const key='pokelator-voice-lab-v2',$=id=>document.getElementById(id),roster=CHAMPIONS_ROSTER;
  const usage=window.META_USAGE?.formats.Doubles.species||{};
  const popularity=p=>usage[p.id.toLowerCase().replace(/[^a-z0-9]/g,'')]?.percent||0;
  const fullCatalog=PokemonForms.catalog(roster);
  const baseIds=new Map(fullCatalog.map(p=>[p.id,p.isMega?p.id.replace(/-Mega(?:-[XYZ])?$/,''):p.id]));
  const baseId=id=>baseIds.get(id)||id,familyUsage=new Map();
  for(const p of fullCatalog)familyUsage.set(baseId(p.id),Math.max(familyUsage.get(baseId(p.id))||0,popularity(p)));
  const familyPopularity=p=>familyUsage.get(p.id)||0;
  // Test each base pronunciation once; retain all forms in the real matcher.
  const catalog=fullCatalog.filter(p=>!p.isMega&&!['Palafin-Hero','Toxtricity-Low-Key'].includes(p.id)).sort((a,b)=>familyPopularity(b)-familyPopularity(a)||
    (a.usage?.Doubles?.rank||9999)-(b.usage?.Doubles?.rank||9999)||a.name.localeCompare(b.name));
  const match=OpponentVoice.matcher(fullCatalog,popularity),Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const fresh=()=>({version:2,flow:'hands-free',startedAt:new Date().toISOString(),userAgent:navigator.userAgent,rosterDate:roster.generatedAt,index:0,attempts:[],sessions:[],batches:[]});
  let run;try{run=JSON.parse(localStorage.getItem(key));}catch{}
  if(!run||run.version!==2||!Array.isArray(run.attempts))run=fresh();
  run.batches||=[];run.flow='hands-free-batches-of-five';
  const changedPromptSet=run.promptSet!=='base-only-v3-pronunciations';run.promptSet='base-only-v3-pronunciations';
  run.index=Math.max(0,Math.min(catalog.length-1,run.index||0));
  let session=null,running=false,restart=null,attempt=null,manualTarget=false,activity=null;
  const historyKey='pokelator-voice-validation-v1';
  let history=[];try{history=JSON.parse(localStorage.getItem(historyKey))||[];}catch{}
  if(!Array.isArray(history))history=[];
  const reliableIds=new Set();
  function updateValidation(){
    const groups=new Map();
    const current=run.attempts.map((a,i)=>({id:baseId(a.expected.id),key:`${run.startedAt}|${a.at??i}|${a.expected.id}`,
      at:a.at||run.startedAt,correct:!!a.correct}));
    for(const row of [...(window.VOICE_VALIDATION_DATA||[]),...history,...current]){
      if(!row?.id||!row.key||!row.at)continue;
      const id=baseId(row.id);if(!groups.has(id))groups.set(id,new Map());
      groups.get(id).set(row.key,{...row,id});
    }
    history=[];reliableIds.clear();
    for(const [id,rows] of groups){
      const latest=[...rows.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.key.localeCompare(b.key)).slice(-2);
      history.push(...latest);if(latest.length===2&&latest.every(r=>r.correct))reliableIds.add(id);
    }
    run.reliableIds=catalog.filter(p=>reliableIds.has(p.id)).map(p=>p.id);
    localStorage.setItem(historyKey,JSON.stringify(history));
  }
  updateValidation();
  const save=()=>localStorage.setItem(key,JSON.stringify(run));
  const trials=p=>run.attempts.filter(a=>baseId(a.expected.id)===p.id);
  const success=p=>trials(p).some(a=>a.correct);
  const eligible=p=>!reliableIds.has(p.id);
  function pending(){return catalog.findIndex(p=>eligible(p)&&!trials(p).length)>=0;}
  function nextIndex(){
    const unseen=catalog.findIndex(p=>eligible(p)&&!trials(p).length);if(unseen>=0)return unseen;
    return catalog.findIndex(p=>eligible(p)&&!success(p)&&trials(p).length<3);
  }
  // Reuse recordings of Mega forms instead of asking for their base name again.
  if(changedPromptSet||!eligible(catalog[run.index]))run.index=Math.max(0,nextIndex());
  function batch(){
    const anchor=catalog[run.index],unseen=pending();
    const pool=catalog.filter(p=>eligible(p)&&(unseen?!trials(p).length:!success(p)&&trials(p).length<3));
    return [...(manualTarget||pool.includes(anchor)?[anchor]:[]),...pool.filter(p=>p.id!==anchor.id)].slice(0,5);
  }
  function cell(text){const el=document.createElement('td');el.textContent=text;return el;}
  for(const [index,species] of catalog.entries()){
    const option=document.createElement('option');option.value=index;option.textContent=species.name;$('species').append(option);
  }
  function render(){
    const p=catalog[run.index];$('species').value=run.index;
    $('batch').replaceChildren(...batch().map(p=>{
      const card=document.createElement('div'),img=document.createElement('img'),name=document.createElement('strong');
      img.src=new URL(p.image,'https://championsbattledata.com/').href;img.alt='';name.textContent=p.name;card.append(img,name);return card;
    }));
    const active=catalog.filter(eligible);
    $('progress').textContent=`${pending()?'First Pass':'Retry Pass'} · ${active.filter(p=>trials(p).length).length} / ${active.length} tested · ${run.reliableIds.length} reliable names skipped`;
    $('attempt').textContent=batch().length?'Say the displayed names, then pause for a moment.':'All remaining names tested. Export your results.';
    $('record').disabled=!Recognition||!!session&&!running||!batch().length;
    $('previous').disabled=!!session||running||run.index===0;$('next').disabled=!!session||running||run.index===catalog.length-1;
    $('species').disabled=!!session||running;$('reset').disabled=!!session||running;
    $('record').setAttribute('aria-pressed',String(running));$('record').textContent=running?'Pause · Space':session?'Finishing…':'Start · Space';
    $('summary').textContent=`${run.attempts.length} attempts · ${catalog.filter(success).length} Pokémon matched`;
    $('results').replaceChildren();
    for(const a of run.attempts.slice().reverse()){
      const row=document.createElement('tr');row.append(cell(`${a.expected.name} · Attempt ${a.attempt}${a.batchId?' · Batch '+a.batchId:''}`));
      const heard=cell(a.alternatives[0]?.transcript||a.error?.code||'No final transcript');
      if(a.alternatives.length>1){const more=document.createElement('small');more.textContent=a.alternatives.slice(1).map(a=>a.transcript).join(' / ');heard.append(more);}
      const result=cell(a.correct?'Matched':a.matches.map(m=>m.name).join(', ')||'No match');result.className=a.correct?'correct':'wrong';row.append(heard,result);$('results').append(row);
    }
  }
  function event(name,details={}){
    if(!session)return;
    const e={name,atMs:Math.round(performance.now()-session.started),...details};session.log.events.push(e);if(attempt)attempt.events.push(e);
  }
  function beginAttempt(){
    if(attempt)return;
    attempt={expected:batch().map(p=>({id:p.id,name:p.name,attempt:trials(p).length+1})),at:new Date().toISOString(),sessionId:session.log.id,
      readyAtMs:session.readyAtMs,alternatives:[],matches:[],error:null,events:[]};
  }
  function clearSilence(){if(session){clearTimeout(session.silenceTimer);session.silenceTimer=null;}}
  function finishAfterSilence(delay){
    clearSilence();const current=session;
    if(!current||!running||!attempt||current.flushing)return;
    current.silenceTimer=setTimeout(()=>{
      if(session!==current||!running||!attempt)return;
      if(activity?.active&&!activity.quietFor(2500)){
        event('microphone-still-active');finishAfterSilence(200);return;
      }
      current.flushing=true;event('silence-finalize');
      $('status').textContent='Finishing batch… Wait for Ready.';
      // stop requests a final transcript; it does not discard buffered audio.
      // Keep accepting results until onend, however long processing takes.
      try{current.recognition.stop();}catch(error){current.flushing=false;event('stop-error',{code:error.name});}
    },delay);
  }
  function commit(){
    if(!attempt)return;
    clearSilence();
    const a=attempt;attempt=null;
    const choices=a.alternatives.map(a=>({...a,matches:match(a.transcript)}));
    choices.sort((a,b)=>b.matches.reduce((n,m)=>n+(m.end-m.start)*(m.exact?3:1),0)-a.matches.reduce((n,m)=>n+(m.end-m.start)*(m.exact?3:1),0));
    a.matches=(choices[0]?.matches||[]).map(m=>({id:m.species.id,name:m.species.name}));
    a.id=run.batches.length+1;a.completedAtMs=Math.round(performance.now()-session.started);
    a.matchedCount=a.expected.filter(p=>a.matches.some(m=>m.id===p.id)).length;
    a.unexpected=a.matches.filter(m=>!a.expected.some(p=>p.id===m.id));run.batches.push(a);
    for(const expected of a.expected)run.attempts.push({expected:{id:expected.id,name:expected.name},attempt:expected.attempt,
      batchId:a.id,at:a.at,alternatives:a.alternatives,matches:a.matches.filter(m=>m.id===expected.id),
      correct:a.matches.some(m=>m.id===expected.id),error:a.error,events:a.events,readyAtMs:a.readyAtMs,sessionId:a.sessionId});
    manualTarget=false;updateValidation();
    const next=nextIndex();if(next>=0)run.index=next;else running=false;
    session.readyAtMs=a.completedAtMs;save();render();
    $('status').textContent=next<0?'Run complete. Export your results.':`Batch saved: ${a.matchedCount}/${a.expected.length} matched. ${running?'Preparing next batch… Wait for Ready.':'Paused.'}`;
  }

  function pause(){
    running=false;clearTimeout(restart);clearSilence();event('manual-pause');render();$('status').textContent='Finishing current speech…';
    activity?.stop();activity=null;
    if(session){try{session.recognition.stop();}catch(error){event('stop-error',{code:error.name});}}
    else $('status').textContent='Paused. Tap Space to resume.';
  }
  function startSession(){
    if(!running||session||!Recognition)return;
    const recognition=new Recognition(),current={recognition,started:performance.now(),readyAtMs:null,segments:new Map(),log:{id:run.sessions.length+1,at:new Date().toISOString(),events:[]}};
    current.log.microphoneActivityAvailable=!!activity?.active;
    run.sessions.push(current.log);session=current;
    recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=5;
    recognition.onstart=()=>{if(session!==current)return;event('recognition-start');current.readyAtMs=Math.round(performance.now()-current.started);if(!running){recognition.stop();return;}$('status').textContent='Ready — say all five names.';};
    for(const name of ['audiostart','audioend','soundstart','soundend','speechstart','speechend'])recognition['on'+name]=()=>{
      if(session!==current)return;
      if(name==='speechstart'&&running)beginAttempt();event(name);
      if(name==='speechstart'||name==='soundstart')clearSilence();
      if(name==='speechend'||name==='soundend')finishAfterSilence(2500);
      if(name==='speechend'&&attempt)$('status').textContent='Say the remaining names, or pause to finish the batch.';
    };
    recognition.onresult=e=>{
      if(session!==current)return;
      for(let i=e.resultIndex||0;i<e.results.length;i++){
        const result=e.results[i];
        if(!result.isFinal){
          if(running){beginAttempt();event('interim-result',{transcript:result[0]?.transcript||''});finishAfterSilence(activity?.active?2500:7000);}
          continue;
        }
        beginAttempt();event('final-result');
        current.segments.set(i,Array.from(result,a=>({transcript:a.transcript,confidence:a.confidence})));
      }
      if(attempt){
        // Preserve final chunks across pauses; never advance after the first name.
        let combined=[{transcript:'',confidence:0}];
        for(const segment of [...current.segments.entries()].sort((a,b)=>a[0]-b[0]).map(row=>row[1])){
          combined=combined.flatMap(prefix=>segment.map(a=>({transcript:(prefix.transcript+' '+a.transcript).trim(),confidence:prefix.confidence+a.confidence})))
            .sort((a,b)=>b.confidence-a.confidence).slice(0,5);
        }
        attempt.alternatives=current.segments.size?combined.map(a=>({...a,confidence:a.confidence/current.segments.size})):[];
        if(current.segments.size)finishAfterSilence(2500);
      }
    };
    recognition.onerror=e=>{
      if(session!==current)return;clearSilence();event('error',{code:e.error,message:e.message||''});
      // A silent pause should not consume an attempt or trigger endless retries.
      if(attempt)attempt.error={code:e.error,message:e.message||''};
      if(e.error!=='no-speech'){running=false;activity?.stop();activity=null;$('status').textContent=`Speech service error: ${e.error}. Tap Space to retry.`;}
      save();render();
    };
    recognition.onend=()=>{
      if(session!==current)return;clearSilence();event('recognition-end');
      // No forced result deadline: wait until the browser ends the session.
      if(attempt){if(!attempt.alternatives.length)attempt.error||={code:'no-final-transcript',message:'Session ended without a final result'};commit();}
      session=null;save();render();
      if(running){$('status').textContent='Reconnecting microphone…';restart=setTimeout(startSession,150);}
      else {activity?.stop();activity=null;const error=current.log.events.findLast(e=>e.name==='error');$('status').textContent=error?`Speech service error: ${error.code}. Tap Space to retry.`:nextIndex()<0?'Run complete. Export your results.':'Paused. Tap Space to resume.';}
    };
    $('status').textContent='Starting microphone… Wait for Ready.';render();
    try{recognition.start();}catch(e){event('start-error',{code:e.name,message:e.message});session=null;running=false;activity?.stop();activity=null;save();render();$('status').textContent=`Could not start: ${e.name}`;}
  }
  async function toggle(){
    if(running){pause();return;}if(session||!batch().length)return;
    running=true;render();$('status').textContent='Starting microphone… Wait for Ready.';
    const detector=new VoiceActivity();activity=detector;await detector.start();
    if(activity!==detector||!running){detector.stop();return;}
    startSession();
  }
  $('record').onclick=toggle;
  document.addEventListener('keydown',e=>{if(e.code!=='Space'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,[contenteditable]'))return;e.preventDefault();toggle();});
  $('previous').onclick=()=>{run.index--;manualTarget=true;save();render();};$('next').onclick=()=>{run.index++;manualTarget=true;save();render();};
  $('species').onchange=e=>{run.index=Number(e.target.value);manualTarget=true;save();render();};
  $('export').onclick=()=>{save();const url=URL.createObjectURL(new Blob([JSON.stringify(run,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`pokelator-voice-${run.startedAt.replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('reset').onclick=()=>{if(!confirm('Start a new run? Export first to keep these results. Reliable-name history is kept.'))return;updateValidation();run=fresh();manualTarget=false;updateValidation();run.index=Math.max(0,nextIndex());save();render();$('status').textContent='Paused. Tap Space to start.';};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause();});
  window.addEventListener('pagehide',()=>{running=false;clearTimeout(restart);clearSilence();activity?.stop();activity=null;save();if(session)try{session.recognition.abort();}catch{}});
  render();$('status').textContent=Recognition?'Paused. Tap Space to start.':'Speech recognition is unavailable in this browser.';
})();
