/* Shared six-SP sweeps bound threshold work independently of icon count. */
'use strict';
self.window=self;
importScripts('vendor/smogon-data-0.12.0.min.js','vendor/smogon-calc-0.12.0.min.js',
  'battle.js?v=20261118-speed-nature','offense.js?v=20261118-equal-two-hit-points');
self.onmessage=({data:job})=>{
  try {
    let sweeps=0;
    const evaluate=investment=>{
      sweeps++;
      return job.targets.map(target=>Offense.analyze(job.species,{...job.ours,investment},target.species,target.spreads,{
        ...job.options,...target.options,keepProbability:false,boostDefenseNature:stat=>target.boosts[stat] || false}));
    };
    const baseline=evaluate(job.ours.investment),thresholds={};
    for(const stat of job.stats) {
      const limit=job.ours.investment[stat];
      for(let drop=6;drop<limit+6;drop+=6) {
        const high=Math.min(drop,limit),low=Math.max(1,high===limit && limit%6 ? limit-limit%6+1 : high-5);
        if(!high) break;
        const rows=evaluate({...job.ours.investment,[stat]:limit-high});
        rows.forEach((row,index)=>{
          const id=job.targets[index].id;
          thresholds[id] ||= {};
          if(!thresholds[id][stat] && row.kind!==baseline[index].kind) thresholds[id][stat]={stat,low,high,kind:row.kind};
        });
        if(high===limit) break;
      }
      job.targets.forEach(target=>{
        thresholds[target.id] ||= {};
        thresholds[target.id][stat] ||= {stat,limit};
      });
    }
    self.postMessage({thresholds,sweeps});
  } catch(error) {self.postMessage({error:error.message});}
};
