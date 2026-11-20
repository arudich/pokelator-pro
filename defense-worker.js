/* Persistent models keep one-point adjustments cheap and off the UI thread. */
'use strict';
self.window=self;
importScripts('vendor/smogon-data.min.js','vendor/smogon-calc.min.js',
  'battle.js?v=20261118-speed-nature','offense.js?v=20261118-equal-two-hit-points','defense.js?v=20261118-offense-might-ohko');
let context='',profiles=[],baselineRows=[],solutions=new Map(),thresholdCache=new Map(),version=0;
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const identity=row=>row.scenarioId || row.species.id;
const rows=(investment,withProbability=true)=>profiles.map(profile=>{
  const result=profile.evaluate(investment,withProbability);
  return {species:profile.species,reference:profile.reference,rank:profile.rank,
    scenarioId:profile.scenarioId,scenario:profile.scenario,weight:profile.weight,...result,
    koModel:undefined,koProbability:withProbability ? Offense.tierProbability(result) : undefined};
});
self.onmessage=async ({data:job})=>{
  const token=++version,active=()=>token===version;
  const send=data=>{if(active()) self.postMessage({...data,requestId:job.requestId});};
  try {
    if (context!==job.contextKey) {
      context=job.contextKey;
      profiles=job.targets.map(target=>({...Defense.profile(target.species,job.species,job.ours,target.usage,{
        ...job.options,...target.options,boostOffenseNature:stat=>target.boosts[stat] || false
      }),scenarioId:target.scenarioId,scenario:target.scenario,weight:target.weight}));
      baselineRows=rows(job.ours.investment);solutions=new Map();thresholdCache=new Map();
      solutions.set(0,{investment:job.ours.investment,...Defense.measure(profiles,job.ours.investment),evaluations:0,full:true});
      if(job.localAdjustment && job.previousInvestment) solutions.set(job.previousBudget,{
        investment:job.previousInvestment,...Defense.measure(profiles,job.previousInvestment),evaluations:0});
    }
    send({type:'baseline',rows:baselineRows});
    const budget=job.pointBudget;
    let best=solutions.get(budget),searchMode='cached';
    if(job.localAdjustment && !job.forceFull) {
      // Rapid arrows may overtake an unfinished request. Continue from the closest
      // cached allocation instead of falling back to a full solve.
      const source=solutions.has(job.previousBudget) ? [job.previousBudget,solutions.get(job.previousBudget)]
        : [...solutions].sort((a,b)=>Math.abs(a[0]-budget)-Math.abs(b[0]-budget))[0];
      let currentBudget=source[0];best=source[1];
      const direction=Math.sign(budget-currentBudget);
      if(currentBudget===budget && job.previousBudget!==budget) {
        // The exact cached target is already a valid local-path result.
        searchMode='cached';
      } else {
        searchMode='local';
        while(currentBudget!==budget) {
          best=Defense.localStep(job.ours,profiles,best.investment,direction);
          currentBudget+=direction;solutions.set(currentBudget,best);
          await pause();if(!active()) return;
        }
      }
    } else if (!best || (job.forceFull && !best.full)) {
      best=await Defense.bestSpread(job.ours,profiles,{pointBudget:budget,active,pause,
        progress:evaluations=>send({type:'progress',evaluations})});
      searchMode='full';if(best) best.full=true;
      if(!active()) return;
      solutions.set(budget,best);
    }
    const previewRows=rows(best.investment);
    send({type:'done',best:budget ? best : null,rows:previewRows,searchMode});
    if (!job.showThresholds || !budget) return;
    const thresholdKey=JSON.stringify(best.investment);
    if (!thresholdCache.has(thresholdKey)) {
      const path=[{investment:best.investment,rows:previewRows,remaining:budget}];
      let current=best.investment;
      // One shared local removal path serves every opponent; never solve per icon.
      for(let delta=1;delta<=budget;delta++) {
        const next=Defense.localStep(job.ours,profiles,current,-1);current=next.investment;
        path.push({investment:current,rows:rows(current,false),remaining:budget-delta});
        if(!solutions.has(budget-delta)) solutions.set(budget-delta,next);
        await pause();if(!active()) return;
      }
      // Populate every suffix too: subsequent arrows and per-icon queries are lookups.
      let following=null,followingThresholds=null;
      for(let i=path.length-1;i>=0;i--) {
        const node=path[i],thresholds={};
        node.rows.forEach((row,index)=>{
          const id=identity(row),next=followingThresholds?.[id];
          thresholds[id]=following && row.kind!==following.rows[index].kind
            ? {low:1,high:1,kind:following.rows[index].kind,stat:'defense'}
            : next?.high ? {...next,low:next.low+1,high:next.high+1} : {limit:node.remaining,stat:'defense'};
        });
        thresholdCache.set(JSON.stringify(node.investment),thresholds);
        following=node;followingThresholds=thresholds;
      }
    }
    send({type:'thresholds',thresholds:thresholdCache.get(thresholdKey)});
  } catch(error) {send({type:'error',message:error.message || 'Unable to calculate defense.'});}
};
