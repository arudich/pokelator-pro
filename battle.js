/* Champions adapter for the pinned Smogon engine. No DOM or application state. */
(() => {
  'use strict';
  const generation = calc.Generations.get(0);
  const megaItems = new Map([...generation.items].flatMap(item =>
    Object.values(item.megaStone || {}).map(form => [form, item.name])));
  const requiredMegaItem = species => species?.megaStoneName || (species?.isMega ? megaItems.get(species.id) || '' : '');
  const heldItem = (species, entry) => species.isMega || species.megaStoneName ? requiredMegaItem(species) : entry.item || '';
  const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const natureStats = stats.slice(1);
  const natureOptions = [...generation.natures].filter(n => n.plus !== n.minus);
  const natureName = nature => natureOptions.find(n => n.plus === nature?.plus && n.minus === nature?.minus)?.name || 'Serious';
  const natureModifier = (nature, stat) => {
    if (!nature || !nature.plus || !nature.minus || nature.plus === nature.minus) return 1;
    return nature.plus === stat ? 1.1 : nature.minus === stat ? 0.9 : 1;
  };
  // Damage, immunity, type/stat, and weather-dependent effects supported by the pinned engine.
  const damageAbilities = new Set(`Adaptability|Aerilate|Air Lock|Analytic|Armor Tail|Aura Break|Aura Guard|Battle Armor|Battle Bond|Beads of Ruin|Blaze|Bulletproof|Chlorophyll|Clear Body|Cloud Nine|Competitive|Contrary|Damp|Dark Aura|Dauntless Shield|Dazzling|Defeatist|Defiant|Disguise|Download|Dragon's Maw|Dragonize|Dry Skin|Earth Eater|Eelevate|Electromorphosis|Fairy Aura|Filter|Fire Mane|Flare Boost|Flash Fire|Flower Gift|Flower Veil|Fluffy|Forecast|Friend Guard|Full Metal Body|Fur Coat|Gale Wings|Galvanize|Gorilla Tactics|Grass Pelt|Guard Dog|Guts|Hadron Engine|Heatproof|Heavy Metal|Huge Power|Hustle|Hyper Cutter|Ice Face|Ice Scales|Infiltrator|Inner Focus|Intimidate|Intrepid Sword|Iron Fist|Klutz|Levitate|Libero|Light Metal|Lightning Rod|Liquid Voice|Marvel Scale|Mega Launcher|Mega Sol|Merciless|Minus|Mirror Armor|Mold Breaker|Motor Drive|Mountaineer|Multiscale|Mummy|Neuroforce|Neutralizing Gas|Normalize|Oblivious|Orichalcum Pulse|Own Tempo|Overgrow|Parental Bond|Piercing Drill|Pixilate|Plus|Prism Armor|Protean|Protosynthesis|Punk Rock|Pure Power|Purifying Salt|Quark Drive|Queenly Majesty|Quick Feet|Reckless|Refrigerate|Ripen|Rivalry|Rocky Payload|Sand Force|Sand Rush|Sap Sipper|Scrappy|Shadow Shield|Sharpness|Sheer Force|Shell Armor|Simple|Slow Start|Slush Rush|Sniper|Solar Power|Solid Rock|Soundproof|Stakeout|Stamina|Steelworker|Steely Spirit|Storm Drain|Strong Jaw|Sturdy|Supreme Overlord|Surge Surfer|Swarm|Swift Swim|Sword of Ruin|Tablets of Ruin|Technician|Telepathy|Tera Shell|Teraform Zero|Teravolt|Thermal Exchange|Thick Fat|Tinted Lens|Torrent|Tough Claws|Toxic Boost|Transistor|Triage|Turboblaze|Unaware|Unburden|Unnerve|Unseen Fist|Vessel of Ruin|Volt Absorb|Wandering Spirit|Water Absorb|Water Bubble|Water Compaction|Weak Armor|Well-Baked Body|White Smoke|Wind Rider|Wonder Guard`.split('|'));
  const isDamageAbility = name => damageAbilities.has(name);
  function effectiveStat(species, entry, stat) {
    const baseline = species.stats[stat];
    const points = Number(entry.investment?.[stat] || 0);
    if (stat === 'hp') return baseline === 1 ? 1 : baseline + points;
    return Math.floor((baseline + points) * natureModifier(entry.nature, stat));
  }
  function pokemon(species, entry) {
    const id=species.calcId || species.id;
    const engineName = {'Aegislash': 'Aegislash-Shield', 'Vivillon-Icy Snow': 'Vivillon'}[id] || id;
    if (!generation.species.get(calc.toID(engineName))) {
      throw new Error('This form is not supported by the bundled battle engine');
    }
    // Metadata records contain uninvested level-50 stats. Convert to species bases
    // for the engine so these values are never mistaken for raw species stats.
    const baseStats = Object.fromEntries(stats.map(stat => [stat,
      stat === 'hp' && species.stats.hp === 1 ? 1 : species.stats[stat] - (stat === 'hp' ? 75 : 20)]));
    const result = new calc.Pokemon(generation, engineName, {
      level: 50, evs: entry.investment, nature: natureName(entry.nature), boosts:entry.boosts,curHP:entry.curHP,status:entry.status,
      // Empty abilities are replaced with the species default when the engine clones
      // a Pokémon. A nonempty no-effect value keeps disabled assumptions disabled.
      item: heldItem(species, entry), ability: entry.ability || 'No Ability',
      alliesFainted: Math.max(0,Math.min(5,Number(entry.alliesFainted) || 0)),
      overrides: {baseStats, types: species.types}
    });
    return result;
  }
  function moveMeta(name) {
    const move = generation.moves.get(calc.toID(name));
    if (!move) return null;
    return {name: move.name, category: move.category, type: window.CHAMPIONS_MOVE_TYPES?.[calc.toID(name)] || move.type,
      power: move.basePower, selfBoosts:move.self?.boosts || {}, spread: ['allAdjacent', 'allAdjacentFoes'].includes(move.target),
      multihit: move.multihit, defensiveStat: move.overrideDefensiveStat || (move.category === 'Physical' ? 'def' : 'spd'),
      offensiveStat: move.overrideOffensiveStat || (move.category === 'Physical' ? 'atk' : 'spa')};
  }
  function withStages(entry,stages = {}) {
    const boosts={...entry.boosts};
    let changed=false;
    for(const [field,stats] of [['offense',['atk','spa']],['defense',['def','spd']]]) {
      const amount=Number.isInteger(stages[field]) ? Math.max(-6,Math.min(6,stages[field])) : 0;
      if(!amount) continue;
      for(const stat of stats) boosts[stat]=Math.max(-6,Math.min(6,(boosts[stat] || 0)+amount));
      changed=true;
    }
    return changed ? {...entry,boosts} : entry;
  }
  function range(attackerSpecies, attacker, defenderSpecies, defender, moveName, options = {}) {
    ({species:attackerSpecies,entry:attacker}=window.Battle.resolveCombatant(attackerSpecies,attacker));
    ({species:defenderSpecies,entry:defender}=window.Battle.resolveCombatant(defenderSpecies,defender));
    const meta = moveMeta(moveName);
    if (!meta) return {error: 'Unknown move'};
    try {
      const calculate = defense => {
        if(meta.multihit && options.hits===undefined) {
          return MultiHit.range(attackerSpecies,attacker,defenderSpecies,defense,meta.name,options,
            (hits,target=defense)=>range(attackerSpecies,attacker,defenderSpecies,target,meta.name,{...options,defenseInvestment:null,hits}));
        }
        const a = pokemon(attackerSpecies, {...withStages(attacker,options.attackerStages),alliesFainted:options.attackerAlliesFainted ?? attacker.alliesFainted ?? 0});
        const d = pokemon(defenderSpecies, withStages(defense,options.defenderStages));
        const field = new calc.Field({gameType: options.format || 'Singles',
          weather: options.weather || undefined, terrain: options.terrain || undefined});
        // Explicit counts request raw engine rolls; default multi-hit requests
        // are combined into a complete attack distribution above.
        const moveOptions = meta.multihit ? {hits:options.hits || 1} : {};
        // The pinned engine has no Last Respects scaling; supply its actual power.
        if (meta.name === 'Last Respects') moveOptions.overrides = {basePower:50*(1+a.alliesFainted)};
        const type=window.CHAMPIONS_MOVE_TYPES?.[calc.toID(meta.name)];
        if(type) moveOptions.overrides={...moveOptions.overrides,type};
        const move = new calc.Move(generation, meta.name, moveOptions);
        const result = calc.calculate(generation, a, d, move, field);
        const [minDamage, maxDamage] = result.range();
        return {low: minDamage / d.maxHP() * 100, high: maxDamage / d.maxHP() * 100,
          minDamage, maxDamage, rolls: result.damage, hp: d.maxHP(),hits:result.move.hits || 1,
          defenderAbility: result.defender.ability, defenderItem: result.defender.item,
          meta: {...meta, type: result.move?.type || meta.type, category: result.move?.category || meta.category,
            spread: ['allAdjacent', 'allAdjacentFoes'].includes(result.move?.target)}};
      };
      const total = options.defenseInvestment;
      // The selected build is exact and is never rewritten by a comparison toggle.
      if (total === null || total === undefined) return calculate(defender);
      if (!Number.isInteger(total) || total < 0 || total > 64) {
        return {error: 'Defense budget must be a whole number from 0 to 64', meta};
      }
      let best = null;
      for (let hp = Math.max(0, total - 32); hp <= Math.min(32, total); hp++) {
        const defense = total - hp;
        // Comparison tiers assume neutral defense unless a defensive nature is requested.
        const candidate = {...defender,
          nature: options.boostDefenseNature ? {plus: meta.defensiveStat, minus: 'atk'} : {plus: null, minus: null},
          investment: {...Object.fromEntries(stats.map(stat => [stat, 0])), hp, [meta.defensiveStat]: defense}};
        const result = calculate(candidate);
        // Minimize the worst damage percentage; break ties by the lowest minimum.
        if (!best || result.high < best.high || (result.high === best.high && result.low < best.low)) {
          best = {...result, allocation: {hp, stat: meta.defensiveStat, defense}};
        }
      }
      return best;
    } catch (error) {
      return {error: error.message, meta};
    }
  }
  function speed(species, entry, options = {}) {
    ({species,entry}=window.Battle.resolveCombatant(species,entry));
    let value = effectiveStat(species, entry, 'spe');
    const stage=Math.max(-6,Math.min(6,entry.speedStage ?? entry.boosts?.spe ?? 0));
    value=Math.floor(value*(stage>=0 ? (2+stage)/2 : 2/(2-stage)));
    const ability=entry.ability;
    if ((['Rain','Heavy Rain'].includes(options.weather) && ability==='Swift Swim')
      || (['Sun','Harsh Sunshine'].includes(options.weather) && ability==='Chlorophyll')
      || (options.weather==='Sand' && ability==='Sand Rush')
      || (['Snow','Hail'].includes(options.weather) && ability==='Slush Rush')
      || (options.terrain==='Electric' && ability==='Surge Surfer')) value*=2;
    const item = heldItem(species, entry);
    if (item === 'Choice Scarf') value = Math.floor(value * 1.5);
    if (['Iron Ball', 'Macho Brace'].includes(item)) value = Math.floor(value * 0.5);
    if (options.tailwind) value *= 2;
    return value;
  }
  function speedField(options,ourAbility,opponentAbility) {
    const suppressed=[ourAbility,opponentAbility].some(ability=>['Air Lock','Cloud Nine'].includes(ability));
    return suppressed ? {...options,weather:''} : options;
  }
  function incomingRange(opponentSpecies, ourSpecies, ours, moveName, options = {}) {
    const meta = moveMeta(moveName);
    if (!meta) return {error: 'Unknown move'};
    const stat = meta.offensiveStat;
    // Each supplied spread is a separate scenario, never a stored opponent set.
    const attack = {item: options.opponentItem || '', ability: options.opponentAbility || '',
      investment: options.investment || {...Object.fromEntries(stats.map(key => [key, 0])), [stat]: 32},
      nature: options.boostOffenseNature ? {plus: stat, minus: stat === 'spa' ? 'atk' : 'spa'} : null};
    return range(opponentSpecies, attack, ourSpecies, ours, moveName,
      {...options, defenseInvestment: null});
  }
  function incomingScenarios(opponentSpecies, ourSpecies, ours, moveName, spreads, options = {}) {
    const meta = moveMeta(moveName);
    if (!meta) return {ceiling: {error: 'Unknown move'}, scenarios: []};
    const scenarios = spreads.map(spread => ({...spread,
      range: incomingRange(opponentSpecies, ourSpecies, ours, moveName,
        {...options, investment: spread.investment})}));
    // Keep a separate maximum-offense reference; do not turn it into a usage sample.
    // Final Gambit uses current HP and Electro Ball depends on Speed as well as SpA.
    const investment = {...Object.fromEntries(stats.map(key => [key, 0])), [meta.offensiveStat]: 32};
    if (meta.name === 'Final Gambit') investment.hp = 32;
    if (meta.name === 'Electro Ball') investment.spe = 32;
    const ceiling = incomingRange(opponentSpecies, ourSpecies, ours, moveName, {...options, investment});
    return {ceiling, scenarios, ceilingInvestment: investment};
  }
  function selectThreats(candidates) {
    const byDamage = (a, b) => (b.range?.high ?? -1) - (a.range?.high ?? -1)
      || (b.range?.low ?? -1) - (a.range?.low ?? -1)
      || (b.percent ?? -1) - (a.percent ?? -1) || a.name.localeCompare(b.name);
    const damaging = candidates.filter(row => row.range?.meta?.category !== 'Status' && !row.range?.error)
      .sort(byDamage).slice(0, 1);
    const common = candidates.filter(row => row.range?.meta?.category !== 'Status' && Number.isFinite(row.percent))
      .sort((a, b) => b.percent - a.percent || (a.usageRank ?? Infinity) - (b.usageRank ?? Infinity)
        || a.name.localeCompare(b.name)).slice(0, 5);
    const damageNames = new Set(damaging.map(row => row.name));
    const commonNames = new Set(common.map(row => row.name));
    // Choose common moves by usage, then display them in descending damage order.
    const selected = new Map([...damaging, ...common.sort(byDamage)].map(row => [row.name, row]));
    return [...selected.values()].map(row => ({...row,
      topDamage: damageNames.has(row.name), topCommon: commonNames.has(row.name)}));
  }
  function speedTier(species, entry, targetSpeed, options = {}) {
    const at = (points, boosted = false) => speed(species, {...entry,
      nature: boosted ? {plus: 'spe', minus: 'spa'} : {plus: null, minus: null},
      investment: {...entry.investment, spe: points}}, options);
    if (at(0) > targetSpeed) return {label: 'Always faster', kind:'always-faster'};
    for (let points = 1; points <= 32; points++) {
      if (at(points) > targetSpeed) return {label: `Faster with ${points} points invested`, points, kind:'investment'};
    }
    if (at(32, true) > targetSpeed) return {label: 'Faster only with speed-boosted nature', kind:'nature'};
    if (at(32, true) === targetSpeed) return {label: 'Can tie with speed-boosted nature', kind:'max-speed-tie'};
    return {label: 'Always Slower', kind:'always-slower'};
  }
  function speedUsageChance(species,entry,targetSpeed,usage,options = {}) {
    const spreads=(usage?.spreads || []).filter(row=>Number.isFinite(row.percent) && row.percent>0
      && Number.isInteger(row.investment?.spe) && row.investment.spe>=0 && row.investment.spe<=32);
    const natures=(usage?.natures || []).flatMap(row=>{
      const nature=generation.natures.get(calc.toID(row.name));
      return nature && Number.isFinite(row.percent) && row.percent>0 ? [{...row,nature}] : [];
    });
    if(!spreads.length || !natures.length) return null;
    const spreadCoverage=spreads.reduce((sum,row)=>sum+row.percent,0);
    const natureCoverage=natures.reduce((sum,row)=>sum+row.percent,0);
    let chance=0,tieChance=0;
    for(const spread of spreads) for(const row of natures) {
      const value=speed(species,{...entry,investment:spread.investment,nature:row.nature},options);
      const weight=spread.percent/spreadCoverage*row.percent/natureCoverage;
      if(value>targetSpeed) chance+=weight;
      else if(value===targetSpeed) tieChance+=weight;
    }
    return {chance:Math.min(1,Math.max(0,chance)),tieChance:Math.min(1,Math.max(0,tieChance)),spreadCoverage,natureCoverage};
  }
  function builderSpeedGroups(roster, selected, entry, options = {}) {
    const target = speed(selected,entry,speedField(options,entry.ability));
    const groups = [
      {kind:'always-faster',label:'Always faster'},
      {kind:'low-investment',label:'Faster with 1–16 Speed investment'},
      {kind:'high-investment',label:'Faster with 16–32 Speed investment'},
      {kind:'nature',label:'Faster with speed boosted nature'},
      {kind:'max-speed-tie',label:'Can Tie with Speed-Boosted Nature'},
      {kind:'always-slower',label:'Always slower'}
    ].map(group => ({...group,members:[]}));
    const ordered = [...roster].sort((a,b) => b.stats.spe-a.stats.spe || a.name.localeCompare(b.name));
    for (const species of ordered) {
      const ability=options.opponentAbility?.(species) || '';
      const field=speedField(options,entry.ability,ability),ourSpeed=speed(selected,entry,field);
      const speedStage=options.opponentSpeedStage ?? 0;
      const tier = speedTier(species,{item:'',ability,speedStage,investment:{}},ourSpeed,field);
      // The shared boundary 16 belongs to the 16–32 group; each form appears once.
      const kind = tier.kind === 'investment' ? (tier.points < 16 ? 'low-investment' : 'high-investment') : tier.kind;
      let outspeedPoints=null,outspeedNaturePoints=null;
      // Items, abilities and stages can let a slower species beat a faster one.
      // Calculate the requirement for every opponent, regardless of base Speed.
      {
        const ceiling=speed(species,{item:'',ability,speedStage,investment:{spe:32},nature:{plus:'spe',minus:'spa'}},field);
        const at=(points,boosted=false)=>speed(selected,{...entry,nature:boosted ? {plus:'spe',minus:'spa'} : null,
          investment:{...entry.investment,spe:points}},field);
        const minimum=(limit,test)=>{
          if(!test(limit)) return null;
          let low=0,high=limit;
          while(low<high) {const mid=Math.floor((low+high)/2);if(test(mid)) high=mid;else low=mid+1;}
          return low;
        };
        // Express the threshold on one neutral-nature-equivalent scale. Nature
        // can add effective Speed beyond 32, while actual investment stays legal.
        const ceilingPoints=Math.floor((selected.stats.spe+32)*1.1)-selected.stats.spe;
        if(at(32,true)>ceiling) {
          outspeedPoints=minimum(ceilingPoints,points=>at(points)>ceiling);
          if(outspeedPoints>32) outspeedNaturePoints=minimum(32,points=>at(points,true)>ceiling);
        }
      }
      const speedEstimate=!['always-faster','always-slower'].includes(kind)
        ? speedUsageChance(species,{item:'',ability,speedStage},ourSpeed,species.usage?.[options.format],field) : null;
      groups.find(group => group.kind === kind).members.push({species,tier,ability,ourSpeed,outspeedPoints,outspeedNaturePoints,speedEstimate,weather:field.weather || '',terrain:field.terrain || '',baseSpeed:species.stats.spe-20,
        tie:species.stats.spe === selected.stats.spe});
    }
    return {target,baseSpeed:selected.stats.spe-20,groups};
  }
  function fieldScenarios(species,ability,{weather='',terrain=''} = {}) {
    const setters={Drought:['weather','Sun'],Drizzle:['weather','Rain'],'Sand Stream':['weather','Sand'],
      'Snow Warning':['weather','Snow'],'Electric Surge':['terrain','Electric'],'Grassy Surge':['terrain','Grassy'],
      'Misty Surge':['terrain','Misty'],'Psychic Surge':['terrain','Psychic'],'Sand Spit':['weather','Sand'],
      'Seed Sower':['terrain','Grassy'],'Hadron Engine':['terrain','Electric'],'Orichalcum Pulse':['weather','Sun']};
    const setter=setters[ability] ? ability : (species.abilities || []).find(name=>setters[name]);
    if (!setter) return [{scenarioId:species.id,ability,weather,terrain,weight:1,scenario:null}];
    const [field,value]=setters[setter];
    return [false,true].map(active=>{
      const fields={weather,terrain};
      if (active) fields[field]=value;
      else if (fields[field]===value) fields[field]='';
      return {scenarioId:`${species.id}:${field}:${value}:${active ? 'active' : 'inactive'}`,
        ability:active ? setter : ability,...fields,weight:0.5,
        scenario:{active,field,value,ability:setter,...fields}};
    });
  }
  window.Battle = {generation, natureOptions, natureStats, effectiveStat, moveMeta, range, withStages, speed, speedTier,speedUsageChance,speedField,fieldScenarios,
    incomingRange, incomingScenarios, selectThreats, isDamageAbility, requiredMegaItem, builderSpeedGroups,
    resolveCombatant:(species,entry)=>({species,entry})};
})();
