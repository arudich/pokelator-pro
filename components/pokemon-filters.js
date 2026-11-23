/* Pokémon-picker constraints; type resistance uses the net defensive typing. */
(() => {
  const stats={hp:'HP',atk:'Attack',def:'Defense',spa:'Sp. Atk',spd:'Sp. Def',spe:'Speed'};
  class PokemonFilters {
    constructor({catalog,generation,usage,moveMeta,bindPicker,moveMarkup,abilityMarkup,onApply,priorityChoices=()=>[],priorityRanking=()=>null,usageData=()=>null}) {
      Object.assign(this,{catalog,generation,usage,moveMeta,bindPicker,moveMarkup,abilityMarkup,onApply,priorityChoices,priorityRanking,usageData});
      this.stabTypeCache=new WeakMap();this.moveQueryCache=new Map();this.moveMetaCache=new Map();this.satisfyingCache=new WeakMap();
      this.reset();
    }
    reset() {this.moves=[];this.moveQueries=[];this.abilities=[];this.types=[];this.resists=[];this.stabTargets=[];this.priorityRequired=false;this.priorityConditional=true;this.priorityUsage=0;this.priorityCategory='';this.priorityType='';this.sort='usage';this.showAll=false;this.openSections=new Set();this.lastSection=null;}
    get active() {return this.moves.length+this.moveQueries.length+this.abilities.length+this.types.length+this.resists.length+this.stabTargets.length>0 || this.priorityRequired || this.sort!=='usage';}
    base(species,stat) {return species.stats[stat]-(stat==='hp' ? species.stats.hp===1 ? 0 : 75 : 20);}
    stabTypes(species) {
      if(!this.stabTypeCache.has(species)) {
        const types=new Set(species.types);
        if(species.abilities.some(name=>name==='Protean' || name==='Libero')) {
          for(const name of species.learnset) {
            const move=this.moveMeta(name);
            if(move && move.category!=='Status') types.add(move.type);
          }
        }
        this.stabTypeCache.set(species,[...types]);
      }
      return this.stabTypeCache.get(species);
    }
    queryMatches(species,queries,abilities=species.abilities || []) {
      if(!queries.length)return true;
      const key=JSON.stringify([species.id || species.name,queries,abilities]);
      if(!this.moveQueryCache.has(key))this.moveQueryCache.set(key,abilities.some(ability=>SatisfyingMoves.canAssign(species.learnset,queries.map(q=>name=>MoveFilters.matches(this.meta(name),q,{...species,ability})))));
      return this.moveQueryCache.get(key);
    }
    meta(name) {if(!this.moveMetaCache.has(name))this.moveMetaCache.set(name,this.moveMeta(name));return this.moveMetaCache.get(name);}
    moveWitness(species,move,q) {
      if(!species.learnset.includes(move.name))return false;
      const abilities=species.abilities.filter(a=>!this.abilities.length || this.abilities.includes(a));
      return abilities.some(ability=>{
        const context={...species,ability};if(!MoveFilters.matches(move,q,context))return false;
        const tests=[...this.moves.map(required=>name=>name===required),...this.moveQueries.map(query=>name=>MoveFilters.matches(this.meta(name),query,context)),name=>name===move.name];
        if(this.priorityRequired || this.sort==='priority') {
          const names=new Set(this.priorityChoices(species,{...this,abilities:[ability]}).map(m=>m.name));tests.push(name=>names.has(name));
        }
        return SatisfyingMoves.canAssign(species.learnset.filter(name=>this.meta(name)),tests);
      });
    }
    hasMoveRequirements(filters=this) {return Boolean(filters.moves.length || filters.moveQueries?.length || filters.priorityRequired || filters.sort==='priority');}
    satisfyingSet(species,filters=this) {
      if(!this.hasMoveRequirements(filters))return null;
      const usage=this.usageData(species),owner=usage || species;
      if(!this.satisfyingCache.has(owner))this.satisfyingCache.set(owner,new Map());
      const cache=this.satisfyingCache.get(owner),key=JSON.stringify([species.id || species.name,filters.moves,filters.moveQueries,filters.abilities,filters.priorityRequired,filters.sort==='priority',filters.priorityConditional,filters.priorityUsage,filters.priorityCategory,filters.priorityType]);
      if(!cache.has(key)) {
        if(cache.size>=64)cache.delete(cache.keys().next().value);
        cache.set(key,SatisfyingMoves.build(species,filters,usage,{moveMeta:name=>this.meta(name),priorityChoices:this.priorityChoices}));
      }
      return cache.get(key);
    }
    matchesBuild(species,entry) {
      if(this.abilities.length && !this.abilities.includes(entry.ability))return false;
      const options={moveMeta:name=>this.meta(name),priorityChoices:this.priorityChoices};
      return Boolean(SatisfyingMoves.build({...species,abilities:[entry.ability],learnset:entry.moveSet || []},this,this.usageData(species),options));
    }

    matches(species,filters=this) {
      return filters.moves.every(name=>species.learnset.includes(name))
        && this.queryMatches(species,filters.moveQueries || [],species.abilities?.filter(a=>!filters.abilities.length || filters.abilities.includes(a)))
        && (!filters.abilities.length || filters.abilities.some(name=>species.abilities.includes(name)))
        && filters.types.every(type=>species.types.includes(type))
        && filters.resists.every(type=>species.types.reduce((factor,defense)=>factor*(this.generation.types.get(type.toLowerCase())?.effectiveness[defense] ?? 1),1)<1)
        && (!(filters.priorityRequired || filters.sort==='priority') || this.priorityChoices(species,filters).length>0)
        && filters.stabTargets.every(target=>this.stabTypes(species).some(type=>(this.generation.types.get(type.toLowerCase())?.effectiveness[target] ?? 1)>1))
        && (!this.hasMoveRequirements(filters) || Boolean(this.satisfyingSet(species,filters)));
    }
    canChange(key,values) {
      const filters={...this,[key]:values};
      const addingStabType=key==='stabTargets' && values.some(type=>!this.stabTargets.includes(type));
      return this.catalog.some(species=>this.matches(species,filters)
        && (!addingStabType || values.every(target=>species.types.some(type=>(this.generation.types.get(type.toLowerCase())?.effectiveness[target] ?? 1)>1))));
    }
    change(key,values) {
      if(((key==='moves' || key==='moveQueries') && values.length+(key==='moves' ? this.moveQueries.length : this.moves.length)>4) || (key==='types' && values.length>2) || !this.canChange(key,values)) return false;
      this[key]=values;return true;
    }
    apply(rows) {
      const ranking=this.sort==='priority' ? this.priorityRanking(this) : null;
      return rows.filter(species=>this.matches(species)).sort((a,b)=>
        (this.sort==='priority' ? (ranking?.get(b.id)?.score ?? -1)-(ranking?.get(a.id)?.score ?? -1) : this.sort==='usage' ? (this.usage(a)?.rank ?? Infinity)-(this.usage(b)?.rank ?? Infinity) : this.base(b,this.sort)-this.base(a,this.sort))
        || (a.usage?.rank ?? Infinity)-(b.usage?.rank ?? Infinity) || a.name.localeCompare(b.name))
        .map(species=>({...species,satisfyingSet:this.satisfyingSet(species),pickerSort:this.sort,priorityBest:ranking?.get(species.id),priorityPending:this.sort==='priority' && !ranking,priorityOptions:this.priorityRequired || this.sort==='priority' ? this.priorityChoices(species,this) : null,pickerSortValue:this.sort==='usage' ? this.usage(species)?.rank : this.sort==='priority' ? ranking?.get(species.id)?.score : this.base(species,this.sort)}));
    }
    priorityMarkup(types) {
      const control=(key,value,label)=>{const valid=this.canChange(key,value) && (key==='priorityRequired' || this.catalog.some(s=>this.matches(s,{...this,[key]:value,priorityRequired:true})));return valid ? `<button type="button" class="mini-button" data-priority-key="${key}" data-priority-value='${JSON.stringify(value)}' aria-pressed="${this[key]===value}">${label}</button>` : '';};
      return `<div class="filter-priority-controls"><div class="filter-types">${control('priorityRequired',false,'Any Pokémon')}${control('priorityRequired',true,'Has Damaging Priority')}</div>
        <div class="filter-types">${control('priorityConditional',true,'Include Conditional')}${control('priorityConditional',false,'Unconditional Only')}</div>
        <div class="filter-types">${[0,5,20,50].map(value=>control('priorityUsage',value,value ? '≥'+value+'% Usage' : 'No Usage Minimum')).join('')}</div>
        <div class="filter-types">${[['','Either Category'],['Physical','Physical'],['Special','Special']].map(([value,label])=>control('priorityCategory',value,label)).join('')}</div>
        <div class="filter-types">${['',...types].map(value=>control('priorityType',value,value || 'Any Type')).join('')}</div></div>`;
    }
    mount(input) {
      this.input=input;
      this.button=document.createElement('button');this.button.type='button';this.button.className='mini-button pokemon-filter-toggle';
      this.button.textContent='Filters';this.button.setAttribute('aria-expanded','false');
      input.after(this.button);
      this.panel=document.createElement('section');this.panel.className='pokemon-filter-panel';this.panel.hidden=true;
      this.panel.id=input.id+'Filters';this.button.setAttribute('aria-controls',this.panel.id);
      input.closest('.search-box').append(this.panel);
      this.button.addEventListener('click',()=>{this.panel.hidden=!this.panel.hidden;this.button.setAttribute('aria-expanded',String(!this.panel.hidden));if(!this.panel.hidden)this.render();});
      this.render();
    }
    render() {
      const typeNames=[...this.generation.types].map(type=>type.name).filter(name=>name!=='???' && name!=='Stellar');
      const chips=(key,separator='')=>this[key].map((name,index)=>`${index && separator ? '<small class="filter-or">or</small>' : ''}<button type="button" class="mini-button filter-chip" data-remove-filter="${key}" data-index="${index}" aria-label="Remove ${name}" ${!this.canChange(key,this[key].filter((_,i)=>i!==index)) ? 'disabled title="Other filters depend on this ability; remove those filters first"' : ''}>${name} ×</button>`).join('');
      const typeButtons=key=>typeNames.filter(name=>this[key].includes(name) || this.canChange(key,[...this[key],name])).map(name=>`<button type="button" class="mini-button filter-type" data-filter-type="${key}" data-type="${name}" aria-pressed="${this[key].includes(name)}" ${key==='types' && this.types.length===2 && !this.types.includes(name) ? 'disabled' : ''}>${name}</button>`).join('');
      const selected=key=>key==='moves' && this.moveQueries.length ? [...this.moves,...this.moveQueries.map(MoveFilters.describe)].join('; ') : this[key].join(key==='abilities' ? ' or ' : ', ') || 'Any';
      const section=(key,title,summary,body)=>`<details class="filter-section" data-filter-section="${key}" ${this.openSections.has(key) ? 'open' : ''}><summary><strong>${title}</strong><span>${summary}</span></summary><div class="filter-section-body">${body}</div></details>`;
      this.panel.innerHTML=`<div class="filter-panel-heading"><strong>Find Your Pokémon</strong><button type="button" class="mini-button" data-filter-close aria-label="Close filters">×</button></div>`
        +section('moves','Moves',selected('moves'),`<div class="filter-field"><small>Must learn all · ${this.moves.length+this.moveQueries.length}/4</small><input aria-label="Filter by moves" data-filter-search="moves" placeholder="Add a move…" ${this.moves.length+this.moveQueries.length===4 ? 'disabled' : ''}><div class="filter-chips">${chips('moves')}${this.moveQueries.map((q,i)=>`<button type="button" class="mini-button filter-chip move-query-chip" data-remove-query="${i}">${MoveFilters.describe(q)} ×</button>`).join('')}</div></div>`)
        +section('abilities','Ability',selected('abilities'),`<div class="filter-field"><small>Match any selected ability</small><input aria-label="Filter by ability" data-filter-search="abilities" placeholder="Add an ability…"><div class="filter-chips">${chips('abilities','or')}</div></div>`)
        +section('types','Type',selected('types'),`<small>Match both · up to 2</small><div class="filter-types">${typeButtons('types')}</div>`)
        +section('resists','Resists Type',selected('resists'),`<small>Resist every selected type; immunities count</small><div class="filter-types">${typeButtons('resists')}</div>`)
        +section('stabTargets','Super-Effective STAB',selected('stabTargets'),`<small title="Protean and Libero appear in results, but each added type must leave a Pokémon covering all selected types with its natural STAB.">Into each selected type · includes Protean / Libero</small><div class="filter-types">${typeButtons('stabTargets')}</div>`)
        +section('priority','Priority',this.priorityRequired || this.sort==='priority' ? 'Damaging attacks' : 'Any',this.priorityMarkup(typeNames))
        +section('sort','Sort By',this.sort==='usage' ? 'Usage Ranking' : this.sort==='priority' ? 'Priority Strength' : stats[this.sort],`<div class="filter-types">${Object.entries({usage:'Usage Ranking',priority:'Priority Strength',...stats}).filter(([key])=>key!=='priority' || this.canChange('sort','priority')).map(([key,label])=>`<button type="button" class="mini-button" data-filter-sort="${key}" aria-pressed="${this.sort===key}">${label}</button>`).join('')}</div>`)
        +`<div class="filter-actions"><span>${this.catalog.filter(species=>this.matches(species)).length} matching Pokémon</span><button type="button" class="mini-button" data-filter-reset>Reset</button><button type="button" class="mini-button" data-filter-apply>Show Pokémon</button></div>`;
      const close=()=>{this.panel.hidden=true;this.button.setAttribute('aria-expanded','false');};
      this.panel.querySelector('[data-filter-close]').onclick=()=>{close();this.button.focus();};
      const visitSection=next=>{
        if(this.lastSection && this.lastSection!==next) {
          const previous=this.lastSection;
          const hasFilter=previous==='sort' ? this.sort!=='usage' : previous==='priority' ? this.priorityRequired || this.sort==='priority' : this[previous].length>0 || (previous==='moves' && this.moveQueries.length>0);
          if(!hasFilter) {
            this.openSections.delete(previous);
            this.panel.querySelector(`[data-filter-section="${previous}"]`).open=false;
          }
        }
        this.lastSection=next;
      };
      this.panel.onfocusin=event=>visitSection(event.target.closest('[data-filter-section]')?.dataset.filterSection || null);
      for(const details of this.panel.querySelectorAll('[data-filter-section]')) details.querySelector('summary').onclick=event=>{
        visitSection(details.dataset.filterSection);
        event.preventDefault();const open=!details.open;
        details.open=open;
        if(open)this.openSections.add(details.dataset.filterSection);else this.openSections.delete(details.dataset.filterSection);
      };
      this.button.textContent=this.active ? `Filters •` : 'Filters';
      for(const input of this.panel.querySelectorAll('[data-filter-search]')) {
        const key=input.dataset.filterSearch;
        const viable=this.catalog.filter(species=>this.matches(species,key==='abilities' ? {...this,abilities:[]} : this));
        const options=key==='moves' ? [...new Set(viable.flatMap(species=>species.learnset))].map(name=>this.moveMeta(name)).filter(Boolean)
          : [...new Set(viable.flatMap(species=>species.abilities))].map(name=>({name,percent:null,description:window.ABILITY_EFFECTS?.[name.toLowerCase().replace(/[^a-z0-9]/g,'')] || ''}));
        const learners=new Map();if(key==='moves')for(const species of viable)for(const name of species.learnset){if(!learners.has(name))learners.set(name,[]);learners.get(name).push(species);}
        this.bindPicker(input,{moveFilterOptions:{matches:(move,q)=>(learners.get(move.name) || []).some(species=>this.moveWitness(species,move,q)),onRequirement:key==='moves' ? q=>{this.change('moveQueries',[...this.moveQueries,q]);this.render();} : undefined},kind:key==='moves' ? 'move' : 'ability',hint:key==='moves' ? 'Must learn every selected move' : 'Any selected ability matches',
          choices:query=>options.filter(option=>!this[key].includes(option.name) && `${option.name} ${key==='moves' ? option.type : ''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)),
          markup:key==='moves' ? this.moveMarkup : this.abilityMarkup,
          choose:option=>{this.change(key,[...this[key],option.name]);this.render();}});
      }
      this.panel.querySelectorAll('[data-remove-query]').forEach(button=>button.onclick=()=>{this.change('moveQueries',this.moveQueries.filter((_,i)=>i!==Number(button.dataset.removeQuery)));this.render();});
      this.panel.querySelectorAll('[data-remove-filter]').forEach(button=>button.onclick=()=>{const key=button.dataset.removeFilter;this.change(key,this[key].filter((_,i)=>i!==Number(button.dataset.index)));this.render();});
      this.panel.querySelectorAll('[data-filter-type]').forEach(button=>button.onclick=()=>{const key=button.dataset.filterType,name=button.dataset.type;this.change(key,this[key].includes(name) ? this[key].filter(value=>value!==name) : [...this[key],name]);this.render();});
      this.panel.querySelectorAll('[data-filter-sort]').forEach(button=>button.onclick=()=>{if(this.canChange('sort',button.dataset.filterSort))this.sort=button.dataset.filterSort;this.render();});
      this.panel.querySelectorAll('[data-priority-key]').forEach(button=>button.onclick=()=>{const key=button.dataset.priorityKey,value=JSON.parse(button.dataset.priorityValue);if(this.canChange(key,value)){this[key]=value;if(key==='priorityRequired' && !value && this.sort==='priority')this.sort='usage';if(key!=='priorityRequired')this.priorityRequired=true;}this.render();});
      this.panel.querySelector('[data-filter-reset]').onclick=()=>{this.reset();this.render();};
      this.panel.querySelector('[data-filter-apply]').onclick=()=>{this.showAll=true;this.onApply();close();this.input.focus();};
    }
  }
  window.PokemonFilters=PokemonFilters;
})();
