'use strict';
self.window=self;
importScripts('vendor/smogon-data.min.js','vendor/smogon-calc.min.js',
  'data/move-types.js?v=20261120-champions-types','battle.js?v=20261118-speed-nature','offense.js?v=20261118-equal-two-hit-points','data/balance-moves.js?v=20261118-mega-toggle','balance.js?v=20261118-mega-toggle');
self.onmessage=async ({data:job})=>{
  try {
    self.postMessage({type:'progress'});
    for(let index=0;index<job.targets.length;index++) {
      const target=job.targets[index];
      const result=await Balance.analyze(job.species,job.ours,target,{samples:256});
      self.postMessage({type:'row',row:{species:target.species,scenarioId:target.scenarioId,scenario:target.scenario,
        weight:target.weight,rank:target.usage.rank,reference:target.usage.name,...result},completed:index+1,total:job.targets.length});
    }
    self.postMessage({type:'done'});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
