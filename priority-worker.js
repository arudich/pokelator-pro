/* One candidate's strongest priority attack, measured against typical Top N builds. */
'use strict';self.window=self;
importScripts('vendor/smogon-data.min.js','vendor/smogon-calc.min.js',
  'data/move-types.js?v=20261123-priority','data/balance-moves.js?v=20261123-priority',
  'multi-hit.js?v=20261123-priority','battle.js?v=20261123-priority','offense.js?v=20261123-priority');
self.onmessage=({data:job})=>{
  try {
    const rows=[];
    for(const candidate of job.candidates) {
      let best=null;
      for(const move of candidate.moves) {
        const entry={...candidate.entry,ability:move.ability || candidate.entry.ability};
        let sum=0,total=0,failed=false;
        for(const target of job.targets) {
          if(!(target.weight>0))continue;
          const options={...job.options,terrain:move.name==='Grassy Glide' ? 'Grassy' : job.options.terrain};
          const range=Battle.range(candidate.species,entry,target.species,target.entry,move.name,options);
          const mean=Offense.meanDamage(range.rolls);
          if(range.error || mean===null || !range.hp){failed=true;break;}
          sum+=Math.min(1,mean/range.hp)*target.weight;total+=target.weight;
        }
        if(!failed && total>0) {
          const result={...move,score:100*sum/total};
          if(!best || result.score>best.score || (result.score===best.score && (result.percent ?? -1)>(best.percent ?? -1)))best=result;
        }
      }
      rows.push({id:candidate.species.id,best});
      if(rows.length%10===0)self.postMessage({progress:rows.length,total:job.candidates.length});
    }
    self.postMessage({rows});
  }catch(error){self.postMessage({error:error.message});}
};
