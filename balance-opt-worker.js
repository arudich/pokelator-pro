'use strict';self.window=self;
importScripts('vendor/smogon-data.min.js','vendor/smogon-calc.min.js',
  'data/move-types.js?v=20261120-champions-types','data/balance-moves.js?v=20261121-multi-hit','multi-hit.js?v=20261121-full-attacks','battle.js?v=20261121-full-attacks','offense.js?v=20261121-full-attacks',
  'balance.js?v=20261121-full-attacks','balance-optimize.js?v=20261118-mega-toggle');
self.onmessage=async ({data:{job,baselineRows,starts=[]}})=>{
  try {
    // The job contains precisely the current Top-N roster, including field variants.
    // Zero-weight species are skipped in screening but refreshed for confirmed previews.
    const cacheLimit=Math.max(64,Math.floor(18000/Math.max(1,job.targets.length)));
    const profiles=job.targets.map(target=>({target,
      model:Balance.prepare(job.species,job.ours,target,{cacheLimit})}));
    const baseline=new Map(baselineRows.map(row=>[row.scenarioId || row.species.id,row]));
    const priority=({target})=>{
      const row=baseline.get(target.scenarioId || target.species.id),p=row?.samples ? row.wins/row.samples : 0.5;
      return (target.weight ?? 1)*(0.2+p*(1-p));
    };
    profiles.sort((a,b)=>priority(b)-priority(a));
    const totalWeight=job.targets.reduce((sum,target)=>sum+(target.weight ?? 1),0),screenLeaders=new Map();
    let best={investment:job.ours.investment,score:Balance.totalScore(baselineRows),rows:baselineRows};
    const confirmed=new Set([JSON.stringify(job.ours.investment)]);
    self.postMessage({type:'best',best});
    async function evaluate(investment,samples) {
      const evaluated=new Map(),top=screenLeaders.get(samples) || [];
      let score=0,remaining=totalWeight;
      for(const {target,model} of profiles) {
        if(samples<256 && !(target.weight ?? 1)) continue;
        const result=await model.analyze(investment,{samples});
        const weight=target.weight ?? 1;
        score+=(result.samples ? result.wins/result.samples : 0)*weight;remaining-=weight;
        // Exact upper bound: even winning every remaining matchup cannot put
        // this spread in the screening shortlist. Never prune full validation.
        if(samples<256 && top.length===5 && score+remaining<=top[4]+1e-12) return {investment,score:-Infinity};
        evaluated.set(target.scenarioId || target.species.id,{species:target.species,scenarioId:target.scenarioId,scenario:target.scenario,weight:target.weight,
          rank:target.usage.rank,reference:target.usage.name,...result});
      }
      const rows=job.targets.map(target=>evaluated.get(target.scenarioId || target.species.id)
        || baseline.get(target.scenarioId || target.species.id));
      if(samples<256) screenLeaders.set(samples,[...top,score].sort((a,b)=>b-a).slice(0,5));
      return {investment,score:Balance.totalScore(rows),rows};
    }
    async function confirm(candidate) {
      const key=JSON.stringify(candidate.investment);if(confirmed.has(key)) return;confirmed.add(key);
      self.postMessage({type:'confirming'});
      const checked=await evaluate(candidate.investment,256);
      if(checked.score>best.score+1e-12) {best=checked;self.postMessage({type:'best',best});}
    }
    // Never miss a better direct physical/special bulk swap or a Defense-panel
    // recommendation just because it ranks poorly in the small screening sample.
    const bulkSwap={...job.ours.investment,def:job.ours.investment.spd,spd:job.ours.investment.def};
    for(const investment of [bulkSwap,...starts]) await confirm({investment});
    // Broad cheap screening followed by less noisy, repeated local improvement.
    const coarse=await BalanceOptimize.search(job.ours.investment,async investment=>(await evaluate(investment,16)).score,{
      limit:96,starts:[best.investment,...starts],
      progress:evaluations=>self.postMessage({type:'progress',evaluations,limit:160,phase:'Screening at 16 trials'})
    });
    for(const candidate of coarse.candidates.slice(0,2)) await confirm(candidate);
    const leaders=[best.investment,...coarse.candidates.map(candidate=>candidate.investment)];
    // A direct bulk swap is always reconsidered against the finer sample too.
    leaders.push({...best.investment,def:best.investment.spd,spd:best.investment.def});
    await BalanceOptimize.search(job.ours.investment,async investment=>(await evaluate(investment,64)).score,{
      limit:64,starts:leaders,includeSeeds:false,steps:[4,2,1],
      progress:evaluations=>self.postMessage({type:'progress',evaluations:coarse.evaluations+evaluations,limit:160,phase:'Refining at 64 trials'}),
      confirm
    });
    self.postMessage({type:'done',best});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
