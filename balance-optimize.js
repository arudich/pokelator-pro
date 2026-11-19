/* Bounded multi-start coordinate ascent, including whole physical/special bulk swaps. */
(() => {
  'use strict';
  const stats=['hp','atk','def','spa','spd','spe'];
  function seeds(original) {
    const filled=Object.fromEntries(stats.map(s=>[s,original[s] || 0]));
    let remaining=66-stats.reduce((sum,s)=>sum+filled[s],0);
    for(const s of ['hp','def','spd','spe','atk','spa']) {const add=Math.min(remaining,32-filled[s]);filled[s]+=add;remaining-=add;}
    const result=[filled,{...filled,def:filled.spd,spd:filled.def},Object.fromEntries(stats.map(s=>[s,11]))];
    // Hold offense and Speed fixed while checking each extreme of the bulk simplex.
    const budget=filled.hp+filled.def+filled.spd;
    for(const first of ['hp','def','spd']) for(const second of ['hp','def','spd']) {
      if(first===second) continue;
      const bulk={hp:0,def:0,spd:0};let left=budget;
      for(const s of [first,second,...['hp','def','spd'].filter(s=>s!==first && s!==second)]) {bulk[s]=Math.min(32,left);left-=bulk[s];}
      result.push({...filled,...bulk});
    }
    for(const attack of ['atk','spa']) {
      result.push({hp:2,atk:0,def:0,spa:0,spd:0,spe:32,[attack]:32});
      result.push({hp:32,atk:0,def:0,spa:0,spd:0,spe:2,[attack]:32});
    }
    result.push({hp:32,atk:0,def:32,spa:0,spd:2,spe:0},{hp:32,atk:0,def:2,spa:0,spd:32,spe:0});
    return result;
  }
  async function search(original,evaluate,{limit=160,active=()=>true,progress=()=>{},confirm=async()=>{},
      starts=[],steps=[8,4,2,1],dimensions=stats,includeSeeds=true} = {}) {
    if(!active()) return null;
    const cache=new Map(),legal=i=>stats.every(s=>Number.isInteger(i[s]) && i[s]>=0 && i[s]<=32)
      && stats.reduce((sum,s)=>sum+i[s],0)===66;
    const ordered=()=>[...cache.values()].sort((a,b)=>b.score-a.score);
    async function assess(investment) {
      if(!active()) return null;
      const key=stats.map(s=>investment[s]).join(':');
      if(cache.has(key)) return cache.get(key);
      if(cache.size>=limit) return null;
      const result={investment:{...investment},score:await evaluate(investment)};
      if(!active()) return null;
      cache.set(key,result);progress(cache.size,limit,result);return result;
    }
    for(const seed of [...starts,...(includeSeeds ? seeds(original) : [])]) if(legal(seed)) await assess(seed);
    if(!cache.size) return {candidates:[],evaluations:0};
    // Reserve evaluations for each finer scale instead of spending the cap on coarse neighbors.
    const seedCount=cache.size;
    for(let phase=0;phase<steps.length && cache.size<limit;phase++) {
      const step=steps[phase],phaseLimit=Math.floor(seedCount+(limit-seedCount)*(phase+1)/steps.length);
      let current=ordered()[0],improved=true;
      while(improved && cache.size<phaseLimit && active()) {
        improved=false;let best=current;
        for(const from of dimensions) for(const to of dimensions) {
          if(!active()) return null;
          if(from===to || cache.size>=phaseLimit) continue;
          const amount=Math.min(step,current.investment[from],32-current.investment[to]);
          if(!amount) continue;
          const candidate=await assess({...current.investment,[from]:current.investment[from]-amount,[to]:current.investment[to]+amount});
          if(candidate && candidate.score>best.score+1e-12) best=candidate;
        }
        if(best.score>current.score+1e-12) {current=best;improved=true;}
      }
    }
    const finalists=ordered().slice(0,5);
    for(const candidate of finalists) {if(!active()) return null;await confirm(candidate);}
    return {candidates:finalists,evaluations:cache.size};
  }
  window.BalanceOptimize={search,seeds};
})();
