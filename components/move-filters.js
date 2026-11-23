/* Shared move predicates and picker controls. Pokémon search stores predicates,
   so each requirement can be satisfied by a different move on the same species. */
(() => {
  const statNames={atk:'Attack',def:'Defense',spa:'Sp. Atk',spd:'Sp. Def',spe:'Speed',accuracy:'Accuracy',evasion:'Evasion'};
  const statuses={brn:'Burn',par:'Paralysis',psn:'Poison',tox:'Bad Poison',slp:'Sleep',frz:'Freeze',confusion:'Confusion',flinch:'Flinch'};
  const cache=new Map();
  function traits(move) {
    if(cache.has(move.name))return cache.get(move.name);
    const e=window.BALANCE_MOVES?.moves[calc.toID(move.name)] || {},selfBoost={},targetBoost={},status=new Set();
    const add=(to,values)=>{for(const [stat,value] of Object.entries(values || {})){(to[stat] ||= new Set()).add(Math.sign(value));}};
    const primarySelf=e.target==='self' || e.target==='allies' || e.target==='allyTeam';
    add(primarySelf ? selfBoost : targetBoost,e.boosts);if(e.target==='allies')add(targetBoost,e.boosts);add(selfBoost,e.self?.boosts);
    if(!primarySelf && e.status)status.add(e.status);
    if(e.volatileStatus==='confusion' && !primarySelf)status.add('confusion');
    for(const effect of e.secondaries || (e.secondary ? [e.secondary] : [])) {
      if(effect.chance===0)continue;
      if(effect.status)status.add(effect.status);
      for(const value of effect.statusChoices || [])status.add(value);
      if(['confusion','flinch'].includes(effect.volatileStatus))status.add(effect.volatileStatus);
      add(targetBoost,effect.boosts);add(selfBoost,effect.self?.boosts);
    }
    // Metadata callbacks describe these guaranteed changes but do not expose boosts.
    if(move.name==='Belly Drum')add(selfBoost,{atk:6});
    const conditionalChanges={'Gear Up':{atk:1,spa:1},'Magnetic Flux':{def:1,spd:1},'Rototiller':{atk:1,spa:1},'Flower Shield':{def:1},'Acupressure':{atk:1,def:1,spa:1,spd:1,spe:1,accuracy:1,evasion:1}};
    if(conditionalChanges[move.name]) {add(selfBoost,conditionalChanges[move.name]);add(targetBoost,conditionalChanges[move.name]);}
    if(move.name==='Strength Sap')add(targetBoost,{atk:-1});
    if(move.name==='Clangorous Soul')add(selfBoost,{atk:1,def:1,spa:1,spd:1,spe:1});
    const healing=Boolean(e.heal || e.drain || ['Rest','Wish','Strength Sap','Morning Sun','Synthesis','Moonlight','Shore Up','Floral Healing','Purify','Jungle Healing','Lunar Blessing','Swallow'].includes(move.name));
    const result={effect:e,selfBoost,targetBoost,status,healing};cache.set(move.name,result);return result;
  }
  function matches(move,q={},species=null) {
    if(!move)return false;
    const {effect:e,selfBoost,targetBoost,status,healing}=traits(move);
    if(q.category && move.category!==q.category)return false;
    if(q.type && move.type!==q.type)return false;
    const power=Number(move.power || 0);
    if(q.minPower!==undefined && power<q.minPower || q.maxPower!==undefined && power>q.maxPower)return false;
    if(q.stab) {
      if(move.category==='Status' || !species)return false;
      let type=move.type;
      const ability=species.ability,abilities=ability ? [ability] : species.abilities || [];
      const converters={Aerilate:'Flying',Pixilate:'Fairy',Refrigerate:'Ice',Galvanize:'Electric'};
      if(type==='Normal')type=abilities.map(a=>converters[a]).find(t=>species.types.includes(t)) || type;
      if(e.flags?.sound && abilities.includes('Liquid Voice'))type='Water';
      if(!species.types.includes(type) && !abilities.some(a=>a==='Protean' || a==='Libero'))return false;
    }
    const multi=Boolean(move.multihit || e.multihit);
    if(q.multihit==='yes' && !multi || q.multihit==='no' && multi)return false;
    let priority=e.priority || 0;
    const abilities=species?.ability ? [species.ability] : species?.abilities || [];
    if(move.name==='Grassy Glide')priority=1;
    if(abilities.includes('Gale Wings') && move.type==='Flying')priority++;
    if(abilities.includes('Triage') && e.drain)priority+=3;
    if(q.priority==='positive' && priority<=0 || q.priority==='normal' && priority!==0 || q.priority==='negative' && priority>=0)return false;
    if(q.status && !status.has(q.status))return false;
    for(const [key,changes,sign] of [['selfBoost',selfBoost,1],['selfDrop',selfBoost,-1],['targetBoost',targetBoost,1],['targetDrop',targetBoost,-1]]) {
      if(q[key] && !changes[q[key]]?.has(sign))return false;
    }
    if(q.extra) {
      const extras={healing,drain:Boolean(e.drain),recoil:Boolean(e.recoil || e.hasCrashDamage),
        spread:Boolean(move.spread),contact:Boolean(e.flags?.contact),sound:Boolean(e.flags?.sound),
        weather:Boolean(e.weather),terrain:Boolean(e.terrain),protect:Boolean(e.flags?.protect && move.category==='Status' && e.stallingMove)};
      if(!extras[q.extra])return false;
    }
    return true;
  }
  function describe(q) {
    return [q.category,q.stab ? 'STAB' : '',q.type,q.minPower ? `${q.minPower}+ Power` : '',q.maxPower!==undefined ? `≤${q.maxPower} Power` : '',
      q.multihit==='yes' ? 'Multi-Hit' : q.multihit==='no' ? 'Single-Hit' : '',
      q.priority ? ({positive:'Priority',normal:'Normal Priority',negative:'Negative Priority'})[q.priority] : '',
      q.status ? `Inflict ${statuses[q.status]}` : '',...['selfBoost','selfDrop','targetBoost','targetDrop'].map(key=>q[key] ? `${({selfBoost:'Boost Self',selfDrop:'Lower Self',targetBoost:'Boost Target',targetDrop:'Lower Target'})[key]} ${statNames[q[key]]}` : ''),
      q.extra ? ({healing:'Healing',drain:'Draining',recoil:'Recoil',spread:'Spread',contact:'Contact',sound:'Sound',weather:'Weather',terrain:'Terrain',protect:'Protection'})[q.extra] : ''].filter(Boolean).join(' · ');
  }
  class Picker {
    constructor({input,choices,test,onChange,onRequirement}) {Object.assign(this,{input,choices,test,onChange,onRequirement});this.query={};this.sections=new Set(['basics']);}
    get active(){return Object.keys(this.query).length>0;}
    accept(move,q=this.query){return this.test ? this.test(move,q) : matches(move,q);}
    available(q=this.query){return this.choices().filter(move=>this.accept(move,q));}
    powerRange(includeLimits=false) {
      const q={...this.query};if(!includeLimits){delete q.minPower;delete q.maxPower;}
      const values=this.available(q).map(move=>move.category==='Status' ? 0 : Number(move.power || 0));
      return values.length ? {min:Math.min(...values),max:Math.max(...values)} : {min:0,max:0};
    }
    canChange(key,value){
      if(key==='minPower' || key==='maxPower') {const range=this.powerRange();if(!Number.isInteger(value) || value<range.min || value>range.max)return false;}
      const q={...this.query,[key]:value};return this.choices().some(move=>this.accept(move,q));
    }
    set(key,value) {
      if(!this.canChange(key,value))return false;
      const power=key==='minPower' || key==='maxPower';
      if(power && value===this.powerRange()[key==='minPower' ? 'min' : 'max'])delete this.query[key];
      else if(power || value!=='' && value!==false && value!==0)this.query[key]=value;else delete this.query[key];
      return true;
    }
    mount() {
      const wrapper=document.createElement('span');wrapper.className='move-filter-input';this.input.before(wrapper);wrapper.append(this.input);
      this.button=document.createElement('button');this.button.type='button';this.button.className='mini-button move-filter-toggle';this.button.textContent='Filters';this.button.disabled=this.input.disabled;this.button.setAttribute('aria-label','Filter moves');if(this.onRequirement)wrapper.append(this.button);
      this.panel=document.createElement('section');this.panel.className='move-filter-panel';this.panel.setAttribute('popover','auto');
      // Keep the panel's own power-input labels outside the move's label.
      (wrapper.closest('label') || wrapper).after(this.panel);
      this.button.addEventListener('pointerdown',event=>event.preventDefault());
      this.button.addEventListener('click',event=>{event.preventDefault();if(this.panel.matches(':popover-open'))this.close();else this.open();});
      this.panel.addEventListener('toggle',()=>this.button.setAttribute('aria-expanded',String(this.panel.matches(':popover-open'))));
      this.panel.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();}});
      this.button.setAttribute('aria-expanded','false');
    }
    position(){const r=(this.button.isConnected ? this.button : this.input).getBoundingClientRect();this.panel.style.left=Math.max(8,Math.min(innerWidth-this.panel.offsetWidth-8,r.right-this.panel.offsetWidth))+'px';this.panel.style.top=Math.max(8,Math.min(innerHeight-this.panel.offsetHeight-8,r.bottom+5))+'px';}
    open(){this.render();this.panel.showPopover();this.position();}
    close(){if(this.panel.matches(':popover-open'))this.panel.hidePopover();}
    render() {
      const button=(key,value,label)=>`<button type="button" class="mini-button" data-move-filter="${key}" data-value="${value}" aria-pressed="${(this.query[key] || '')===value}" ${!this.canChange(key,value) ? 'disabled' : ''}>${label}</button>`;
      const group=(key,title,body)=>`<details data-move-section="${key}" ${this.sections.has(key) ? 'open' : ''}><summary>${title}</summary><div class="move-filter-group">${body}</div></details>`;
      const options=(key,items)=>`<div class="filter-types">${[['','Any'],...items].map(([value,label])=>button(key,value,label)).join('')}</div>`;
      const stats=key=>options(key,Object.entries(statNames));
      const types=[...Battle.generation.types].map(t=>t.name).filter(t=>t!=='???' && t!=='Stellar');
      const bounds=this.powerRange(),remaining=this.powerRange(true);
      this.panel.innerHTML=`<div class="filter-panel-heading"><strong>Move Filters</strong><button type="button" class="mini-button" data-move-close aria-label="Close move filters">×</button></div>`
        +group('basics','Category, STAB & Power',options('category',[['Physical','Physical'],['Special','Special'],['Status','Status']])+options('stab',[[true,'STAB']])
          +`<div class="move-power-fields"><label>Min Power<input type="number" min="${bounds.min}" max="${remaining.max}" step="1" data-move-number="minPower" value="${remaining.min}"></label><label>Max Power<input type="number" min="${remaining.min}" max="${bounds.max}" step="1" data-move-number="maxPower" value="${remaining.max}"></label><small>Per-hit base power</small></div>`)
        +group('type','Type',options('type',types.map(t=>[t,t])))
        +group('hits','Multi-Hit & Priority',options('multihit',[['yes','Multi-Hit'],['no','Single-Hit']])+options('priority',[['positive','Positive'],['normal','Normal'],['negative','Negative']])+`<small>Priority includes conditional moves and ability-based priority where available.</small>`)
        +group('status','Inflict Status',options('status',Object.entries(statuses)))
        +group('stats','Stat Changes',`<small>Includes conditional and secondary effects; any nonzero chance qualifies.</small><b>Boost Self</b>${stats('selfBoost')}<b>Lower Self</b>${stats('selfDrop')}<b>Boost Target</b>${stats('targetBoost')}<b>Lower Target</b>${stats('targetDrop')}`)
        +group('extras','More Effects',options('extra',Object.entries({healing:'Healing',drain:'Draining',recoil:'Recoil',spread:'Spread',contact:'Contact',sound:'Sound',weather:'Weather',terrain:'Terrain'})))
        +`<p class="move-filter-feedback" role="status"></p><div class="filter-actions"><span>${this.available().length} moves</span><button type="button" class="mini-button" data-move-reset>Reset</button><button type="button" class="mini-button" data-move-show>Show Moves</button></div>`
        +(this.onRequirement ? `<button type="button" class="mini-button move-requirement-add" data-move-require ${!this.active ? 'disabled' : ''}>Require a Move Like This</button>` : '');
      this.panel.querySelectorAll('[data-move-section]').forEach(d=>d.querySelector('summary').onclick=event=>{
        event.preventDefault();d.open=!d.open;
        if(d.open)this.sections.add(d.dataset.moveSection);else this.sections.delete(d.dataset.moveSection);
        if(this.panel.matches(':popover-open'))this.position();
      });
      this.panel.querySelectorAll('[data-move-filter]').forEach(b=>b.onclick=()=>{const key=b.dataset.moveFilter;this.set(key,key==='stab' ? b.dataset.value==='true' : b.dataset.value);this.render();this.onChange(false);});
      this.panel.querySelectorAll('[data-move-number]').forEach(input=>input.onchange=()=>{
        const key=input.dataset.moveNumber,value=Number(input.value);
        if(!input.value.trim()){this.render();return;}
        if(value<Number(input.min) || value>Number(input.max) || !this.set(key,value)) {
          input.value=this.powerRange(true)[key==='minPower' ? 'min' : 'max'];this.panel.querySelector('.move-filter-feedback').textContent=`Choose power from ${input.min} to ${input.max}; keep at least one matching move.`;
        }else {this.render();this.onChange(false);}
      });
      this.panel.querySelector('[data-move-close]').onclick=()=>this.close();
      this.panel.querySelector('[data-move-reset]').onclick=()=>{this.query={};this.render();this.onChange(false);};
      this.panel.querySelector('[data-move-show]').onclick=()=>{this.close();this.input.focus();this.onChange(true);};
      const require=this.panel.querySelector('[data-move-require]');if(require)require.onclick=()=>{this.close();this.onRequirement({...this.query});};
      this.button.textContent=this.active ? 'Filters •' : 'Filters';
      this.button.title=describe(this.query) || 'Filter moves by category, type, power and effects';
      if(this.panel.matches(':popover-open'))this.position();
    }
  }
  window.MoveFilters={matches,traits,describe,Picker};
})();
