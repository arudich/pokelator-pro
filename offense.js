/* Team Builder damage summaries. Scores are internal ranking aids, not displayed estimates. */
(() => {
  'use strict';
  const groups = [
    {kind:'guaranteed-ohko',label:'Nearly Guaranteed OHKO'},
    {kind:'probable-ohko',label:'Probable OHKO'},
    {kind:'might-ohko',label:'Might OHKO'},
    {kind:'probable-2hko',label:'Probable 2HKO'},
    {kind:'probable-3hko',label:'Probable 3HKO'},
    {kind:'rest',label:'Uh Oh'}
  ];
  const contextual = new Set(['Counter','Mirror Coat','Metal Burst','Comeuppance','Guillotine','Fissure','Horn Drill','Sheer Cold','Bide']);
  const excludedSuggestions = new Set(['Focus Punch','Giga Impact','Hyper Beam','Blast Burn','Frenzy Plant','Hydro Cannon','Rock Wrecker',
    'Roar of Time','Prismatic Laser','Eternabeam','Phantom Force','Shadow Force','Fly','Dig','Dive','Bounce',
    'Solar Beam','Solar Blade','Meteor Beam','Electro Shot','Sky Attack','Skull Bash','Razor Wind','Freeze Shock','Ice Burn']);
  const points = result => ({'guaranteed-ohko':5,'probable-ohko':4,'might-ohko':2.5,'probable-2hko':2.5,'probable-3hko':0.5,rest:0})[result?.kind] || 0;
  const canEvaluateMove = name => {
    const meta = Battle.moveMeta(name);
    return meta && meta.category !== 'Status' && !contextual.has(meta.name);
  };
  const dropsOffense = meta => (meta.selfBoosts?.[meta.offensiveStat] || 0)<0;
  const compareResults=(a,b)=>Number(Boolean(b.guaranteed))-Number(Boolean(a.guaranteed))
    || points(b)-points(a) || (b.ohkoProbability ?? -1)-(a.ohkoProbability ?? -1) || b.score-a.score;
  function best(results) {
    const valid = results.filter(result => result && !result.error);
    valid.sort(compareResults);
    return valid[0] || results.find(result => result?.error && !result.error.startsWith('No calculable'))
      || results[0] || {kind:'rest',error:'No calculable damaging move in this set.',coverage:0,count:0};
  }
  async function bestSwap(moves,pool,targets,{pause = () => Promise.resolve(),active = () => true,progress = () => {},rankMove} = {}) {
    const current = targets.map(target => moves.map(name => target.evaluate(name)));
    const baseline = current.reduce((sum,results,index) => sum+points(best([...results,targets[index].baseline]))*(targets[index].weight ?? 1),0);
    const slots = moves.map((_,index) => index);
    if (moves.length < 4) slots.push(moves.length);
    const remaining = slots.map(slot => current.map((results,targetIndex) => best([
      ...results.filter((_,index) => index !== slot),targets[targetIndex].baseline])));
    const known = new Set(moves.map(calc.toID));
    const available = [...new Set(pool)].filter(name => !known.has(calc.toID(name)) && canEvaluateMove(name)
      && !excludedSuggestions.has(Battle.moveMeta(name).name));
    const strongest = new Map();
    for (const name of available) {
      const meta=Battle.moveMeta(name),rank=rankMove ? rankMove(name) : {type:meta.type,power:meta.power || 0};
      const key=`${rank.type}:${dropsOffense(meta) ? 'drops' : 'steady'}`;
      if (!strongest.has(key) || rank.power>strongest.get(key).power) strongest.set(key,{name,power:rank.power});
    }
    const candidates=[...strongest.values()].map(row=>row.name);
    let winner = null;
    for (const [index,name] of candidates.entries()) {
      if (!active()) return null;
      const added = targets.map(target => target.evaluate(name));
      for (const [slotIndex,slot] of slots.entries()) {
        const total = added.reduce((sum,result,targetIndex) => sum+points(best([remaining[slotIndex][targetIndex],result]))*(targets[targetIndex].weight ?? 1),0);
        if (total > baseline && (!winner || total > winner.total)) {
          winner = {to:name,from:moves[slot] || 'empty slot',slot,gain:total-baseline,total};
        }
      }
      progress(index+1,candidates.length);
      await pause();
    }
    return winner;
  }
  function meanDamage(rolls) {
    if (typeof rolls === 'number') return Number.isFinite(rolls) && rolls >= 0 ? rolls : null;
    if (!Array.isArray(rolls) || !rolls.length) return null;
    const means = rolls.map(meanDamage);
    if (means.some(value => value === null)) return null;
    const total = means.reduce((sum,value) => sum+value,0);
    return Array.isArray(rolls[0]) ? total : total/means.length;
  }
  function category(score,guaranteed = false) {
    if (guaranteed) return 'guaranteed-ohko';
    if (score + 1e-12 >= 1) return 'probable-ohko';
    if (score + 1e-12 >= 0.5) return 'probable-2hko';
    if (score + 1e-12 >= 1/3) return 'probable-3hko';
    return 'rest';
  }
  const tierHits=kind=>({'guaranteed-ohko':1,'probable-ohko':1,'might-ohko':1,'probable-2hko':2,'probable-3hko':3,rest:Infinity})[kind];
  function koModel(samples,multiplier) {
    return {multiplier,samples:samples.filter(sample=>sample.percent>0).map(sample=>({weight:sample.percent,hp:sample.range.hp,
      turns:sample.range.defenderAbility==='Disguise' ? [0,sample.range.rolls]
        : [sample.range.rolls,(sample.followupRange || sample.range).rolls]}))};
  }
  function convolve(left,right,cap=Infinity) {
    const result=new Map();
    for(const [a,p] of left) for(const [b,q] of right) {
      const damage=Math.min(cap,a+b);result.set(damage,(result.get(damage) || 0)+p*q);
    }
    return result;
  }
  function damageDistribution(rolls) {
    if(typeof rolls==='number') return new Map([[rolls,1]]);
    if(!Array.isArray(rolls) || !rolls.length) return new Map();
    if(Array.isArray(rolls[0])) return rolls.reduce((sum,hit)=>convolve(sum,damageDistribution(hit)),new Map([[0,1]]));
    const result=new Map();
    for(const value of rolls) result.set(value,(result.get(value) || 0)+1/rolls.length);
    return result;
  }
  const firstHitDistributions=new WeakMap();
  function firstHitProbability(samples,multiplier=1) {
    const weighted=samples.filter(sample=>Number.isFinite(sample.percent) && sample.percent>0);
    const total=weighted.reduce((sum,sample)=>sum+sample.percent,0);
    if(!total) return null;
    let chance=0;
    for(const {range,percent} of weighted) {
      if(range.error || !(range.hp>0)) return null;
      if(range.defenderAbility==='Disguise' || Math.floor(range.maxDamage*multiplier)<range.hp) continue;
      if(Math.floor(range.minDamage*multiplier)>=range.hp) {chance+=percent;continue;}
      const rolls=range.rolls;
      let distribution=Array.isArray(rolls) ? firstHitDistributions.get(rolls) : null;
      if(!distribution) {
        distribution=damageDistribution(rolls);
        if(Array.isArray(rolls)) firstHitDistributions.set(rolls,distribution);
      }
      for(const [damage,p] of distribution) if(Math.floor(damage*multiplier)>=range.hp) chance+=percent*p;
    }
    return Math.max(0,Math.min(1,chance/total));
  }
  function tierProbability(result) {
    if(Number.isFinite(result.koProbability)) return result.koProbability;
    const model=result.koModel,hits=tierHits(result.kind);
    if(!result.error && result.assumeTwoHit && hits>=2) return 1;
    if(!result.error && hits===1 && Number.isFinite(result.ohkoProbability)) return result.ohkoProbability;
    if(result.error || !model || !model.samples.length || hits===undefined) return null;
    model.probabilities ||= {};
    if(model.probabilities[result.kind]!==undefined) return model.probabilities[result.kind];
    const coverage=model.samples.reduce((sum,sample)=>sum+sample.weight,0);
    let weighted=0;
    for(const sample of model.samples) {
      const {hp,turns}=sample;
      if(!(hp>0) || !turns.length) return null;
      const distributions=turns.map(rolls=>{
        const scaled=new Map();
        for(const [damage,p] of damageDistribution(rolls)) {
          const value=Math.min(hp,Math.max(0,Math.floor(damage*model.multiplier)));
          scaled.set(value,(scaled.get(value) || 0)+p);
        }
        return scaled;
      });
      // The final range repeats. With any positive steady damage, eventual KO
      // has probability one in this model (no recovery, misses or PP limit).
      if(hits===Infinity && [...distributions.at(-1).keys()].some(damage=>damage>0)) {
        weighted+=sample.weight;continue;
      }
      let cumulative=new Map([[0,1]]);
      for(let turn=0;turn<(hits===Infinity ? distributions.length : hits);turn++) {
        cumulative=convolve(cumulative,distributions[Math.min(turn,distributions.length-1)],hp);
      }
      weighted+=sample.weight*(cumulative.get(hp) || 0);
    }
    return model.probabilities[result.kind]=Math.max(0,Math.min(1,weighted/coverage));
  }
  function summarize(samples,multiplier = 1,withProbability = false) {
    const weighted = samples.filter(sample => Number.isFinite(sample.percent) && sample.percent > 0);
    const coverage = weighted.reduce((sum,sample) => sum+sample.percent,0);
    if (!coverage) return {error:'No reported spread frequencies available.',coverage:0};
    const invalid = samples.find(sample => sample.range.error || !sample.range.hp || meanDamage(sample.range.rolls) === null
      || (sample.followupRange && (sample.followupRange.error || meanDamage(sample.followupRange.rolls) === null)));
    if (invalid) return {error:invalid.range.error || invalid.followupRange?.error || 'Damage unavailable for a reported spread.',coverage};
    let score = weighted.reduce((sum,sample) => sum + sample.percent * meanDamage(sample.range.rolls) / sample.range.hp,0) / coverage * multiplier;
    if (score < 1 && weighted.some(sample => sample.followupRange)) {
      const followup = weighted.reduce((sum,sample) => sum + sample.percent * meanDamage((sample.followupRange || sample.range).rolls) / sample.range.hp,0) / coverage * multiplier;
      // First attack uses full-HP damage; remaining HP takes normal follow-up damage.
      score = followup / (1 + followup - score);
    }
    const guaranteed = samples.every(sample => sample.range.minDamage * multiplier >= sample.range.hp);
    return {score,guaranteed,kind:category(score,guaranteed),coverage,count:samples.length,
      ...(withProbability ? {koModel:koModel(weighted,multiplier)} : {})};
  }
  function repeatedScore(fractions) {
    let total=0;
    for (let turn=0;turn<fractions.length;turn++) {
      const damage=fractions[turn];
      if (total+damage>=1) return 1/(turn+(1-total)/damage);
      total+=damage;
    }
    const steady=fractions[fractions.length-1];
    return steady>0 ? 1/(fractions.length+(1-total)/steady) : 0;
  }
  function repeatedUse(attackerSpecies,ours,defenderSpecies,samples,meta,options) {
    const weights=samples.filter(sample=>Number.isFinite(sample.percent) && sample.percent>0),coverage=weights.reduce((sum,sample)=>sum+sample.percent,0);
    const fractions=[],boosts={...Battle.withStages(ours,options.attackerStages).boosts},turns=weights.map(()=>[]);
    let item=ours.item || '',herb=item==='White Herb' && !attackerSpecies.isMega;
    for (let turn=0;turn<9;turn++) {
      let fraction=0;
      for (const [index,sample] of weights.entries()) {
        const ability=sample.range.defenderAbility;
        const bypassFirstHit=turn>0 && ['Multiscale','Shadow Shield','Disguise'].includes(ability);
        const range=turn===0 ? sample.range : Battle.range(attackerSpecies,{...ours,item,boosts},defenderSpecies,
          {...sample.defender,...(bypassFirstHit ? {ability:'No Ability'} : {})},meta.name,{...options,attackerStages:undefined});
        const damage=turn===0 && ability==='Disguise' ? 0 : meanDamage(range.rolls);
        if (range.error || damage===null) return {error:range.error || 'Repeated-use damage unavailable.'};
        if(options.keepProbability!==false) turns[index].push(turn===0 && ability==='Disguise' ? 0 : range.rolls);
        fraction+=sample.percent/coverage*damage/range.hp*(options.multiplier ?? 1);
      }
      fractions.push(fraction);
      const before=JSON.stringify(boosts);
      for (const [stat,change] of Object.entries(meta.selfBoosts)) {
        const delta=change*(ours.ability==='Contrary' ? -1 : ours.ability==='Simple' ? 2 : 1);
        boosts[stat]=Math.max(-6,Math.min(6,(boosts[stat] || 0)+delta));
      }
      if (herb && Object.values(boosts).some(value=>value<0)) {
        for (const stat of Object.keys(boosts)) if (boosts[stat]<0) boosts[stat]=0;
        herb=false;item='';
      }
      if (turn>0 && before===JSON.stringify(boosts)) break;
    }
    return {score:repeatedScore(fractions),...(options.keepProbability!==false ? {koModel:{multiplier:options.multiplier ?? 1,
      samples:weights.map((sample,index)=>({weight:sample.percent,hp:sample.range.hp,turns:turns[index]}))}} : {})};
  }
  function analyze(attackerSpecies,ours,defenderSpecies,spreads,options = {}) {
    ({species:attackerSpecies,entry:ours}=Battle.resolveCombatant(attackerSpecies,ours));
    const candidates = [];
    const unavailable = [];
    for (const name of ours.moveSet || []) {
      const meta = Battle.moveMeta(name);
      if (!meta || meta.category === 'Status') continue;
      if (contextual.has(meta.name)) { unavailable.push('Selected moves require turn context.'); continue; }
      const boosted = options.boostDefenseNature?.(meta.defensiveStat) || false;
      const samples = spreads.map(spread => {
        const defender = {investment:spread.investment,ability:options.defenderAbility || '',item:options.defenderItem || '',
          nature:boosted ? {plus:meta.defensiveStat,minus:'atk'} : null};
        const range = Battle.range(attackerSpecies,ours,defenderSpecies,defender,meta.name,options);
        const followupRange = ['Multiscale','Shadow Shield'].includes(range.defenderAbility) && !range.error
          ? Battle.range(attackerSpecies,ours,defenderSpecies,{...defender,ability:'No Ability'},meta.name,options) : null;
        // The pinned engine's raw damage rolls do not simulate these survival states.
        const survival = range.defenderAbility === 'Sturdy'
          || (range.defenderAbility === 'Ice Face' && meta.category === 'Physical')
          || ['Focus Sash','Focus Band'].includes(range.defenderItem);
        return {...spread,defender,followupRange,range:survival ? {...range,error:`${range.defenderAbility || range.defenderItem} requires survival/turn context.`} : range};
      });
      const result = summarize(samples,options.multiplier ?? 1,options.keepProbability!==false);
      if (result.error) { unavailable.push(result.error); continue; }
      if (samples.some(sample => sample.followupRange)) result.firstHitAbility = samples.find(sample=>sample.followupRange).range.defenderAbility;
      const disguise=samples.some(sample => sample.range.defenderAbility === 'Disguise');
      const ohkoProbability=firstHitProbability(samples,options.multiplier ?? 1);
      if (dropsOffense(meta) && !(ohkoProbability>0) && (result.score<1 || disguise)) {
        const repeated=repeatedUse(attackerSpecies,ours,defenderSpecies,samples,meta,options);
        if (repeated.error) {unavailable.push(repeated.error);continue;}
        result.score=repeated.score;result.guaranteed=result.guaranteed && !disguise;
        result.kind=category(result.score,result.guaranteed);result.repeatedUse=true;
        if(repeated.koModel) result.koModel=repeated.koModel;
        if (disguise) result.extraTurns=1;
      }
      if (disguise && !result.repeatedUse) {
        // Add one turn to the KO estimate after averaging reported builds.
        result.score = result.score / (1 + result.score);
        result.guaranteed = false;
        result.kind = category(result.score);
        result.extraTurns = 1;
      }
      result.ohkoProbability=ohkoProbability;
      if(ohkoProbability>0) {
        if(!result.guaranteed) {
          result.kind=ohkoProbability>=0.5 ? 'probable-ohko' : 'might-ohko';
          result.score=1/(2-ohkoProbability);
        }
        result.assumeTwoHit=true;
      }
      candidates.push({...result,move:meta.name,meta});
    }
    candidates.sort(compareResults);
    return candidates[0] || {kind:'rest',error:unavailable[0] || 'No calculable damaging move in this set.',
      coverage:spreads.reduce((sum,spread) => sum+(Number.isFinite(spread.percent) && spread.percent>0 ? spread.percent : 0),0),count:spreads.length};
  }
  window.Offense = {groups,meanDamage,category,summarize,analyze,points,best,canEvaluateMove,bestSwap,repeatedScore,tierHits,tierProbability,firstHitProbability};
})();
