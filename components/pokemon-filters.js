/* Pokémon-picker constraints; type resistance uses the net defensive typing. */
(() => {
  const stats={hp:'HP',atk:'Attack',def:'Defense',spa:'Sp. Atk',spd:'Sp. Def',spe:'Speed'};
  class PokemonFilters {
    constructor({catalog,generation,usage,moveMeta,bindPicker,moveMarkup,abilityMarkup,onApply}) {
      Object.assign(this,{catalog,generation,usage,moveMeta,bindPicker,moveMarkup,abilityMarkup,onApply});
      this.stabTypeCache=new WeakMap();
      this.reset();
    }
    reset() {this.moves=[];this.abilities=[];this.types=[];this.resists=[];this.stabTargets=[];this.sort='usage';this.showAll=false;this.openSections=new Set();this.lastSection=null;}
    get active() {return this.moves.length+this.abilities.length+this.types.length+this.resists.length+this.stabTargets.length>0 || this.sort!=='usage';}
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
    matches(species,filters=this) {
      return filters.moves.every(name=>species.learnset.includes(name))
        && (!filters.abilities.length || filters.abilities.some(name=>species.abilities.includes(name)))
        && filters.types.every(type=>species.types.includes(type))
        && filters.resists.every(type=>species.types.reduce((factor,defense)=>factor*(this.generation.types.get(type.toLowerCase())?.effectiveness[defense] ?? 1),1)<1)
        && filters.stabTargets.every(target=>this.stabTypes(species).some(type=>(this.generation.types.get(type.toLowerCase())?.effectiveness[target] ?? 1)>1));
    }
    canChange(key,values) {
      const filters={...this,[key]:values};
      const addingStabType=key==='stabTargets' && values.some(type=>!this.stabTargets.includes(type));
      return this.catalog.some(species=>this.matches(species,filters)
        && (!addingStabType || values.every(target=>species.types.some(type=>(this.generation.types.get(type.toLowerCase())?.effectiveness[target] ?? 1)>1))));
    }
    change(key,values) {
      if((key==='moves' && values.length>4) || (key==='types' && values.length>2) || !this.canChange(key,values)) return false;
      this[key]=values;return true;
    }
    apply(rows) {
      return rows.filter(species=>this.matches(species)).sort((a,b)=>
        (this.sort==='usage' ? (this.usage(a)?.rank ?? Infinity)-(this.usage(b)?.rank ?? Infinity) : this.base(b,this.sort)-this.base(a,this.sort))
        || (a.usage?.rank ?? Infinity)-(b.usage?.rank ?? Infinity) || a.name.localeCompare(b.name))
        .map(species=>({...species,pickerSort:this.sort,pickerSortValue:this.sort==='usage' ? this.usage(species)?.rank : this.base(species,this.sort)}));
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
      const selected=key=>this[key].join(key==='abilities' ? ' or ' : ', ') || 'Any';
      const section=(key,title,summary,body)=>`<details class="filter-section" data-filter-section="${key}" ${this.openSections.has(key) ? 'open' : ''}><summary><strong>${title}</strong><span>${summary}</span></summary><div class="filter-section-body">${body}</div></details>`;
      this.panel.innerHTML=`<div class="filter-panel-heading"><strong>Find Your Pokémon</strong><button type="button" class="mini-button" data-filter-close aria-label="Close filters">×</button></div>`
        +section('moves','Moves',selected('moves'),`<div class="filter-field"><small>Must learn all · ${this.moves.length}/4</small><input aria-label="Filter by moves" data-filter-search="moves" placeholder="Add a move…" ${this.moves.length===4 ? 'disabled' : ''}><div class="filter-chips">${chips('moves')}</div></div>`)
        +section('abilities','Ability',selected('abilities'),`<div class="filter-field"><small>Match any selected ability</small><input aria-label="Filter by ability" data-filter-search="abilities" placeholder="Add an ability…"><div class="filter-chips">${chips('abilities','or')}</div></div>`)
        +section('types','Type',selected('types'),`<small>Match both · up to 2</small><div class="filter-types">${typeButtons('types')}</div>`)
        +section('resists','Resists Type',selected('resists'),`<small>Resist every selected type; immunities count</small><div class="filter-types">${typeButtons('resists')}</div>`)
        +section('stabTargets','Super-Effective STAB',selected('stabTargets'),`<small title="Protean and Libero appear in results, but each added type must leave a Pokémon covering all selected types with its natural STAB.">Into each selected type · includes Protean / Libero</small><div class="filter-types">${typeButtons('stabTargets')}</div>`)
        +section('sort','Sort By',this.sort==='usage' ? 'Usage Ranking' : stats[this.sort],`<div class="filter-types">${Object.entries({usage:'Usage Ranking',...stats}).map(([key,label])=>`<button type="button" class="mini-button" data-filter-sort="${key}" aria-pressed="${this.sort===key}">${label}</button>`).join('')}</div>`)
        +`<div class="filter-actions"><span>${this.catalog.filter(species=>this.matches(species)).length} matching Pokémon</span><button type="button" class="mini-button" data-filter-reset>Reset</button><button type="button" class="mini-button" data-filter-apply>Show Pokémon</button></div>`;
      const close=()=>{this.panel.hidden=true;this.button.setAttribute('aria-expanded','false');};
      this.panel.querySelector('[data-filter-close]').onclick=()=>{close();this.button.focus();};
      const visitSection=next=>{
        if(this.lastSection && this.lastSection!==next) {
          const previous=this.lastSection;
          const hasFilter=previous==='sort' ? this.sort!=='usage' : this[previous].length>0;
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
        this.bindPicker(input,{kind:key==='moves' ? 'move' : 'ability',hint:key==='moves' ? 'Must learn every selected move' : 'Any selected ability matches',
          choices:query=>options.filter(option=>!this[key].includes(option.name) && `${option.name} ${key==='moves' ? option.type : ''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)),
          markup:key==='moves' ? this.moveMarkup : this.abilityMarkup,
          choose:option=>{this.change(key,[...this[key],option.name]);this.render();}});
      }
      this.panel.querySelectorAll('[data-remove-filter]').forEach(button=>button.onclick=()=>{const key=button.dataset.removeFilter;this.change(key,this[key].filter((_,i)=>i!==Number(button.dataset.index)));this.render();});
      this.panel.querySelectorAll('[data-filter-type]').forEach(button=>button.onclick=()=>{const key=button.dataset.filterType,name=button.dataset.type;this.change(key,this[key].includes(name) ? this[key].filter(value=>value!==name) : [...this[key],name]);this.render();});
      this.panel.querySelectorAll('[data-filter-sort]').forEach(button=>button.onclick=()=>{this.sort=button.dataset.filterSort;this.render();});
      this.panel.querySelector('[data-filter-reset]').onclick=()=>{this.reset();this.render();};
      this.panel.querySelector('[data-filter-apply]').onclick=()=>{this.showAll=true;this.onApply();close();this.input.focus();};
    }
  }
  window.PokemonFilters=PokemonFilters;
})();
