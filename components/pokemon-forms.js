/* Single selectable identities for stance/weather forms; source records stay intact. */
window.PokemonForms={
  catalog(roster){
    return roster.pokemon.filter(p=>p.id!=='Aegislash'&&!/^Castform-/.test(p.id)).map(p=>p.id==='Aegislash-Blade'
      ? {...p,name:'Aegislash',calcId:p.id,stanceForm:'Blade'} : p);
  },
  isAegislash(species){return species?.id==='Aegislash-Blade'||species?.id==='Aegislash';},
  isCastform(species){return /^Castform(?:-|$)/.test(species?.calcId||species?.id||'');},
  alias(name){return /^aegislash(?:[- ](?:blade|shield)(?: forme)?)?$/i.test(String(name).trim());},
  shield(roster,canonical){
    const shield=roster.pokemon.find(p=>p.id==='Aegislash');
    return {...shield,id:canonical.id,calcId:'Aegislash',name:'Aegislash Shield Forme',stanceForm:'Shield'};
  }
};
