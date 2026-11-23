/* One distinct move per requirement, in filter order. Marginal usage ranks
   assignments; no joint-set frequency is claimed or displayed. */
(() => {
  function canAssign(names,tests) {
    if(tests.length>4)return false;
    const assigned=new Map();
    const place=(slot,seen)=>{
      for(const name of names) {
        if(seen.has(name) || !tests[slot](name))continue;
        seen.add(name);
        if(!assigned.has(name) || place(assigned.get(name),seen)){assigned.set(name,slot);return true;}
      }
      return false;
    };
    return tests.every((_,slot)=>place(slot,new Set()));
  }
  function assign(names,tests,weight) {
    if(tests.length>4)return null;
    const full=(1<<tests.length)-1,buckets=new Map();
    const earlier=(moves,other)=>{
      for(let index=0;index<moves.length;index++) {
        if(moves[index]===other[index])continue;
        const difference=weight(moves[index])-weight(other[index]);
        return difference ? difference>0 : moves[index].localeCompare(other[index])<0;
      }
      return false;
    };
    // At most four names with identical eligibility can be needed.
    for(const name of names.slice().sort((a,b)=>weight(b)-weight(a) || a.localeCompare(b))) {
      const bits=tests.reduce((mask,test,index)=>mask|(test(name) ? 1<<index : 0),0);
      if(!bits)continue;if(!buckets.has(bits))buckets.set(bits,[]);
      if(buckets.get(bits).length<4)buckets.get(bits).push({name,bits});
    }
    const dp=Array(full+1).fill(null);dp[0]={score:0,moves:Array(tests.length)};
    for(const move of [...buckets.values()].flat())for(let mask=full;mask>=0;mask--) {
      const row=dp[mask];if(!row)continue;
      for(let slot=0;slot<tests.length;slot++) {
        const bit=1<<slot;if(mask&bit || !(move.bits&bit))continue;
        const next=mask|bit,score=row.score+weight(move.name);
        const moves=row.moves.slice();moves[slot]=move.name;
        if(!dp[next] || score>dp[next].score+1e-12 || Math.abs(score-dp[next].score)<=1e-12 && earlier(moves,dp[next].moves))dp[next]={score,moves};
      }
    }
    return dp[full];
  }
  function build(species,filters,usage,{moveMeta,priorityChoices}) {
    const names=[...new Set(species.learnset)].filter(name=>moveMeta(name)),pinned=filters.moves || [];
    if(new Set(pinned).size!==pinned.length || pinned.some(name=>!names.includes(name)))return null;
    const moveUsage=new Map((usage?.moves || []).map(row=>[calc.toID(row.name),row.percent]));
    const abilityUsage=new Map((usage?.abilities || []).map(row=>[row.name,row.percent]));
    const weight=name=>Math.log(Math.max(.001,moveUsage.get(calc.toID(name)) ?? (species.moves?.includes(name) ? .01 : .001)));
    const abilities=species.abilities.filter(name=>!filters.abilities?.length || filters.abilities.includes(name));
    let best=null;
    for(const ability of abilities) {
      const context={...species,ability},tests=[...pinned.map(required=>name=>name===required),
        ...(filters.moveQueries || []).map(q=>name=>MoveFilters.matches(moveMeta(name),q,context))];
      if(filters.priorityRequired || filters.sort==='priority') {
        const priority=new Set(priorityChoices(species,{...filters,abilities:[ability]}).map(move=>move.name));
        tests.push(name=>priority.has(name));
      }
      const row=assign(names,tests,weight);if(!row)continue;
      const score=row.score+Math.log(Math.max(.001,abilityUsage.get(ability) ?? (ability===species.abilities[0] ? 1 : .001)));
      if(!best || score>best.score)best={score,ability,moveSet:row.moves};
    }
    return best ? {ability:best.ability,moveSet:best.moveSet} : null;
  }
  window.SatisfyingMoves={build,assign,canAssign};
})();
