/* Pokémon-picker constraints; type resistance uses the net defensive typing. */
(() => {
  const sortLabels={usage:'Usage Ranking',dex:'Pokédex Number',priority:'Priority Strength',hp:'HP',atk:'Attack',def:'Defense',spa:'Sp. Atk',spd:'Sp. Def',spe:'Speed'};
  class PokemonFilters {
    constructor({catalog,generation,usage,dexNumber,moveMeta,bindPicker,moveMarkup,abilityMarkup,onApply,onDismiss=()=>{},shouldFloat=()=>false,priorityChoices=()=>[],priorityRanking=()=>null,usageData=()=>null}) {
      Object.assign(this,{catalog,generation,usage,dexNumber,moveMeta,bindPicker,moveMarkup,abilityMarkup,onApply,onDismiss,shouldFloat,priorityChoices,priorityRanking,usageData});
      this.moveQueryCache=new Map();this.moveMetaCache=new Map();this.satisfyingCache=new WeakMap();
      this.moveOptions={moveMeta:name=>this.meta(name),priorityChoices,
        typeEffectiveness:(type,target)=>this.generation.types.get(type.toLowerCase())?.effectiveness[target] ?? 1};
      this.reset();
    }
    reset() {this.moves=[];this.moveQueries=[];this.abilities=[];this.types=[];this.resists=[];this.stabTargets=[];this.priorityRequired=false;this.priorityConditional=true;this.priorityUsage=0;this.priorityCategory='';this.priorityType='';this.sort='usage';this.enabled=true;this.showAll=false;this.openSections=new Set();this.lastSection=null;}
    get active() {return this.moves.length+this.moveQueries.length+this.abilities.length+this.types.length+this.resists.length+this.stabTargets.length>0 || this.priorityRequired || this.sort!=='usage';}
    get requiresMoves() { return this.enabled && this.hasMoveRequirements(); }
    setEnabled(enabled) {
      this.enabled=enabled;
      this.updateButton();
    }
    updateButton() {
      this.button.textContent=this.active && this.enabled ? 'Filters •' : 'Filters';
      this.button.title=this.active && !this.enabled ? 'Pokémon filters are off' : '';
    }
    base(species,stat) {return species.stats[stat]-(stat==='hp' ? species.stats.hp===1 ? 0 : 75 : 20);}
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
        return Boolean(this.satisfyingSet(species,{...this,moves:[...this.moves,move.name],abilities:[ability]}));
      });
    }
    hasMoveRequirements(filters=this) {return Boolean(filters.moves.length || filters.moveQueries?.length || filters.stabTargets?.length || filters.priorityRequired || filters.sort==='priority');}
    satisfyingSet(species,filters=this) {
      if(!this.hasMoveRequirements(filters))return null;
      const usage=this.usageData(species);
      if(!this.satisfyingCache.has(species))this.satisfyingCache.set(species,new Map());
      const cache=this.satisfyingCache.get(species),key=JSON.stringify([filters.moves,filters.moveQueries,filters.stabTargets,filters.abilities,filters.priorityRequired,filters.sort==='priority',filters.priorityConditional,filters.priorityUsage,filters.priorityCategory,filters.priorityType]);
      if(!cache.has(key) || cache.get(key).usage!==usage) {
        if(cache.size>=64)cache.delete(cache.keys().next().value);
        cache.set(key,{usage,set:SatisfyingMoves.build(species,filters,usage,this.moveOptions)});
      }
      return cache.get(key).set;
    }
    satisfyingBuild(species,entry) {
      return SatisfyingMoves.build({...species,abilities:[entry.ability],learnset:entry.moveSet || []},this,this.usageData(species),this.moveOptions);
    }
    matchesBuild(species,entry) {
      return Boolean(this.satisfyingBuild(species,entry));
    }

    matches(species,filters=this) {
      return filters.moves.every(name=>species.learnset.includes(name))
        && this.queryMatches(species,filters.moveQueries || [],species.abilities?.filter(a=>!filters.abilities.length || filters.abilities.includes(a)))
        && (!filters.abilities.length || filters.abilities.some(name=>species.abilities.includes(name)))
        && filters.types.every(type=>species.types.includes(type))
        && filters.resists.every(type=>species.types.reduce((factor,defense)=>factor*(this.generation.types.get(type.toLowerCase())?.effectiveness[defense] ?? 1),1)<1)
        && (!(filters.priorityRequired || filters.sort==='priority') || this.priorityChoices(species,filters).length>0)
        && (!this.hasMoveRequirements(filters) || Boolean(this.satisfyingSet(species,filters)));
    }
    canChange(key,values) {
      const filters={...this,[key]:values};
      const addingStabType=key==='stabTargets' && values.some(type=>!this.stabTargets.includes(type));
      return this.catalog.some(species=>this.matches(species,filters)
        && (!addingStabType || values.every(target=>species.types.some(type=>this.moveOptions.typeEffectiveness(type,target)>1))));
    }
    change(key,values) {
      if(((key==='moves' || key==='moveQueries') && values.length+(key==='moves' ? this.moveQueries.length : this.moves.length)>4) || (key==='types' && values.length>2) || !this.canChange(key,values)) return false;
      this[key]=values;return true;
    }
    apply(rows) {
      const sort=this.enabled ? this.sort : 'usage';
      const ranking=sort==='priority' ? this.priorityRanking(this) : null;
      const showPriority=this.enabled && (this.priorityRequired || sort==='priority');
      const matches=this.enabled ? rows.filter(species=>this.matches(species)) : [...rows];
      const score=sort==='usage' ? species=>this.usage(species)?.rank : sort==='dex' ? this.dexNumber
        : sort==='priority' ? species=>ranking?.get(species.id)?.score : species=>this.base(species,sort);
      const ascending=sort==='usage' || sort==='dex';
      return matches.map(species=>({...species,satisfyingSet:this.requiresMoves ? this.satisfyingSet(species) : null,pickerSort:sort,
        priorityBest:ranking?.get(species.id),priorityPending:sort==='priority' && !ranking,
        priorityOptions:showPriority ? this.priorityChoices(species,this) : null,pickerSortValue:score(species)}))
        .sort((a,b)=>(ascending ? (a.pickerSortValue ?? Infinity)-(b.pickerSortValue ?? Infinity) : (b.pickerSortValue ?? -1)-(a.pickerSortValue ?? -1))
          || (sort==='dex' ? Number(a.form!=='Base')-Number(b.form!=='Base') : (a.usage?.rank ?? Infinity)-(b.usage?.rank ?? Infinity))
          || a.name.localeCompare(b.name));
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
      this.button.addEventListener('click',()=>this.toggle(this.button));
      new ResizeObserver(()=>this.positionPanel()).observe(this.panel);
      this.render();
    }
    setGridButton(button) {
      if(this.gridButton && this.trigger===this.gridButton) this.trigger=button || this.button;
      this.gridButton=button;
      this.updateExpanded();
      this.positionPanel();
    }
    updateExpanded() {
      const expanded=String(!this.panel.hidden);
      this.button.setAttribute('aria-expanded',expanded);
      this.gridButton?.setAttribute('aria-expanded',expanded);
    }
    toggle(trigger) {
      this.trigger=trigger;
      if(!this.panel.hidden) {this.close(true);return;}
      this.panel.hidden=false;
      this.updateExpanded();
      this.render();
      this.syncPanelLayer();
      if(this.panel.matches(':popover-open')) this.panel.querySelector('[data-filter-close]').focus({preventScroll:true});
    }
    close(restoreFocus=false) {
      this.panel.hidden=true;
      this.updateExpanded();
      this.syncPanelLayer();
      if(restoreFocus) {
        this.onDismiss();
        (this.trigger?.isConnected ? this.trigger : this.button).focus({preventScroll:true});
      }
    }
    syncPanelLayer() {
      const floating=!this.panel.hidden && this.shouldFloat();
      if(floating && !this.panel.hasAttribute('popover')) {
        this.panel.setAttribute('popover','manual');
        this.panel.showPopover();
        this.positionPanel();
      } else if(!floating && this.panel.hasAttribute('popover')) {
        this.panel.hidePopover();
        this.panel.removeAttribute('popover');
        this.panel.removeAttribute('style');
      }
    }
    positionPanel() {
      if(!this.panel.matches(':popover-open'))return;
      const anchor=this.input.parentElement.getBoundingClientRect();
      const trigger=this.trigger?.getBoundingClientRect();
      const reference=trigger?.height && trigger.bottom>0 && trigger.top<innerHeight ? trigger : anchor;
      const width=Math.min(Math.max(anchor.width,240),innerWidth-16);
      const above=reference.top-16,below=innerHeight-reference.bottom-16;
      const down=below>=Math.min(330,above);
      this.panel.style.width=`${width}px`;
      this.panel.style.left=`${Math.max(8,Math.min(anchor.left,innerWidth-width-8))}px`;
      this.panel.style.maxHeight=`${Math.max(0,Math.min(550,down ? below : above))}px`;
      this.panel.style.top=`${Math.max(8,down ? reference.bottom+8 : reference.top-this.panel.offsetHeight-8)}px`;
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
        +section('sort','Sort By',sortLabels[this.sort],`<div class="filter-types">${Object.entries(sortLabels).filter(([key])=>key!=='priority' || this.canChange('sort','priority')).map(([key,label])=>`<button type="button" class="mini-button" data-filter-sort="${key}" aria-pressed="${this.sort===key}">${label}</button>`).join('')}</div>`)
        +`<div class="filter-actions"><span>${this.catalog.filter(species=>this.matches(species)).length} matching Pokémon</span><button type="button" class="mini-button" data-filter-reset>Reset</button><button type="button" class="mini-button" data-filter-apply>Show Pokémon</button></div>`;
      this.panel.querySelector('[data-filter-close]').onclick=()=>this.close(true);
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
      this.updateButton();
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
      this.panel.querySelector('[data-filter-apply]').onclick=()=>{
        this.showAll=true;this.setEnabled(true);this.close();
        (this.onApply() || this.input).focus();
      };
    }
  }
  window.PokemonFilters=PokemonFilters;
})();
