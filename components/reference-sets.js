/* Browser-local named opponent reference sets, independent of team contents. */
(() => {
  class ReferenceSets {
    constructor(ids,storage=null) {
      this.valid=new Set(ids);this.storage=storage;this.key='pokelator-pro-reference-sets-v1';
      let raw;try {this.storage ||= localStorage;raw=JSON.parse(this.storage.getItem(this.key) || 'null');} catch {}
      const seen=new Set();
      this.sets=(Array.isArray(raw?.sets) ? raw.sets : []).filter(set=>set && typeof set.id==='string' && !seen.has(set.id) && seen.add(set.id))
        .map(set=>({id:set.id,name:String(set.name || 'References').slice(0,80),
          ids:[...new Set((Array.isArray(set.ids) ? set.ids : []).filter(id=>this.valid.has(id)))]}));
      if(!this.sets.length) this.sets=[{id:'default',name:'References',ids:[]}];
      this.activeId=this.sets.some(set=>set.id===raw?.activeId) ? raw.activeId : this.sets[0].id;
      this.only=raw?.only===true;
      const draft=raw?.draft?.id===this.activeId ? raw.draft : this.saved;
      this.draft={id:this.activeId,name:String(draft.name || this.saved.name).slice(0,80),
        ids:[...new Set((Array.isArray(draft.ids) ? draft.ids : []).filter(id=>this.valid.has(id)))]};
    }
    get saved() {return this.sets.find(set=>set.id===this.activeId);}
    get active() {return this.draft;}
    get dirty() {return this.active.name!==this.saved.name || JSON.stringify([...this.active.ids].sort())!==JSON.stringify([...this.saved.ids].sort());}
    has(id) {return this.active.ids.includes(id);}
    save() {
      try {this.storage.setItem(this.key,JSON.stringify({sets:this.sets,activeId:this.activeId,only:this.only,draft:this.draft}));return true;} catch {return false;}
    }
    toggle(id,selected=!this.has(id)) {
      if(!this.valid.has(id)) return;
      this.active.ids=this.active.ids.filter(value=>value!==id);
      if(selected) this.active.ids.push(id);
      this.save();
    }
    clear() {this.active.ids=[];this.only=false;this.save();}
    selectMany(ids,selected) {
      const next=new Set(this.active.ids);
      for(const id of ids) if(this.valid.has(id)) {if(selected) next.add(id);else next.delete(id);}
      this.active.ids=[...next];this.save();
    }
    load(id) {
      if(this.sets.some(set=>set.id===id)) {
        this.activeId=id;this.draft={...this.saved,ids:[...this.saved.ids]};this.save();
      }
    }
    uniqueName(name,except='') {
      const base=String(name || '').trim().slice(0,70) || 'References';let candidate=base,n=2;
      while(this.sets.some(set=>set.id!==except && set.name.toLowerCase()===candidate.toLowerCase())) candidate=`${base} ${n++}`;
      return candidate;
    }
    rename(name) {if(name.trim()) {this.active.name=name.trim().slice(0,80);this.save();}}
    commit() {
      Object.assign(this.saved,{name:this.uniqueName(this.active.name,this.activeId),ids:[...this.active.ids]});
      this.load(this.activeId);
    }
    copy() {
      const name=this.active.name===this.saved.name ? `${this.active.name} copy` : this.active.name;
      const set={id:crypto.randomUUID(),name:this.uniqueName(name),ids:[...this.active.ids]};
      this.sets.push(set);this.load(set.id);return set;
    }
    remove() {
      this.sets=this.sets.filter(set=>set.id!==this.activeId);
      if(!this.sets.length) this.sets=[{id:'default',name:'References',ids:[]}];
      this.load(this.sets[0].id);
    }
  }
  window.ReferenceSets=ReferenceSets;
})();
