/* Seeded, usage-sampled direct-attack duels. This is not a full battle AI. */
(() => {
  'use strict';
  const groups=[{kind:'win',label:'We Win'},{kind:'favored',label:'Close But Favored'},
    {kind:'unfavored',label:'Close But Unfavored'},{kind:'lose',label:'We Lose'},
    {kind:'unmodeled',label:'Not enough modeled data'}];
  const category=(wins,losses,total)=>!wins && !losses ? 'unmodeled'
    : wins/total>=0.85 ? 'win' : wins/total<=0.15 ? 'lose' : wins/total>0.5 ? 'favored' : 'unfavored';
  const effects=new Map(),metadata=new Map();
  const effect=name=>{if(!effects.has(name)) effects.set(name,window.BALANCE_MOVES?.moves[calc.toID(name)] || {});return effects.get(name);};
  const moveMeta=name=>{if(!metadata.has(name)) metadata.set(name,Battle.moveMeta(name));return metadata.get(name);};
  function random(seed) {let state=2166136261;for(const c of seed) state=Math.imul(state^c.charCodeAt(0),16777619);return ()=>{state|=0;state=state+0x6D2B79F5|0;let x=Math.imul(state^state>>>15,1|state);x^=x+Math.imul(x^x>>>7,61|x);return ((x^x>>>14)>>>0)/4294967296;};}
  function draw(rows,rng,fallback=null,normalize=false) {
    const valid=rows.filter(row=>Number.isFinite(row.percent) && row.percent>0);
    const sum=valid.reduce((n,row)=>n+row.percent,0),pick=rng()*(normalize ? sum : Math.max(100,sum));
    let cumulative=0;for(const row of valid) {cumulative+=row.percent;if(pick<cumulative) return row;}
    return fallback;
  }
  function movesetModel(moves) {
    const unique=new Map();
    for(const move of moves) if(move.name && Number.isFinite(move.percent) && move.percent>0) {
      const id=calc.toID(move.name);
      if(!unique.has(id) || unique.get(id).percent<move.percent) unique.set(id,move);
    }
    const ranked=[...unique.values()].sort((a,b)=>b.percent-a.percent || (a.rank || 0)-(b.rank || 0));
    const core=ranked.slice(0,2),coverage=ranked.slice(2),warnings=[];
    if(core.length<2) warnings.push('Fewer than two reported moves; a fixed pair is unavailable.');
    else if(core[1].percent<=50) warnings.push(`Weak fixed pair: ${core[1].name} appears on only ${core[1].percent}% of sets.`);
    else if(core[1].percent<75) warnings.push(`Variable fixed pair: ${core[1].name} appears on ${core[1].percent}% of sets.`);
    const attack=move=>{const meta=moveMeta(move.name);return meta && meta.category!=='Status' && !immuneItems.has(move.name)
      && !['Fake Out','First Impression','Last Resort','Hyper Beam','Giga Impact','Blast Burn','Hydro Cannon','Frenzy Plant','Rock Wrecker','Phantom Force','Fly','Dig','Dive','Bounce','Solar Beam','Solar Blade','Meteor Beam','Electro Shot','Sky Attack'].includes(move.name);};
    if(core.length && !core.some(attack)) warnings.push('Neither fixed move is a repeatable supported attack; results depend on sampled coverage and omit status strategies.');
    if(coverage.length<2) warnings.push('Fewer than two reported coverage options; the four-move set is incomplete.');
    const overlapLower=Math.max(0,core.reduce((sum,move)=>sum+move.percent,0)-100);
    return {core,coverage,warnings,overlapLower};
  }
  // Conditional coverage weights: exactly two distinct reported choices, rather
  // than treating marginal move percentages as independent inclusion chances.
  function sampleModel(model,rng) {
    const pool=[...model.coverage],selected=model.core.map(move=>move.name);
    for(let slot=0;slot<2 && pool.length;slot++) {
      let pick=rng()*pool.reduce((sum,move)=>sum+move.percent,0),index=pool.length-1;
      for(let i=0;i<pool.length;i++) {pick-=pool[i].percent;if(pick<0) {index=i;break;}}
      selected.push(pool.splice(index,1)[0].name);
    }
    return selected;
  }
  const sampleMoves=(moves,rng)=>sampleModel(movesetModel(moves),rng);
  const stage=n=>n>=0 ? (2+n)/2 : 2/(2-n);
  const maxHP=side=>side.species.stats.hp===1 ? 1 : side.species.stats.hp+(side.entry.investment.hp || 0);
  const grounded=side=>!side.species.types.includes('Flying') && side.entry.ability!=='Levitate' && side.entry.item!=='Air Balloon';
  function speed(side,field) {
    let value=Math.floor(Battle.effectiveStat(side.species,side.entry,'spe')*stage(side.entry.boosts.spe || 0));
    const a=side.entry.ability,item=side.entry.item;
    if((field.weather==='Rain' && a==='Swift Swim') || (field.weather==='Sun' && a==='Chlorophyll')
      || (field.weather==='Sand' && a==='Sand Rush') || (field.weather==='Snow' && a==='Slush Rush')
      || (field.terrain==='Electric' && a==='Surge Surfer') || (side.consumed && a==='Unburden')) value*=2;
    if(a==='Quick Feet' && side.entry.status) value=Math.floor(value*1.5);
    if(item==='Choice Scarf') value=Math.floor(value*1.5);
    if(['Iron Ball','Macho Brace'].includes(item)) value=Math.floor(value/2);
    if(side.entry.status==='par' && a!=='Quick Feet') value=Math.floor(value/2);
    return value;
  }
  const hpMoves=new Set(['Eruption','Water Spout','Dragon Energy','Flail','Reversal','Crush Grip','Wring Out','Hard Press','Endeavor','Super Fang',"Nature's Madness",'Ruination','Final Gambit']);
  const immuneItems=new Set(['Counter','Mirror Coat','Metal Burst','Comeuppance','Guillotine','Fissure','Horn Drill','Sheer Cold','Bide','Focus Punch']);
  function context(field,{limit=Infinity,reuseOffense=false} = {}) {
    const cache=new Map();
    return (a,b,name,hits=1)=>{
      const hp=hpMoves.has(name),meta=moveMeta(name);
      const state=(s,attacker)=>{
        // Ordinary damage never reads the attacker's unused defensive stats.
        // Keep the move's overridden offensive stat (e.g. Body Press's Defense).
        const project=reuseOffense && attacker && !['Shell Side Arm','Photon Geyser','Tera Blast'].includes(name);
        const mask=project ? meta?.offensiveStat || 'atk' : 'all';
        s.rangeKeys ||= {};
        if(!s.rangeKeys[mask]) {
          const investment={...s.entry.investment};
          if(project) for(const stat of ['def','spd']) if(stat!==mask) delete investment[stat];
          s.rangeKeys[mask]=JSON.stringify([s.species.id,investment,s.entry.nature]);
        }
        return [s.rangeKeys[mask],s.entry.ability,s.entry.item,s.entry.boosts,s.entry.status,s.fainted,
          hp ? s.hp : [s.hp===s.maxHP,s.hp<=s.maxHP/3,s.hp<=s.maxHP/2]];
      };
      const key=JSON.stringify([state(a,true),state(b,false),name,hits]);
      if(!cache.has(key)) {
        const result=Battle.range(a.species,{...a.entry,curHP:a.hp},b.species,{...b.entry,curHP:b.hp},name,
          {...field,format:'Singles',hits,attackerAlliesFainted:a.fainted});
        if(cache.size>=limit) cache.delete(cache.keys().next().value);
        cache.set(key,result);
      }
      return cache.get(key);
    };
  }
  function side(species,entry,moves,fainted=0) {
    const s={species,entry:{...entry,investment:{...entry.investment},boosts:{...entry.boosts},item:(species.isMega || species.megaStoneName) ? Battle.requiredMegaItem(species) : entry.item || ''},
      moves,fainted,lock:'',used:new Set(),actions:0,consumed:false};
    s.maxHP=maxHP(s);s.hp=s.maxHP;return s;
  }
  function priority(s,move,field) {
    let value=effect(move).priority || 0;
    if(move==='Grassy Glide' && field.terrain==='Grassy' && grounded(s)) value=1;
    if(s.entry.ability==='Gale Wings' && s.hp===s.maxHP && moveMeta(move)?.type==='Flying') value++;
    if(s.entry.ability==='Triage' && effect(move).drain) value+=3;
    return value;
  }
  function usable(s,name,turn) {
    const meta=moveMeta(name);
    return meta && meta.category!=='Status' && !immuneItems.has(name) && (!s.lock || s.lock===name || !['Choice Band','Choice Specs','Choice Scarf'].includes(s.entry.item))
      && !(name==='Fake Out' && turn>0) && !(name==='First Impression' && s.actions>0)
      && !(name==='Last Resort' && s.moves.some(m=>m!==name && !s.used.has(m)))
      && !['Hyper Beam','Giga Impact','Blast Burn','Hydro Cannon','Frenzy Plant','Rock Wrecker','Phantom Force','Fly','Dig','Dive','Bounce','Solar Beam','Solar Blade','Meteor Beam','Electro Shot','Sky Attack'].includes(name);
  }
  function choose(a,b,turn,field,range) {
    let best=null,fakeOut=null;
    for(const name of a.moves) {
      if(!usable(a,name,turn)) continue;
      const result=range(a,b,name),mean=Offense.meanDamage(result.rolls)*(a.multiplier || 1);
      if(result.error || !mean) continue;
      const accuracy=effect(name).accuracy===true ? 1 : (effect(name).accuracy || 100)/100;
      const drop=moveMeta(name).selfBoosts?.[moveMeta(name).offensiveStat] || 0;
      const first=mean*accuracy,repeat=drop<0 && a.entry.ability!=='Contrary' ? first*stage(Math.max(-6,drop*(a.entry.ability==='Simple' ? 2 : 1))) : first;
      const turns=first>=b.hp ? b.hp/first : 1+(b.hp-first)/Math.max(1,repeat);
      const p=priority(a,name,field),attacks=Math.ceil(turns-1e-9),action={name,turns,attacks,priority:p};
      if(name==='Fake Out' && turn===0) fakeOut=action;
      if(!best || attacks<best.attacks || (attacks===best.attacks && (p>best.priority || (p===best.priority && turns<best.turns)))) best=action;
    }
    if(fakeOut && best?.attacks>1 && !['Inner Focus','Shield Dust'].includes(b.entry.ability) && b.entry.item!=='Covert Cloak') return fakeOut;
    return best;
  }
  function consume(s) {s.entry.item='';s.consumed=true;}
  function heal(s,amount) {if(s.hp>0) s.hp=Math.min(s.maxHP,s.hp+Math.max(0,Math.floor(amount)));}
  function berry(s,opponent) {
    if(opponent.entry.ability==='Unnerve' || !s.hp) return;
    if(s.entry.item==='Sitrus Berry' && s.hp<=s.maxHP/2) {heal(s,s.maxHP/4);consume(s);}
    else if(['Figy Berry','Wiki Berry','Mago Berry','Aguav Berry','Iapapa Berry'].includes(s.entry.item) && s.hp<=s.maxHP*(s.entry.ability==='Gluttony' ? 0.5 : 0.25)) {heal(s,s.maxHP/3);consume(s);}
    else if(s.entry.item==='Lum Berry' && s.entry.status) {s.entry.status='';s.sleep=0;consume(s);}
  }
  function change(s,boosts) {
    for(const [stat,delta] of Object.entries(boosts || {})) s.entry.boosts[stat]=Math.max(-6,Math.min(6,(s.entry.boosts[stat] || 0)+delta*(s.entry.ability==='Contrary' ? -1 : s.entry.ability==='Simple' ? 2 : 1)));
    if(s.entry.item==='White Herb' && Object.values(s.entry.boosts).some(n=>n<0)) {for(const stat of Object.keys(s.entry.boosts)) if(s.entry.boosts[stat]<0) s.entry.boosts[stat]=0;consume(s);}
  }
  const resistBerries={Occa:'Fire',Passho:'Water',Wacan:'Electric',Rindo:'Grass',Yache:'Ice',Chople:'Fighting',Kebia:'Poison',Shuca:'Ground',Coba:'Flying',Payapa:'Psychic',Tanga:'Bug',Charti:'Rock',Kasib:'Ghost',Haban:'Dragon',Colbur:'Dark',Babiri:'Steel',Roseli:'Fairy',Chilan:'Normal'};
  function contact(a,b,meta) {
    if(!meta.flags?.contact || a.entry.ability==='Long Reach' || a.entry.item==='Protective Pads' || a.entry.ability==='Magic Guard') return;
    if(b.entry.item==='Rocky Helmet') a.hp=Math.max(0,a.hp-Math.max(1,Math.floor(a.maxHP/6)));
    if(['Rough Skin','Iron Barbs'].includes(b.entry.ability)) a.hp=Math.max(0,a.hp-Math.max(1,Math.floor(a.maxHP/8)));
  }
  function afterHit(a,b,meta,result) {
    const category=result.meta.category || moveMeta(meta.name)?.category;
    if(b.entry.item==='Air Balloon') consume(b);
    if(!b.hp) return;
    if(b.entry.ability==='Stamina') change(b,{def:1});
    if(b.entry.ability==='Weak Armor' && category==='Physical') change(b,{def:-1,spe:2});
    const chart=Battle.generation.types.get(calc.toID(result.meta.type))?.effectiveness || {};
    const effectiveness=b.species.types.reduce((value,type)=>value*(chart[type] ?? 1),1);
    if(a.entry.ability!=='Unnerve') {
      const berryType=resistBerries[b.entry.item.replace(/ Berry$/,'')];
      if(berryType===result.meta.type && (effectiveness>1 || berryType==='Normal')) consume(b);
      else if(b.entry.item==='Weakness Policy' && effectiveness>1) {change(b,{atk:2,spa:2});consume(b);}
      else if(b.entry.item==='Kee Berry' && category==='Physical') {change(b,{def:1});consume(b);}
      else if(b.entry.item==='Maranga Berry' && category==='Special') {change(b,{spd:1});consume(b);}
      else if(b.entry.item==='Enigma Berry' && effectiveness>1) {heal(b,b.maxHP/4);consume(b);}
    }
  }
  function accuracy(a,b,name,field) {
    if(a.entry.ability==='No Guard' || b.entry.ability==='No Guard') return 1;
    const meta=effect(name);if(meta.accuracy===true) return 1;
    let chance=(meta.accuracy || 100)/100;
    if(['Thunder','Hurricane'].includes(name)) chance=field.weather==='Rain' ? 1 : field.weather==='Sun' ? 0.5 : chance;
    if(name==='Blizzard' && field.weather==='Snow') chance=1;
    if(a.entry.ability==='Compound Eyes') chance*=1.3;
    if(a.entry.ability==='Hustle' && moveMeta(name).category==='Physical') chance*=0.8;
    if(a.entry.item==='Wide Lens') chance*=1.1;
    if(['Bright Powder','Lax Incense'].includes(b.entry.item)) chance*=0.9;
    return Math.min(1,chance);
  }
  function hit(a,b,action,other,turn,field,range,rng) {
    if(!action || !a.hp || !b.hp) return;
    // Showdown counts a move action before flinch, paralysis and sleep checks.
    a.actions++;
    if(a.flinched) return;
    if(a.entry.status==='par' && rng()<0.25) return;
    if(a.entry.status==='frz') {if(rng()<0.2) a.entry.status='';else return;}
    if(a.sleep>0) {a.sleep--;if(!a.sleep) a.entry.status='';return;}
    const name=action.name,meta=effect(name);a.used.add(name);
    if(['Choice Band','Choice Specs','Choice Scarf'].includes(a.entry.item)) a.lock=name;
    if(name==='Sucker Punch' && (!other || b.acted)) return;
    if(rng()>accuracy(a,b,name,field)) return;
    const multi=moveMeta(name).multihit;
    let hits=typeof multi==='number' ? multi : Array.isArray(multi) ? (a.entry.ability==='Skill Link' ? multi[1] : a.entry.item==='Loaded Dice' ? 4+(rng()<0.5 ? 1 : 0) : [2,2,2,2,2,2,2,3,3,3,3,3,3,3,4,4,4,5,5,5][Math.floor(rng()*20)]) : 1;
    const result=range(a,b,name,hits);if(result.error) return;
    const sample=rolls=>typeof rolls==='number' ? rolls : rolls[Math.floor(rng()*rolls.length)];
    const damages=Array.isArray(result.rolls?.[0]) ? result.rolls.map(sample) : Array.from({length:hits},()=>sample(result.rolls));
    let dealt=0;
    for(let damage of damages) {
      if(!b.hp || !a.hp) break;
      damage=Math.floor(damage*(a.multiplier || 1));
      if(result.defenderAbility==='Disguise' && !b.disguiseBroken && damage) {
        b.disguiseBroken=true;b.entry.ability='No Ability';b.hp=Math.max(0,b.hp-Math.floor(b.maxHP/8));contact(a,b,meta);continue;
      }
      if(damage>=b.hp && b.hp===b.maxHP && (b.entry.item==='Focus Sash' || result.defenderAbility==='Sturdy')) {
        damage=b.hp-1;if(b.entry.item==='Focus Sash') consume(b);
      } else if(damage>=b.hp && b.entry.item==='Focus Band' && rng()<0.1) damage=b.hp-1;
      dealt+=Math.min(damage,b.hp);b.hp=Math.max(0,b.hp-damage);berry(b,a);
      if(damage>0) {afterHit(a,b,meta,result);contact(a,b,meta);}
    }
    if(dealt>0) {
      if(meta.drain) {const amount=dealt*meta.drain[0]/meta.drain[1];if(b.entry.ability==='Liquid Ooze') a.hp=Math.max(0,a.hp-Math.floor(amount));else heal(a,amount);}
      if(meta.recoil && !['Rock Head','Magic Guard'].includes(a.entry.ability)) a.hp=Math.max(0,a.hp-Math.max(1,Math.floor(dealt*meta.recoil[0]/meta.recoil[1])));
      if(a.entry.item==='Life Orb' && a.entry.ability!=='Magic Guard' && !(a.entry.ability==='Sheer Force' && (meta.secondary || meta.secondaries))) a.hp=Math.max(0,a.hp-Math.max(1,Math.floor(a.maxHP/10)));
      if(name==='Knock Off' && !(b.species.isMega || b.species.megaStoneName) && b.entry.ability!=='Sticky Hold') consume(b);
      if(a.entry.ability!=='Sheer Force' && b.entry.ability!=='Shield Dust' && b.entry.item!=='Covert Cloak') {
        for(const secondary of meta.secondaries || (meta.secondary ? [meta.secondary] : [])) if(rng()<(secondary.chance || 100)/100*(a.entry.ability==='Serene Grace' ? 2 : 1)) {
          if(secondary.volatileStatus==='flinch' && b.entry.ability!=='Inner Focus') b.flinched=true;
          if(secondary.boosts) change(b,secondary.boosts);
          const status=secondary.status || (secondary.statusChoices?.length ? secondary.statusChoices[Math.floor(rng()*secondary.statusChoices.length)] : '');
          if(status && !b.entry.status && !(field.terrain==='Misty' && grounded(b)) && !(status==='slp' && field.terrain==='Electric' && grounded(b))) {
            if(!(status==='brn' && b.species.types.includes('Fire')) && !(status==='par' && b.species.types.includes('Electric')) && !(status==='frz' && b.species.types.includes('Ice')) && !(['psn','tox'].includes(status) && b.species.types.some(t=>['Steel','Poison'].includes(t)))) {b.entry.status=status;if(status==='slp') b.sleep=2;berry(b,a);}
          }
        }
      }
    }
    change(a,{...moveMeta(name).selfBoosts,...meta.self?.boosts});
    if(meta.selfdestruct) a.hp=0;
  }
  function residual(s,other,field) {
    if(!s.hp) return;
    if(s.entry.ability!=='Magic Guard') {
      if(field.weather==='Sand' && !s.species.types.some(t=>['Rock','Ground','Steel'].includes(t)) && !['Sand Rush','Sand Force','Sand Veil','Overcoat'].includes(s.entry.ability) && s.entry.item!=='Safety Goggles') s.hp=Math.max(0,s.hp-Math.max(1,Math.floor(s.maxHP/16)));
      if(s.entry.status==='brn') s.hp=Math.max(0,s.hp-Math.max(1,Math.floor(s.maxHP/16)));
      if(['psn','tox'].includes(s.entry.status)) {if(s.entry.ability==='Poison Heal') heal(s,s.maxHP/8);else s.hp=Math.max(0,s.hp-Math.max(1,Math.floor(s.maxHP*(s.entry.status==='tox' ? (s.toxic=(s.toxic || 0)+1)/16 : 1/8))));}
    }
    if(!s.hp) return;
    if(s.entry.item==='Leftovers' || (s.entry.item==='Black Sludge' && s.species.types.includes('Poison'))) heal(s,s.maxHP/16);
    if((field.weather==='Rain' && s.entry.ability==='Rain Dish') || (field.weather==='Snow' && s.entry.ability==='Ice Body')) heal(s,s.maxHP/16);
    if(field.weather==='Rain' && s.entry.ability==='Dry Skin') heal(s,s.maxHP/8);
    if(field.weather==='Sun' && ['Dry Skin','Solar Power'].includes(s.entry.ability) && s.entry.ability!=='Magic Guard') s.hp=Math.max(0,s.hp-Math.max(1,Math.floor(s.maxHP/8)));
    if(field.terrain==='Grassy' && grounded(s)) heal(s,s.maxHP/16);
    berry(s,other);
  }
  function duel(a,b,field,range,rng) {
    let firstSide=null;
    for(let turn=0;turn<20;turn++) {
      a.acted=b.acted=a.flinched=b.flinched=false;
      const am=choose(a,b,turn,field,range),bm=choose(b,a,turn,field,range);
      if(!am && !bm) return {winner:null,first:firstSide};
      const quick=s=>(s.entry.item==='Quick Claw' && rng()<0.2) || (s.entry.ability==='Quick Draw' && rng()<0.3) ? 0.1 : 0;
      const ap=(am?.priority || 0)+quick(a),bp=(bm?.priority || 0)+quick(b);
      const faster=!bm ? true : !am ? false : ap!==bp ? ap>bp : speed(a,field)!==speed(b,field) ? speed(a,field)>speed(b,field) : rng()<0.5;
      const order=faster ? [[a,b,am,bm],[b,a,bm,am]] : [[b,a,bm,am],[a,b,am,bm]];
      if(turn===0) firstSide=faster ? 'us' : 'them';
      for(const [attacker,defender,move,other] of order) {hit(attacker,defender,move,other,turn,field,range,rng);attacker.acted=true;if(!a.hp || !b.hp) break;}
      if(!a.hp || !b.hp) return {winner:a.hp ? 'us' : b.hp ? 'them' : null,first:firstSide};
      residual(a,b,field);residual(b,a,field);
      if(!a.hp || !b.hp) return {winner:a.hp ? 'us' : b.hp ? 'them' : null,first:firstSide};
    }
    return {winner:null,first:firstSide};
  }
  function prepare(oursSpecies,ours,target,{seed,cacheLimit=2048,reuseOffense=true} = {}) {
    const usage=target.usage,spreads=(usage.spreads || []).filter(s=>s.percent>0),model=movesetModel(usage.moves || []);
    const field=target.field,range=context(field,{limit:cacheLimit,reuseOffense});
    const seedKey=seed || JSON.stringify([oursSpecies.id,ours.moveSet,ours.nature,ours.item,ours.ability,target.scenarioId || target.species.id,field]);
    const rng=random(seedKey+':builds'),builds=[],results=new Map();
    const coverage=spreads.reduce((s,row)=>s+row.percent,0);
    function build() {
      const spread=draw(spreads,rng,null,true),natureRow=draw(usage.natures || [],rng),nature=natureRow && Battle.generation.natures.get(calc.toID(natureRow.name));
      const item=(target.species.isMega || target.species.megaStoneName) ? Battle.requiredMegaItem(target.species) : draw(usage.items || [],rng)?.name || '';
      const ability=draw(target.abilities || [],rng)?.name || target.ability || '';
      return {entry:{investment:spread.investment,nature,ability,item},moves:sampleModel(model,rng)};
    }
    async function analyze(investment,{samples=256,active=()=>true,pause=()=>Promise.resolve()} = {}) {
      if(!spreads.length) return {kind:'unmodeled',error:'No reported stat spreads.',coverage:0,count:0,score:0.5};
      const key=JSON.stringify(investment);
      if(!results.has(key)) results.set(key,[]);
      const outcomes=results.get(key);
      let wins=0,losses=0,draws=0,unknown=0,first=0;
      for(let trial=0;trial<samples;trial++) {
        if(!active()) return null;
        if(outcomes[trial]===undefined) {
          if(!builds[trial]) builds[trial]=build();
          const opponent=builds[trial];
          const a=side(oursSpecies,Battle.withStages({...ours,investment},field.ourStages),ours.moveSet,field.ourFainted),b=side(target.species,Battle.withStages(opponent.entry,field.opponentStages),opponent.moves,field.opponentsFainted);
          a.multiplier=field.ourMultiplier || 1;b.multiplier=field.opponentMultiplier || 1;
          if(!a.moves.some(name=>usable(a,name,0)) || !b.moves.some(name=>usable(b,name,0))) outcomes[trial]=3;
          else {
            const outcome=duel(a,b,field,range,random(seedKey+':duel:'+trial));
            outcomes[trial]=(outcome.winner==='us' ? 1 : outcome.winner==='them' ? 2 : 0)+(outcome.first==='us' ? 4 : 0);
          }
        }
        const outcome=outcomes[trial];
        if((outcome & 3)===1) wins++;else if((outcome & 3)===2) losses++;else if((outcome & 3)===3) unknown++;else draws++;
        if(outcome & 4) first++;
        if(trial%16===15) await pause();
      }
      const modeled=samples-unknown,probability=modeled ? wins/modeled : 0.5;
      const itemDetail=target.species.isMega || target.species.megaStoneName
        ? `Opponent item: ${Battle.requiredMegaItem(target.species)} (required Mega Stone; 100%).`
        : `Opponent items: ${(usage.items || []).map(row=>`${row.name} (${row.percent}%)`).join(', ') || 'unreported'}; missing item probability uses no item.`;
      const detail=`Fixed core: ${model.core.map(move=>`${move.name} (${move.percent}%)`).join(' + ') || 'unavailable'}; two coverage moves sampled by relative usage without replacement.${model.warnings.length ? ` Core-model caution: ${model.warnings.join(' ')}` : ''} Estimated wins: ${(100*probability).toFixed(1)}% of ${modeled}/${samples} modeled duels (${(100*wins/samples).toFixed(1)}% of all trials); draws/timeouts: ${draws}; unmodeled move sets: ${unknown}. We act first in ${modeled ? (100*first/modeled).toFixed(1) : '0'}% of modeled trials (Speed, priority, nature and items). Reported spread coverage: ${coverage.toFixed(1)}%. ${itemDetail} The fixed pair is an assumption, not observed co-occurrence; coverage weights are conditional and do not preserve original marginal inclusion percentages. Direct-attack duel estimate; setup, recovery/status-move strategies and switching are excluded.`;
      return {kind:modeled ? category(wins,losses,samples) : 'unmodeled',score:wins/samples,winProbability:probability,wins,losses,draws,unknown,first,samples,coverage,count:spreads.length,detail,coreModel:model};
    }
    return {analyze};
  }
  const analyze=(oursSpecies,ours,target,options={})=>prepare(oursSpecies,ours,target,options).analyze(ours.investment,options);
  const totalScore=rows=>rows.reduce((sum,row)=>sum+(row.samples ? row.wins/row.samples : 0)*(row.weight ?? 1),0);
  window.Balance={groups,category,random,sampleMoves,movesetModel,speed,duel,side,context,prepare,analyze,totalScore};
})();
