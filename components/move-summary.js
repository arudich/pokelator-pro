/* Concise picker descriptions. Numeric secondary effects use Champions metadata,
   since inherited Showdown prose can retain an older game's proc chance. */
(() => {
  const status={brn:'burn',par:'paralysis',psn:'poison',tox:'bad poison',slp:'sleep',frz:'freeze'};
  const stats={atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe',accuracy:'accuracy',evasion:'evasion'};
  function boosts(values) {
    const groups=new Map();
    for(const [stat,value] of Object.entries(values || {})) {
      if(!value) continue;
      if(!groups.has(value)) groups.set(value,[]);
      groups.get(value).push(stats[stat] || stat);
    }
    return [...groups].map(([value,names])=>`${value>0 ? '+' : '−'}${Math.abs(value)} ${names.join('/')}`).join(', ');
  }
  function describe(effect = {}) {
    const text=(effect.shortDesc || '').replace(/Sp\. Atk/g,'SpA').replace(/Sp\. Def/g,'SpD').trim();
    // Remove inherited proc prose before appending authoritative secondary data.
    // Preserve other clauses, e.g. Scald thawing or Freeze-Dry's Water matchup.
    const prose=text.split(/(?<=[.!?])\s+/).filter(sentence=>!(/% chance/i.test(sentence)
      && /burn|poison|paraly|sleep|freez|flinch|confus|rais|lower|stat/i.test(sentence))
      && !/^No additional effect\.?$/i.test(sentence)
      && !/^Hits \d+(?:[-–]\d+)? times in one turn\.?$/i.test(sentence)).join(' ');
    const self=effect.target==='self';
    let primary=prose;
    const statSentence=prose.match(/^(Raises|Lowers) (the )?(user|target)'s [^.]+ by \d+\./)?.[0];
    const changes=effect.boosts || effect.self?.boosts;
    if(statSentence && changes) {
      const label=`${self || !effect.boosts ? 'Self' : 'Target'}: ${boosts(changes)}`;
      primary=prose===statSentence ? label : prose.replace(statSentence,label+'.');
    }
    if(!primary && !text) {
      if(effect.boosts) primary=`${self ? 'Self' : 'Target'}: ${boosts(effect.boosts)}`;
      else if(effect.self?.boosts) primary=`Self: ${boosts(effect.self.boosts)}`;
      else if(effect.heal) primary=`${self ? 'Self' : 'Target'}: heal ${100*effect.heal[0]/effect.heal[1]}% HP`;
      else if(effect.status) primary=`${self ? 'Self' : 'Target'}: ${status[effect.status] || effect.status}`;
    }
    const details=primary ? [primary] : [];
    for(const secondary of effect.secondaries || (effect.secondary ? [effect.secondary] : [])) {
      const labels=[];
      if(secondary.statusChoices?.length) labels.push(`status (${secondary.statusChoices.map(s=>status[s] || s).join('/')})`);
      else if(secondary.status) labels.push(status[secondary.status] || secondary.status);
      if(secondary.volatileStatus) labels.push(secondary.volatileStatus);
      if(secondary.boosts) labels.push(`Target: ${boosts(secondary.boosts)}`);
      if(secondary.self?.boosts) labels.push(`Self: ${boosts(secondary.self.boosts)}`);
      if(labels.length) details.push(`${secondary.chance ?? 100}% ${labels.join(', ')}`);
    }
    if(effect.priority) details.push(`Priority ${effect.priority>0 ? '+' : '−'}${Math.abs(effect.priority)}`);
    if(effect.target==='allAdjacentFoes') details.push('All foes');
    else if(effect.target==='allAdjacent') details.push('Hits allies too');
    return details.join(' · ');
  }
  window.MoveSummary={describe};
})();
