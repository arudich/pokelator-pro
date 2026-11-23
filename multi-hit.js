/* Exact hit-count probabilities and independent damage rolls for one full attack.
   Rules: pokemon-showdown/data/{moves,items,abilities}.ts and
   https://github.com/smogon/pokemon-showdown/blob/master/sim/battle-actions.ts */
(() => {
  const stage=n=>n>=0 ? (3+n)/3 : 3/(3-n);
  function accuracy(a,b,meta,field={}) {
    if(a.ability==='No Guard' || b.ability==='No Guard' || meta.accuracy===true) return 1;
    let value=(meta.accuracy ?? 100)/100;
    value*=stage(a.boosts?.accuracy || 0)/stage(b.boosts?.evasion || 0);
    if(a.ability==='Compound Eyes') value*=1.3;
    if(a.ability==='Victory Star') value*=1.1;
    if(a.ability==='Hustle' && meta.category==='Physical') value*=0.8;
    if(a.item==='Wide Lens') value*=1.1;
    if(a.item==='Zoom Lens' && field.attackerMovesLast) value*=1.2;
    if(['Bright Powder','Lax Incense'].includes(b.item)) value*=0.9;
    if((b.ability==='Sand Veil' && field.weather==='Sand') ||
      (b.ability==='Snow Cloak' && ['Snow','Hail'].includes(field.weather))) value*=0.8;
    return Math.min(1,Math.max(0,value));
  }
  function plan(meta,a,b,field={}) {
    const hit=field.assumeHits ? 1 : accuracy(a,b,meta,field),counts=new Map();
    const add=(n,p)=>{if(p>0) counts.set(n,(counts.get(n) || 0)+p);};
    const bounds=meta.multihit,maximum=Array.isArray(bounds) ? bounds[1] : bounds;
    if(meta.multiaccuracy && a.ability!=='Skill Link' && a.item!=='Loaded Dice') {
      for(let n=0;n<maximum;n++) add(n,hit**n*(1-hit));
      add(maximum,hit**maximum);
    } else {
      add(0,1-hit);
      if(maximum===10 && a.item==='Loaded Dice') {
        for(let n=4;n<=10;n++) add(n,hit/7);
      } else if(a.ability==='Skill Link') add(maximum,hit);
      else if(Array.isArray(bounds)) {
        if(bounds[0]===2 && bounds[1]===5) {
          const weights=a.item==='Loaded Dice' ? [[4,0.5],[5,0.5]] : [[2,0.35],[3,0.35],[4,0.15],[5,0.15]];
          for(const [n,p] of weights) add(n,hit*p);
        } else for(let n=bounds[0];n<=maximum;n++) add(n,hit/(maximum-bounds[0]+1));
      } else add(maximum,hit);
    }
    return {counts:[...counts],maximum,accuracy:hit,expected:[...counts].reduce((sum,[n,p])=>sum+n*p,0)};
  }
  const rollsDistribution=rolls=>{
    if(typeof rolls==='number') return new Map([[rolls,1]]);
    const result=new Map();
    for(const value of rolls) result.set(value,(result.get(value) || 0)+1/rolls.length);
    return result;
  };
  function range(species,a,target,b,name,field,rawRange) {
    const meta={...Battle.moveMeta(name),...window.BALANCE_MOVES?.moves[calc.toID(name)]};
    a={...a,item:species.isMega || species.megaStoneName ? Battle.requiredMegaItem(species) : a.item || ''};
    if(a.item==='Zoom Lens' && field.attackerMovesLast===undefined)
      field={...field,attackerMovesLast:Battle.speed(species,a,field)<Battle.speed(target,b,field)};
    const model=plan(meta,a,b,field);
    const raw=rawRange(model.maximum);
    if(raw.error) return raw;
    const defender={...b,ability:raw.defenderAbility,item:raw.defenderItem};
    let hitModel=plan(meta,a,defender,field);
    let hitRolls=Array.isArray(raw.rolls?.[0]) ? raw.rolls : Array.from({length:model.maximum},()=>raw.rolls);
    const disguise=raw.defenderAbility==='Disguise';
    const iceFace=raw.defenderAbility==='Ice Face' && meta.category==='Physical';
    if(disguise || iceFace) {
      const normal=rawRange(model.maximum,{...b,ability:'No Ability'});
      if(normal.error) return normal;
      hitRolls=Array.isArray(normal.rolls?.[0]) ? normal.rolls : Array.from({length:model.maximum},()=>normal.rolls);
      if(normal.maxDamage>0) hitRolls[0]=disguise ? Math.floor(raw.hp/8) : 0;
    }
    if(hitRolls.every(rolls=>[...rollsDistribution(rolls).keys()].every(damage=>damage===0))) {
      return {...raw,minDamage:0,maxDamage:0,low:0,high:0,rolls:{weighted:[[0,1]]},multiHit:true,
        hitModel:{...hitModel,counts:[[0,1]],expected:0},accuracyMode:'multi-hit',expectedDamage:0};
    }
    // Contact retaliation can stop an attack when its user faints mid-sequence.
    let contactDamage=0;
    const contact=meta.flags?.contact && a.ability!=='Long Reach' && a.ability!=='Magic Guard'
      && a.item!=='Protective Pads' && !(a.item==='Punching Glove' && meta.flags?.punch);
    const attackerHP=species.stats.hp===1 ? 1 : species.stats.hp+(a.investment?.hp || 0);
    if(contact) {
      if(raw.defenderItem==='Rocky Helmet') contactDamage+=Math.max(1,Math.floor(attackerHP/6));
      if(['Rough Skin','Iron Barbs'].includes(raw.defenderAbility)) contactDamage+=Math.max(1,Math.floor(attackerHP/8));
    }
    const limit=contactDamage ? Math.min(model.maximum,Math.ceil((a.curHP ?? attackerHP)/contactDamage)) : model.maximum;
    if(limit<model.maximum) {
      const counts=new Map();
      for(const [n,p] of hitModel.counts) counts.set(Math.min(n,limit),(counts.get(Math.min(n,limit)) || 0)+p);
      hitModel={...hitModel,counts:[...counts],expected:[...counts].reduce((sum,[n,p])=>sum+n*p,0),contactLimited:true};
    }
    const prefixes=[new Map([[0,1]])];
    const sash=raw.defenderAbility==='Sturdy' || (raw.defenderItem==='Focus Sash' && !field.ignoreFocusSash);
    const band=raw.defenderItem==='Focus Band';
    for(let n=1;n<=limit;n++) {
      const next=new Map(),add=(d,p)=>next.set(d,(next.get(d) || 0)+p);
      for(const [total,p] of prefixes[n-1]) for(const [damage,q] of rollsDistribution(hitRolls[n-1] ?? hitRolls.at(-1))) {
        let combined=total+damage;
        if(sash && total===0 && combined>=raw.hp) combined=raw.hp-1;
        if(band && total<raw.hp && combined>=raw.hp) {
          add(raw.hp-1,p*q*0.1);add(raw.hp,p*q*0.9);
        } else add(sash || band ? Math.min(raw.hp,combined) : combined,p*q);
      }
      prefixes.push(next);
    }
    const distribution=new Map();
    for(const [n,weight] of hitModel.counts) for(const [damage,p] of prefixes[Math.min(n,limit)])
      distribution.set(damage,(distribution.get(damage) || 0)+weight*p);
    const values=[...distribution.keys()],minDamage=Math.min(...values),maxDamage=Math.max(...values);
    return {...raw,minDamage,maxDamage,low:minDamage/raw.hp*100,high:maxDamage/raw.hp*100,
      rolls:{weighted:[...distribution]},multiHit:true,hitModel,accuracyMode:'multi-hit',
      expectedDamage:[...distribution].reduce((sum,[d,p])=>sum+d*p,0)};
  }
  window.MultiHit={plan,accuracy,range};
})();
