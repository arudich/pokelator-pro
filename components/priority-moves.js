/* Priority candidates are shared by the picker and its background damage ranking. */
(() => {
  const conditions={'Fake Out':'First turn only','First Impression':'First turn only',
    'Sucker Punch':'Target must attack','Thunderclap':'Target must attack','Upper Hand':'Target must use priority'};
  function choices(species,usage,filters={}) {
    const reported=new Map((usage?.moves || []).map(row=>[calc.toID(row.name),row.percent]));
    const abilities=species.abilities.filter(name=>!filters.abilities?.length || filters.abilities.includes(name));
    return species.learnset.flatMap(name=>{
      const meta=Battle.moveMeta(name),effect=window.BALANCE_MOVES?.moves[calc.toID(name)];
      if(!meta || !['Physical','Special'].includes(meta.category) || !Offense.canSuggestMove(name))return [];
      let priority=effect?.priority || 0,condition=conditions[name] || '',ability='';
      if(name==='Grassy Glide') {priority=1;condition='Grassy Terrain required';}
      if(priority<=0 && abilities.includes('Triage') && effect?.drain) {priority=3;ability='Triage';}
      if(priority<=0 && abilities.includes('Gale Wings') && meta.type==='Flying') {priority=1;ability='Gale Wings';condition='Full HP required';}
      if(priority<=0 || (filters.priorityConditional===false && condition) || (filters.priorityCategory && filters.priorityCategory!==meta.category)
        || (filters.priorityType && filters.priorityType!==meta.type) || (filters.priorityUsage>0 && !(reported.get(calc.toID(name))>=filters.priorityUsage)))return [];
      return [{name,type:meta.type,category:meta.category,priority,condition,ability,percent:reported.get(calc.toID(name)) ?? null}];
    });
  }
  window.PriorityMoves={choices};
})();
