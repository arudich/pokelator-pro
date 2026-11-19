/* Incoming usage-weighted damage and bounded free-point optimization. */
(() => {
  'use strict';
  const groups = Offense.groups.map(group=>group.kind==='rest' ? {...group,label:'4+ hits / other'} : group);
  const freePoints = ours => Math.max(0,66-Object.values(ours.investment).reduce((sum,value)=>sum+value,0));
  function profile(attackerSpecies,defenderSpecies,ours,usage,options = {}) {
    const spreads = (usage?.spreads || []).filter(row => Number.isFinite(row.percent) && row.percent > 0);
    const moves = (usage?.moves || []).map(row => ({...row,meta:Battle.moveMeta(row.name)}))
      .filter(row => row.meta && row.meta.category !== 'Status' && Number.isFinite(row.percent) && row.percent > 0);
    const coverage = spreads.reduce((sum,row)=>sum+row.percent,0);
    const unsupported = moves.filter(row => !Offense.canEvaluateMove(row.name));
    const usable = moves.filter(row => Offense.canEvaluateMove(row.name));
    const cache = new Map();
    const models = usable.flatMap(move => spreads.map(spread => {
      const meta = move.meta;
      const attacker = {investment:spread.investment,ability:options.attackerAbility || '',item:options.attackerItem || '',
        nature:options.boostOffenseNature?.(meta.offensiveStat) ? {plus:meta.offensiveStat,minus:meta.offensiveStat === 'atk' ? 'spa' : 'atk'} : null};
      const rawCache = new Map();
      const initial = Battle.range(attackerSpecies,attacker,defenderSpecies,ours,move.name,options);
      const override = Battle.generation.moves.get(calc.toID(move.name))?.overrideDefensiveStat;
      const stat = override || (initial.meta?.category === 'Physical' ? 'def' : 'spd');
      // Most damage rolls depend on one defense stat, not max HP. Keep HP-dependent
      // moves and Shell Side Arm's defense comparison in their own cache dimensions.
      const hpDependent = !meta.power || ['Hard Press','Crush Grip','Wring Out'].includes(meta.name);
      const bothDefenses = meta.name === 'Shell Side Arm';
      function range(investment,followup = false) {
        const key = JSON.stringify([investment[stat],bothDefenses ? [investment.def,investment.spd] : null,
          hpDependent ? investment.hp : null,followup]);
        if (!rawCache.has(key)) rawCache.set(key,Battle.range(attackerSpecies,attacker,defenderSpecies,
          {...ours,investment,...(followup ? {ability:'No Ability'} : {})},move.name,options));
        const raw = rawCache.get(key);
        return {...raw,hp:defenderSpecies.stats.hp === 1 ? 1 : defenderSpecies.stats.hp+investment.hp};
      }
      return {move,spread,range};
    }));
    const bySpread=spreads.map(spread=>({spread,models:models.filter(model=>model.spread===spread)}));
    return {species:attackerSpecies,reference:usage?.name || attackerSpecies.name,rank:usage?.rank,
      evaluate(investment,withProbability=false) {
        const key = [investment.hp,investment.def,investment.spd].join(':');
        if (cache.has(key) && (!withProbability || cache.get(key).koModel || cache.get(key).error)) return cache.get(key);
        const missing = !spreads.length ? 'No reported stat spreads.' : !usable.length ? 'No reported calculable damaging move usage.' : '';
        if (missing) return {kind:'rest',error:missing,coverage,count:spreads.length};
        const shares=new Map(),ineffective=new Set();
        let noAttackShare=0;
        const samples = bySpread.flatMap(({spread,models}) => {
          const attacks=models.map(model => {
          const range = model.range(investment);
          const followupRange = ['Multiscale','Shadow Shield'].includes(range.defenderAbility) ? model.range(investment,true) : null;
          const survival = range.defenderAbility === 'Sturdy' || (range.defenderAbility === 'Ice Face' && range.meta?.category === 'Physical')
            || ['Focus Sash','Focus Band'].includes(range.defenderItem);
          return {move:model.move,followupRange,
            range:survival ? {...range,error:`${range.defenderAbility || range.defenderItem} requires survival/turn context.`} : range};
          }).filter(attack=>{
            if (!attack.range.error && Offense.meanDamage(attack.range.rolls)===0) {
              ineffective.add(attack.move.name);return false;
            }
            return true;
          }).sort((a,b)=>(Offense.meanDamage(b.range.rolls) ?? -1)-(Offense.meanDamage(a.range.rolls) ?? -1));
          // For each spread, take the strongest move PRESENT in an estimated set.
          // Marginal frequencies do not reveal co-occurrence: assume independent
          // inclusion, so P(this wins) = P(present) * P(all stronger moves absent).
          let remaining=1;
          const selected=[];
          for (const attack of attacks) {
            const probability=remaining*Math.min(1,attack.move.percent/100);
            remaining*=1-Math.min(1,attack.move.percent/100);
            if (!probability) continue;
            shares.set(attack.move.name,(shares.get(attack.move.name) || 0)+probability*spread.percent/coverage*100);
            selected.push({...attack,percent:probability*spread.percent});
          }
          // Keep uncovered probability rather than renormalizing a rare move upward.
          if (remaining>0) {
            noAttackShare+=remaining*spread.percent/coverage*100;
            selected.push({percent:remaining*spread.percent,
              range:{rolls:[0],minDamage:0,maxDamage:0,hp:defenderSpecies.stats.hp===1 ? 1 : defenderSpecies.stats.hp+investment.hp}});
          }
          return selected;
        });
        const result = Offense.summarize(samples,options.multiplier ?? 1,withProbability);
        if (!result.error && samples.some(sample=>sample.range.defenderAbility === 'Disguise')) {
          result.score = result.score/(1+result.score);result.guaranteed=false;result.kind=Offense.category(result.score);
        }
        const ohkoProbability=result.error ? null : Offense.firstHitProbability(samples,options.multiplier ?? 1);
        if(!result.error && !result.guaranteed) {
          if(ohkoProbability>=0.5) result.kind='probable-ohko';
          else if(ohkoProbability>0) result.kind='might-ohko';
        }
        const bestAttacks=[...shares].sort((a,b)=>b[1]-a[1]).map(([name,percent])=>({name,percent,usage:usable.find(move=>move.name===name).percent}));
        const selectedMoves=bestAttacks.map(move=>`${move.name} (${move.percent.toFixed(1)}% estimated best-attack share; ${move.usage}% move usage)`);
        const ineffectiveMoves=[...ineffective].filter(name=>!shares.has(name));
        const detail = `Weather: ${options.weather || 'None'}; Terrain: ${options.terrain || 'None'}. Strongest effective attacks per estimated set: ${selectedMoves.join(', ') || 'None'}. ${noAttackShare.toFixed(1)}% of estimated sets have no effective reported attack; this probability contributes zero damage, not an ineffective move choice. This is a weighted tier; individual sets may KO sooner. Move inclusion is approximated independently; actual joint movesets are unavailable.${ineffectiveMoves.length ? ` Zero damage against this target in the current field: ${ineffectiveMoves.map(name=>`${name} (${usable.find(move=>move.name===name).percent}% move usage)`).join(', ')}.` : ''}${unsupported.length ? ` Excluded unmodeled counter/OHKO moves: ${unsupported.map(row=>row.name).join(', ')}.` : ''} ${spreads.length} reported spreads cover ${coverage.toFixed(1)}% of sets (${usage?.name || attackerSpecies.name}).`;
        const row = {...result,ohkoProbability,kind:result.kind || 'rest',coverage,count:spreads.length,detail,bestAttacks,ineffectiveMoves,noAttackShare};
        cache.set(key,row);return row;
      }};
  }
  async function bestSpread(ours,profiles,{active=()=>true,pause=()=>Promise.resolve(),progress=()=>{},pointBudget=freePoints(ours)} = {}) {
    const free = Math.max(0,Math.min(freePoints(ours),Math.floor(Number(pointBudget) || 0))),original=ours.investment;
    const stats=['hp','def','spd'],caps=stats.map(stat=>32-original[stat]);
    const cache=new Map(),budget=112;
    const compare=(a,b)=>a.points-b.points || a.damage-b.damage;
    async function assess(added) {
      if (!active()) return null;
      const key=added.join(':');
      if (cache.has(key)) return cache.get(key);
      if (cache.size>=budget) return null;
      const investment={...original,...Object.fromEntries(stats.map((stat,index)=>[stat,original[stat]+added[index]]))};
      const score=profiles.reduce((sum,profile)=>{
        const result=profile.evaluate(investment);
        return {points:sum.points+Offense.points(result)*(profile.weight ?? 1),damage:sum.damage+(result.score || 0)*(profile.weight ?? 1)};
      },{points:0,damage:0});
      const result={investment,added,...score};
      cache.set(key,result);
      if (cache.size%4===0) {progress(cache.size);await pause();}
      return result;
    }
    const baseline=await assess([0,0,0]);
    if (!baseline || !active()) return null;
    // A small coarse grid supplies distinct starts, including legal boundaries.
    // This samples at most 17 full-budget spreads, regardless of the SP budget.
    const ticks=(low,high)=>[...new Set([0,1,2,3].map(i=>Math.round(low+(high-low)*i/3)))];
    const seeds=[];
    const hpLow=Math.max(0,free-caps[1]-caps[2]),hpHigh=Math.min(free,caps[0]);
    for (const hp of ticks(hpLow,hpHigh)) {
      for (const def of ticks(Math.max(0,free-hp-caps[2]),Math.min(free-hp,caps[1]))) {
        const seed=await assess([hp,def,free-hp-def]);
        if (!seed || !active()) return null;
        seeds.push(seed);
      }
    }
    const balanced=[0,0,0];
    for (let remaining=free;remaining>0;) for (let i=0;i<3 && remaining;i++) {
      if (balanced[i]<caps[i]) {balanced[i]++;remaining--;}
    }
    const middle=await assess(balanced);
    if (!middle || !active()) return null;
    seeds.push(middle);
    const unique=[...new Map(seeds.map(seed=>[seed.added.join(':'),seed])).values()].sort(compare);
    const leaders=unique.slice(0,3);
    let winner=leaders[0];
    async function descend(current,step) {
      let best=current;
      // Transfer SP between each pair; the total and existing investment stay fixed.
      for (let from=0;from<3;from++) for (let to=0;to<3;to++) {
        if (from===to) continue;
        const amount=Math.min(step,current.added[from],caps[to]-current.added[to]);
        if (!amount) continue;
        const next=[...current.added];next[from]-=amount;next[to]+=amount;
        const candidate=await assess(next);
        if (!active()) return null;
        if (candidate && compare(candidate,best)<0) best=candidate;
      }
      if (compare(best,winner)<0) winner=best;
      return best;
    }
    let step=1;
    while (step*2<=Math.max(1,free/4)) step*=2;
    // Give every start a coarse-to-fine pass before spending the remaining budget.
    for (;step>=1;step=Math.floor(step/2)) for (let i=0;i<leaders.length;i++) {
      leaders[i]=await descend(leaders[i],step);
      if (!leaders[i]) return null;
    }
    let improved=true;
    while (improved && cache.size<budget) {
      improved=false;
      for (let i=0;i<leaders.length;i++) {
        const next=await descend(leaders[i],1);
        if (!next) return null;
        if (compare(next,leaders[i])<0) improved=true;
        leaders[i]=next;
      }
    }
    return {...winner,gain:baseline.points-winner.points,evaluations:cache.size};
  }
  function measure(profiles,investment) {
    return profiles.reduce((sum,profile)=>{
      const result=profile.evaluate(investment),weight=profile.weight ?? 1;
      return {points:sum.points+Offense.points(result)*weight,damage:sum.damage+(result.score || 0)*weight};
    },{points:0,damage:0});
  }
  function localStep(ours,profiles,current,direction) {
    let best=null,evaluations=0;
    for (const stat of ['hp','def','spd']) {
      if (direction<0 ? current[stat]<=ours.investment[stat] : current[stat]>=32) continue;
      const investment={...current,[stat]:current[stat]+direction},score=measure(profiles,investment);
      evaluations++;
      if (!best || score.points<best.points || (score.points===best.points && score.damage<best.damage)) best={investment,...score};
    }
    return best ? {...best,evaluations} : null;
  }
  window.Defense={groups,freePoints,profile,bestSpread,measure,localStep};
})();
