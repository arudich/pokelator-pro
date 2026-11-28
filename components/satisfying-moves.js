/* Assign distinct required moves in filter order, then fill missing STAB coverage.
   Marginal usage ranks equally sized sets. */
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
  function assign(names,tests,weight,coverage=[]) {
    if(tests.length>4)return null;
    const full=(1<<(tests.length+coverage.length))-1,buckets=new Map();
    const earlier=(moves,other)=>{
      for(let index=0;index<moves.length;index++) {
        if(moves[index]===other[index])continue;
        const difference=weight(moves[index])-weight(other[index]);
        return difference ? difference>0 : moves[index].localeCompare(other[index])<0;
      }
      return false;
    };
    for(const name of names.slice().sort((a,b)=>weight(b)-weight(a) || a.localeCompare(b))) {
      const bits=tests.reduce((mask,test,index)=>mask|(test(name) ? 1<<index : 0),0);
      const covers=coverage.reduce((mask,test,index)=>mask|(test(name) ? 1<<(tests.length+index) : 0),0);
      const eligibility=bits|covers;
      if(!eligibility)continue;
      if(!buckets.has(eligibility))buckets.set(eligibility,[]);
      if(buckets.get(eligibility).length<4)buckets.get(eligibility).push({name,bits,covers});
    }
    let dp=new Map([[0,{score:0,required:Array(tests.length),extra:[]}]]);
    for(const {name,bits,covers} of [...buckets.values()].flat()) {
      const next=new Map(dp);
      for(const [mask,row] of dp) {
        const covered=mask|covers,score=row.score+weight(name);
        const record=(key,required,extra)=>{
          const best=next.get(key);
          if(!best || extra.length<best.extra.length || extra.length===best.extra.length &&
            (score>best.score+1e-12 || Math.abs(score-best.score)<=1e-12 && earlier([...required,...extra],[...best.required,...best.extra]))) {
            next.set(key,{score,required,extra});
          }
        };
        if(covered!==mask && row.extra.length<4-tests.length)record(covered,row.required,[...row.extra,name]);
        for(let slot=0;slot<tests.length;slot++) {
          const bit=1<<slot;if(mask&bit || !(bits&bit))continue;
          const required=row.required.slice();required[slot]=name;
          record(covered|bit,required,row.extra);
        }
      }
      dp=next;
    }
    const result=dp.get(full);
    return result ? {score:result.score,moves:[...result.required,...result.extra]} : null;
  }
  function build(species,filters,usage,{moveMeta,priorityChoices,typeEffectiveness}) {
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
      const targets=filters.stabTargets || [];
      const stab=targets.length ? new Map(names.map(name=>[name,MoveFilters.stabType(moveMeta(name),context)])) : null;
      const coverage=targets.map(target=>name=>stab.get(name) && typeEffectiveness(stab.get(name),target)>1);
      const row=assign(names,tests,weight,coverage);if(!row)continue;
      const score=row.score+Math.log(Math.max(.001,abilityUsage.get(ability) ?? (ability===species.abilities[0] ? 1 : .001)));
      if(!best || row.moves.length<best.moveSet.length || row.moves.length===best.moveSet.length && score>best.score)best={score,ability,moveSet:row.moves};
    }
    return best ? {ability:best.ability,moveSet:best.moveSet} : null;
  }
  window.SatisfyingMoves={build,assign,canAssign};
})();
