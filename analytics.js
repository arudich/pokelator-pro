// Anonymous action totals only. No IDs, team contents, URLs, or error messages leave the browser.
(() => {
  const allowed=new Set(['pokelator.win','www.pokelator.win','pokelator-pro.pages.dev']);
  const events=new Set(['visit','matchup','team_created','team_imported','pokemon_added','color_change','color_saved']);
  const pending={},seen=new Set();
  let enabled=false,timer;
  const optedOut=()=>navigator.doNotTrack==='1' || navigator.globalPrivacyControl===true;
  async function flush() {
    clearTimeout(timer);timer=null;
    if(!enabled || optedOut() || !Object.keys(pending).length) return;
    const counts={...pending};for(const key in pending) delete pending[key];
    // Best effort: never retry ambiguous writes or block an interaction.
    try {await fetch('/api/usage',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({counts}),keepalive:true,credentials:'omit'});} catch {}
  }
  window.SiteUsage={
    count(event,identity) {
      if(!enabled || optedOut() || !events.has(event)) return;
      if(identity!==undefined) {
        const key=event+':'+identity;if(seen.has(key)) return;
        if(seen.size>=200) seen.clear();seen.add(key);
      }
      pending[event]=Math.min(20,(pending[event] || 0)+1);
      if(!timer) timer=setTimeout(flush,30000);
    },
    flush
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden) flush();});
  if(allowed.has(location.hostname) && !navigator.webdriver && !optedOut()) {
    fetch('/api/usage',{credentials:'omit',cache:'no-store'}).then(r=>r.ok ? r.json() : null).then(config=>{
      enabled=config?.enabled===true;if(enabled) window.SiteUsage.count('visit');
    }).catch(()=>{});
  }
})();
