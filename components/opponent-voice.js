/* Browser-provided speech recognition; matching Pokémon names stays local. */
(() => {
  const hover='Add a group of opponent Pokemon by voice!  Click to toggle microphone, or hold down Space.';
  const normalize=text=>String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function distance(a,b,limit) {
    if(Math.abs(a.length-b.length)>limit)return limit+1;
    let previous=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++) {
      const row=[i];
      for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]!==b[j-1]));
      if(Math.min(...row)>limit)return limit+1;previous=row;
    }
    return previous[b.length];
  }
  function matcher(catalog,rank=()=>0) {
    const aliases=new Map();
    const add=(name,species,canonical=false)=>{
      const key=normalize(name);if(!key)return;
      if(!aliases.has(key))aliases.set(key,[]);
      if(!aliases.get(key).some(row=>row.species.id===species.id))aliases.get(key).push({species,canonical});
    };
    for(const species of catalog) {
      add(species.name,species,true);
      // Engine IDs such as Tyranitar-Mega also swallow the next name's Mega.
      if(!species.isMega)add(species.id,species,true);
      const name=species.name;
      if(species.id==='Aegislash-Blade')for(const form of ['blade','shield']){add('Aegislash '+form,species);add('Aegislash '+form+' forme',species);}
      if(/^Mega /i.test(name)) {
        // A postfix “mega” would steal the prefix of the next name in a group.
        const base=name.replace(/^Mega /i,'');
        if(/ [XY]$/.test(base)) {
          add(base,species);const spoken=base.replace(/ X$/,' ex').replace(/ Y$/,' why');
          add('Mega '+spoken,species);add(spoken,species);
        }
      }
      for(const form of ['Alolan','Galarian','Hisuian','Paldean'])if(name.startsWith(form+' '))add(name.slice(form.length+1)+' '+form,species);
      if(/ (Male|Female)$/.test(name)){
        const stem=name.replace(/ (Male|Female)$/,'');
        const gender=/ Female$/.test(name)?'Female':'Male',initial=gender[0];
        add(stem,species);add(stem+' '+initial,species);add(gender+' '+stem,species);add(initial+' '+stem,species);
      }
      if(/ (Form|Forme|Variety|Pattern)$/.test(name))add(name.replace(/ (Form|Forme|Variety|Pattern)$/,''),species);
      if(species.id==='Palafin')add('Palafin',species,true);
      if(species.id==='Castform')for(const form of ['rainy','snowy','sunny']){add('Castform '+form,species);add('Castform '+form+' form',species);}
    }
    const fuzzyAliases=[...aliases.keys()],learnedFuzzyAliases=new Set();
    // Most speech spellings stay exact; fuzzing all of them could match “household”.
    const speechAliases={
      'king gambit':'Kingambit','sneezler':'Sneasler','sneezer':'Sneasler','sneaseler':'Sneasler',
      'bass legion':'Basculegion Male','basque legion':'Basculegion Male',
      'mouse hold':'Maushold','mouse held':'Maushold','mouse hole':'Maushold','mouse old':'Maushold',
      'mows hold':'Maushold','maus hold':'Maushold',
      'bomba snow':'Abomasnow','obama snow':'Abomasnow','agron':'Aggron',
      'alcram':'Alcremie','al cramy':'Alcremie','alcramy':'Alcremie',
      'arbach':'Arbok','our believa':'Arboliva',
      'our kaladon':'Archaludon','our caledon':'Archaludon','aromatus':'Aromatisse',
      'ageslash':'Aegislash','it just slashed':'Aegislash',
      'kaludon':'Archaludon','guard jump':'Garchomp','goldango':'Gholdengo',
      'as gilligin mail':'Basculegion Male','basciligian female':'Basculegion Female',
      'in dd female':'Indeedee Female','mega raju y':'Mega Raichu Y',
      'mega fluet':'Mega Floette','mega galissipod':'Mega Golisopod',
      'sinistra':'Sinistcha','graham snarl':'Grimmsnarl','ex goodrill':'Excadrill',
      'twerkle':'Torkoal','glamora':'Glimmora','mega camera':'Mega Camerupt',
      'corphonite':'Corviknight','sarah ledge':'Ceruledge','high dragon':'Hydreigon','pomet':'Pawmot',
      'saboli':'Sableye','hippaudon':'Hippowdon','back scaliber':'Baxcalibur','cleavore':'Kleavor',
      'serena':'Tsareena','rotamosh':'Rotom Wash','grappelocked':'Grapploct','glyscore':'Gliscor',
      'lichen rock':'Lycanroc','lichenrock dusk':'Lycanroc Dusk Form','mammoth wine':'Mamoswine',
      'his suian zorawark':'Hisuian Zoroark','hissuian gudra':'Hisuian Goodra','his suanerot':'Hisuian Samurott',
      'mimic you':'Mimikyu','miaus garada':'Meowscarada','vanilla x':'Vanilluxe',
      'and polyon':'Empoleon','toxtry toricity':'Toxtricity','adeno':'Audino',
      'mega chestnut':'Mega Chesnaught','oridir':'Wyrdeer',
      'crocodile':'Krookodile','alcromi':'Alcremie','gallerian sloking':'Galarian Slowking',
      'guard of war':'Gardevoir','geridos':'Gyarados','skelege':'Skeledirge',
      'hisuian decidui':'Hisuian Decidueye','taros aqua':'Paldean Tauros Aqua Breed',
      'gallerc':'Golurk','caesor':'Scizor','meowstick':'Meowstic','for alligator':'Feraligatr',
      'floet':'Floette','spiritum':'Spiritomb','chestnut':'Chesnaught','nevern':'Noivern',
      'electros':'Eelektross','alicazam':'Alakazam','per circer':'Perrserker',
      'kafagus':'Cofagrigus','barbarical':'Barbaracle','ride you alola':'Alolan Raichu',
      'superior':'Serperior',
      'nasaler':'Sneasler','willow boom':'Rillaboom','rilloboom':'Rillaboom',
      'asciligian male':'Basculegion Male','basilijin male':'Basculegion Male','bascalesian male':'Basculegion Male',
      'for regoraf':'Farigiraf','ferigorf':'Farigiraf','right you':'Raichu',
      'como':'Kommo-o','come o':'Kommo-o','indeed':'Indeedee','swarmbird':'Swampert','camera':'Camerupt',
      'blazicin':'Blaziken','blazigan':'Blaziken','maisle':'Mawile','ma isle':'Mawile','pyro':'Pyroar','iroor':'Pyroar',
      'hydragon':'Hydreigon','hydragan':'Hydreigon','hadarine':'Hatterene','sabali':'Sableye','sabili':'Sableye','loponey':'Lopunny',
      'clivor':'Kleavor','clevor':'Kleavor','grapellocked':'Grapploct','grapplocked':'Grapploct',
      'mammoth swine':'Mamoswine','delayed':'Gallade','kygascon':'Kangaskhan','genghis khan':'Kangaskhan',
      'gudra':'Goodra','goudra':'Goodra','mioskarada':'Meowscarada','scarmary':'Skarmory','a rangaroo':'Oranguru',
      'where dear':'Wyrdeer','were deer':'Wyrdeer','were dear':'Wyrdeer','intellion':'Inteleon','alcrami':'Alcremie',
      'sloking':'Slowking','slo king':'Slowking','slobro':'Slowbro','slobbro':'Slowbro',
      'decidui':'Decidueye','deciduai':'Decidueye','desitui':'Decidueye','did you i':'Decidueye',
      'miaostic':'Meowstic','miaostick':'Meowstic','myowsteck':'Meowstic',
      'flowet':'Floette','neuvern':'Noivern','squakability':'Squawkabilly','quaka vowel':'Quaquaval','quacaval':'Quaquaval','quakaval':'Quaquaval',
      'cliitzer':'Clawitzer','clyitzer':'Clawitzer','klitzer':'Clawitzer','bonet':'Banette','annette':'Banette',
      'metacham':'Medicham','copfagus':'Cofagrigus','phalanx':'Falinks','salazl':'Salazzle',
      'ambor':'Emboar','mbore':'Emboar','concilder':'Conkeldurr','conclelder':'Conkeldurr','conkildor':'Conkeldurr',
      'are believa':'Arboliva','chimeko':'Chimecho','chameko':'Chimecho','chamecco':'Chimecho','scoloped':'Scolipede',
      'victory bell':'Victreebel','pincer':'Pinsir','mr rhyme':'Mr. Rime','legally tough':'Wigglytuff','wiggly tough':'Wigglytuff',
      'high drappal':'Hydrapple','eye drapple':'Hydrapple','rotom mo':'Rotom Mow',
      'toxicroke':'Toxicroak','beretic':'Beartic','beer tick':'Beartic','berettech':'Beartic','sharpito':'Sharpedo',
      'dickersby':'Diggersby','gorgist':'Gourgeist','gorges':'Gourgeist','gorgeist':'Gourgeist',
      'poulterer geist':'Polteageist','more pecco':'Morpeko','more pico':'Morpeko','morpico':'Morpeko',
      'lefion':'Leafeon','leafion':'Leafeon','de den':'Dedenne','deene':'Dedenne','flerion':'Flareon',
      'avalog':'Avalugg','avalug':'Avalugg','avelug':'Avalugg','flappel':'Flapple','like in rock':'Lycanroc','two cannon':'Toucannon',
      'fortress':'Forretress','mabestiff':'Mabosstiff','semisir':'Simisear','quillfish':'Qwilfish',
      'vivalon':'Vivillon Icy Snow Pattern','vivillion':'Vivillon Icy Snow Pattern',
      'toxicity':'Toxtricity',
      'arcalidon':'Archaludon','arkaledon':'Archaludon','are caludon':'Archaludon',
      'ferigorath':'Farigiraf','for rigoraf':'Farigiraf','ferigorafly':'Farigiraf','rigorath':'Farigiraf','vigorath':'Farigiraf',
      'polytoad':'Politoed','gregopolt':'Dragapult','corvinite':'Corviknight','skovillin':'Scovillain',
      'cebeli':'Sableye','hapaudon':'Hippowdon','her powdon':'Hippowdon','hip hop don':'Hippowdon',
      'back scalibur':'Baxcalibur','backs caliber':'Baxcalibur','grapoloc':'Grapploct','grapplecht':'Grapploct',
      'wrote home heat':'Rotom Heat','mimicu':'Mimikyu','miyoskarada':'Meowscarada','myoskarada':'Meowscarada','mios garada':'Meowscarada',
      'overquill':'Overqwil','samarot':'Samurott','samurat':'Samurott','samrat':'Samurott',
      'orangaroo':'Oranguru','odino':'Audino','weevil':'Weavile','wevil':'Weavile','wevyl':'Weavile',
      'paliphen':'Palafin Zero Form','palaffine':'Palafin Zero Form','palafine':'Palafin Zero Form','palaffin':'Palafin Zero Form',
      'amphorose':'Ampharos','decisui':'Decidueye','disitui':'Decidueye','cesor':'Scizor','czor':'Scizor','bedril':'Beedrill','b drill':'Beedrill',
      'writeualolola':'Alolan Raichu','solazil':'Salazzle','salazal':'Salazzle',
      'concelder':'Conkeldurr','conkelder':'Conkeldurr','contelder':'Conkeldurr','concelter':'Conkeldurr',
      'chimaco':'Chimecho','pigeot':'Pidgeot','earthworm':'Orthworm','gorges to jumbo':'Gourgeist Jumbo Variety',
      'poltiogist':'Polteageist','imalga':'Emolga','imolga':'Emolga','simmissir':'Simisear','simicer':'Simisear','simisir':'Simisear','toros':'Tauros',
      'vivolon':'Vivillon Icy Snow Pattern','vivolan':'Vivillon Icy Snow Pattern','vivelon':'Vivillon Icy Snow Pattern',
      'vivolin':'Vivillon Icy Snow Pattern','vivoline':'Vivillon Icy Snow Pattern','vivolone':'Vivillon Icy Snow Pattern',
      'caliper':'Pelipper','glissopod':'Golisopod','alyssopod':'Golisopod','glycopod':'Golisopod',
      'sonestra':'Sinistcha','sinestra':'Sinistcha','in dd':'Indeedee','indeedy':'Indeedee',
      'haterin':'Hatterene','cleaver':'Kleavor','livescore':'Gliscor','glide score':'Gliscor',
      'cleft key':'Klefki','clef key':'Klefki','crookedil':'Krookodile','krokodil':'Krookodile','krokodils':'Krookodile','krokodiles':'Krookodile',
      'alchemy':'Alcremie','lapard':'Liepard','lie part':'Liepard','per circle':'Perrserker','per circleville':'Perrserker',
      'crocival':'Quaquaval','bennett':'Banette','benet':'Banette','burnett':'Banette','lynette':'Banette',
      'kapha grigice':'Cofagrigus','kapha grigas':'Cofagrigus','kapha gregus':'Cofagrigus','kapha griggas':'Cofagrigus',
      'kafa grigas':'Cofagrigus','kafa gregus':'Cofagrigus','kapha greatest':'Cofagrigus','coffin creeks':'Cofagrigus','coffin creekas':'Cofagrigus',
      'aromatous':'Aromatisse','embor':'Emboar','embar':'Emboar','bear tech':'Beartic','beartek':'Beartic','vertech':'Beartic',
      'area dose':'Ariados','arriatos':'Ariados','persimmon':'Passimian','persimian':'Passimian','pacimient':'Passimian','pacimian':'Passimian','pessimian':'Passimian',
      'semaphore':'Simipour','semapore':'Simipour','semipore':'Simipour','my boston':'Mabosstiff','my bostice':'Mabosstiff','my bostiff':'Mabosstiff',
      'mabastiff':'Mabosstiff','mobastiff':'Mabosstiff','mebastiff':'Mabosstiff',
      'pelipur':'Pelipper','hepaudon':'Hippowdon','typhoon h':'Hisuian Typhlosion',
      'kenghis khan':'Kangaskhan','kangascon':'Kangaskhan','kngiscon':'Kangaskhan',
      'miyoscarada':'Meowscarada','mioscarata':'Meowscarada','miyauskarada':'Meowscarada',
      'clefky':'Klefki','krocadile':'Krookodile','krucadile':'Krookodile','krugadile':'Krookodile',
      'ripuire':'Rhyperior','ripurier':'Rhyperior','riperior':'Rhyperior','persir':'Perrserker','pursuer':'Perrserker',
      'quack of owl':'Quaquaval','quackaval':'Quaquaval','cliot sir':'Clawitzer','kleitzer':'Clawitzer','quiet sir':'Clawitzer',
      'conchelter':'Conkeldurr','mabostif':'Mabosstiff','mebostif':'Mabosstiff','mebastev':'Mabosstiff',
      'simacer':'Simisear','cerelej':'Ceruledge','lasikin':'Blaziken',
      'a skeleton m':'Basculegion Male','ferigoraf':'Farigiraf','threigorf':'Farigiraf',
      'clevore':'Kleavor','kinggiscon':'Kangaskhan','kangaskon':'Kangaskhan','cangascon':'Kangaskhan',
      'riper':'Rhyperior','ripuer':'Rhyperior','banet':'Banette','bonett':'Banette',
      'coffigus':'Cofagrigus','conkeldor':'Conkeldurr','simopor':'Simipour','vivellon':'Vivillon Icy Snow Pattern',
      'quack waval':'Quaquaval','quakueval':'Quaquaval',
      'ferigraph':'Farigiraf','quakuevow':'Quaquaval','quakovale':'Quaquaval',
      'client sir':'Clawitzer','clients are':'Clawitzer','cafrgus':'Cofagrigus',
      'conkeler':'Conkeldurr','concletter':'Conkeldurr','simopur':'Simipour',
      'simapore':'Simipour','cimapore':'Simipour','mabostef':'Mabosstiff',
      'thorigoraf':'Farigiraf','ripuria':'Rhyperior','quakwal':'Quaquaval',
      'kliitsr':'Clawitzer','falitzer':'Clawitzer','alitzer':'Clawitzer',
      'kartha gregus':'Cofagrigus','semapur':'Simipour',
      'vasculation':'Basculegion Male','for rigora':'Farigiraf','thigorath':'Farigiraf',
      'cereleich':'Ceruledge','seriledge':'Ceruledge','kafagas':'Cofagrigus',
      'quakoval':'Quaquaval','quakwaval':'Quaquaval','wakwavell':'Quaquaval',
      'fowregoraf':'Farigiraf','clyde sir':'Clawitzer','cliotus':'Clawitzer','kaffa grigus':'Cofagrigus',
      'the regraph':'Farigiraf','theregarath':'Farigiraf','farregaraf':'Farigiraf','fabricorath':'Farigiraf',
      'serelage':'Ceruledge','serelich':'Ceruledge','erilage':'Ceruledge',
      'kothagus':'Cofagrigus','cophagus':'Cofagrigus'
    };
    for(const [spoken,name] of Object.entries(speechAliases)) {
      const species=catalog.find(s=>s.name===name);if(!species)continue;
      add(spoken,species);
      // These two names vary heavily between transcriptions. Permit only the
      // existing small edit budget on their longer, validated spellings.
      const spokenKey=normalize(spoken);
      if(['Farigiraf','Ceruledge'].includes(species.id)&&spokenKey.length>=7){
        learnedFuzzyAliases.add(spokenKey);if(!fuzzyAliases.includes(spokenKey))fuzzyAliases.push(spokenKey);
      }
      // Natural qualifiers work before or after the learned base pronunciation.
      for(const form of catalog.filter(p=>!p.isMega&&p.name.startsWith(species.name+' '))){
        const suffix=form.name.slice(species.name.length+1).replace(/ (Form|Forme|Variety|Pattern)$/,'');
        add(spoken+' '+suffix,form);
      }
      for(const [region,variants] of Object.entries({Alolan:['alolan','alola','alolin','olin'],Galarian:['galarian','gallerian','galerian','galerians','glarion','valyrian','valerian'],Hisuian:['hisuian','hissuian','his suian','hisuyan','h'],Paldean:['paldean']})){
        const form=catalog.find(p=>p.name===region+' '+species.name);if(!form)continue;
        for(const qualifier of variants){add(qualifier+' '+spoken,form);add(spoken+' '+qualifier,form);}
      }
      // Carry learned pronunciations into explicitly qualified Mega names.
      if(!species.isMega)for(const mega of catalog.filter(s=>s.isMega)){
        const base=mega.name.replace(/^Mega /,'');
        if(base===species.name)add('mega '+spoken,mega);
        for(const suffix of ['X','Y','Z'])if(base===species.name+' '+suffix)add('mega '+spoken+' '+suffix,mega);
      }
    }
    for(const species of catalog){
      const region=species.name.match(/^(Alolan|Galarian|Hisuian|Paldean) (.+)$/);if(!region)continue;
      const variants={Alolan:['alolan','alola','alolin'],Galarian:['galarian','gallerian','galerian','galerians','glarion','valyrian','valerian'],Hisuian:['hisuian','hissuian','his suian','hisuyan','h'],Paldean:['paldean']}[region[1]];
      for(const q of variants){add(q+' '+region[2],species);add(region[2]+' '+q,species);}
    }
    for(const stem of ['baskyn','basky legion','as gilligion','ask illegion','ask allegian','asciligian','vasclegian','basilgian','basiligian','dascalesian','vascular','vascular legion','mascular legion','vasculation','masculation','baskillegion','bascalesian','vasculigen']){
      for(const gender of ['Male','Female']){
        const species=catalog.find(p=>p.name==='Basculegion '+gender);if(!species)continue;
        add(stem+' '+gender,species);add(gender+' '+stem,species);add(gender[0]+' '+stem,species);
        if(gender==='Male'){add(stem+' mail',species);add(stem+' m',species);}else add(stem+' f',species);
      }
    }
    for(const [breed,variants] of Object.entries({Aqua:['tauros','taros','taurus','toros'],Blaze:['tauros','torres','toros'],Combat:['tauros','toros']})){
      const species=catalog.find(p=>p.name===`Paldean Tauros ${breed} Breed`);
      if(species)for(const spoken of variants)add(spoken+' '+breed,species);
    }
    const resolve=key=>aliases.get(key)?.slice().sort((a,b)=>Number(b.canonical)-Number(a.canonical) || rank(b.species)-rank(a.species) || a.species.name.localeCompare(b.species.name))[0]?.species;
    return text=>{
      const words=String(text).normalize('NFKD').toLowerCase().match(/[a-z0-9]+/g) || [],found=[],occupied=new Set();
      // Resolve spoken form qualifiers before an exact base name can consume them.
      const regional={alolan:'Alolan',alola:'Alolan',alolin:'Alolan',olin:'Alolan',
        galarian:'Galarian',gallerian:'Galarian',galerian:'Galarian',galerians:'Galarian',glarion:'Galarian',valyrian:'Galarian',valerian:'Galarian',
        hisuian:'Hisuian',hissuian:'Hisuian',hisuyan:'Hisuian',paldean:'Paldean'};
      for(let start=0;start<words.length-1;start++) {
        if(occupied.has(start))continue;
        const makeMega=words[start]==='make'&&words[start+1]==='a';
        const splitHisui=words[start]==='his'&&words[start+1]==='suian';
        const form=makeMega?'Mega':splitHisui?'Hisuian':regional[words[start]],offset=makeMega||splitHisui?2:1;if(!form)continue;
        for(let end=Math.min(words.length,start+6);end>start+offset;end--) {
          const species=resolve(normalize(form)+words.slice(start+offset,end).join(''));if(!species)continue;
          found.push({species,start,end,exact:false});for(let i=start;i<end;i++)occupied.add(i);break;
        }
      }
      // Exact longest names first: never turn Mega Charizard Y into Charizard.
      for(let start=0;start<words.length;start++) {
        if(occupied.has(start))continue;
        for(let end=Math.min(words.length,start+7);end>start;end--) {
          if(Array.from({length:end-start},(_,i)=>start+i).some(i=>occupied.has(i)))continue;
          const key=words.slice(start,end).join(''),species=resolve(key);if(!species)continue;
          found.push({species,start,end,exact:true});for(let i=start;i<end;i++)occupied.add(i);start=end-1;break;
        }
      }
      // Conservative fuzzy matching only for uncovered words and unambiguous names.
      // STT sometimes glues two complete names together. Split only when both
      // halves are known aliases, at least six characters, with one unique result.
      for(let start=0;start<words.length;start++){
        if(occupied.has(start))continue;
        const word=words[start],pairs=new Map();
        for(let split=6;split<=word.length-5;split++){
          const left=resolve(word.slice(0,split));if(!left)continue;
          // A shared boundary letter may be emitted only once: kafagus+simopor.
          for(const overlap of [0,1]){
            const tail=word.slice(split-overlap);if(tail.length<6)continue;
            const right=resolve(tail);if(!right||left.id===right.id)continue;
            pairs.set(left.id+'|'+right.id,[left,right]);
          }
        }
        if(pairs.size!==1)continue;
        for(const species of pairs.values().next().value)found.push({species,start,end:start+1,exact:true});
        occupied.add(start);
      }
      for(let start=0;start<words.length;start++) {
        if(occupied.has(start))continue;
        let best=null;
        for(let end=start+1;end<=Math.min(words.length,start+5) && !occupied.has(end-1);end++) {
          const key=words.slice(start,end).join('');if(key.length<6)continue;
          const limit=key.length>=10 ? 2 : 1,candidates=new Map();
          for(const alias of fuzzyAliases) {
            if(learnedFuzzyAliases.has(alias)&&key.length<7)continue;
            const delta=distance(key,alias,limit);if(delta>limit)continue;
            const species=resolve(alias),previous=candidates.get(species.id);
            if(!previous || delta<previous.delta)candidates.set(species.id,{species,delta});
          }
          const ordered=[...candidates.values()].sort((a,b)=>a.delta-b.delta);
          if(!ordered.length || ordered[1]?.delta===ordered[0].delta)continue;
          const row={...ordered[0],start,end,exact:false};
          if(!best || row.delta<best.delta || row.delta===best.delta && end>best.end)best=row;
        }
        if(best){found.push(best);for(let i=start;i<best.end;i++)occupied.add(i);start=best.end-1;}
      }
      const unique=new Set();
      return found.sort((a,b)=>a.start-b.start).filter(row=>{if(unique.has(row.species.id))return false;unique.add(row.species.id);return true;});
    };
  }
  class Controller {
    constructor({button,status,catalog,rank,add,active}) {
      Object.assign(this,{button,status,add,active});this.match=matcher(catalog,rank);
      this.Recognition=window.SpeechRecognition || window.webkitSpeechRecognition;
      this.permission='unknown';this.declined=false;this.want=null;this.session=null;this.held=false;this.timer=null;
      this.failed=false;this.isFirefox=/\bFirefox\/\d+/i.test(navigator.userAgent);
      this.createFirefoxHelp();this.createDialog();this.sync();
      button.addEventListener('pointerdown',event=>event.preventDefault());
      button.addEventListener('click',()=>{if(this.want)this.stop();else this.start('toggle');});
      document.addEventListener('keydown',event=>this.keydown(event));
      document.addEventListener('keyup',event=>{if(event.code==='Space' && this.held){event.preventDefault();this.release();}});
      window.addEventListener('blur',()=>{if(this.permission==='unknown' && this.session)this.release();else this.cancel();});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();});
      // This read-only permission query never asks to use the microphone.
      Promise.resolve().then(()=>navigator.permissions?.query({name:'microphone'})).then(permission=>{
        if(!permission)return;
        const update=()=>{this.permission=permission.state==='prompt' ? 'unknown' : permission.state;if(this.permission==='denied')this.cancel();this.sync();};
        update();permission.addEventListener?.('change',update);
      }).catch(()=>{});
    }
    get disabled(){return !this.Recognition || this.permission==='denied' || this.declined;}
    say(message){this.status.textContent=message;this.status.hidden=!message;}
    sync() {
      const state=this.disabled ? 'disabled' : this.want ? 'listening' : 'idle';
      this.button.dataset.state=state;this.button.disabled=this.disabled;this.button.setAttribute('aria-pressed',String(state==='listening'));
      const reason=!this.Recognition ? '\nVoice recognition is unavailable in this browser.' : this.permission==='denied' ? '\nMicrophone access is blocked. Change this site’s microphone permission in your browser to enable it.' : this.declined ? '\nVoice input is disabled for this visit. Reload to enable it.' : '';
      this.firefoxHelp.hidden=!(this.isFirefox && (!this.Recognition || this.permission==='denied' || this.failed));
      this.button.dataset.quickTooltip=hover+reason;
      this.button.setAttribute('aria-label',state==='listening' ? 'Stop opponent voice input' : state==='disabled' ? 'Opponent voice input disabled' : 'Add opponents by voice');
    }
    createFirefoxHelp() {
      this.firefoxHelp=document.createElement('div');this.firefoxHelp.className='status-note firefox-voice-help';this.firefoxHelp.hidden=true;
      this.firefoxHelp.innerHTML='<strong>Enable Voice in Firefox</strong><p>Update Firefox, then go to <b>Settings → AI Controls → Speech recognition → Enabled</b>, if available.</p><p>Allow this site’s microphone and accept Firefox’s speech-model download if prompted. Reload this page and try again.</p><details><summary>Older Firefox Versions</summary><p>On desktop Firefox, open <code>about:config</code> and set <code>media.webspeech.recognition.enable</code> and <code>media.webspeech.recognition.force_enable</code> to <b>true</b> if those preferences exist. If recognition starts then stops, update Firefox.</p></details><a href="https://support.mozilla.org/en-US/kb/speech-recognition-firefox" target="_blank" rel="noopener noreferrer">Firefox Setup Guide</a>';
      this.status.after(this.firefoxHelp);
    }
    createDialog() {
      this.dialog=document.createElement('dialog');this.dialog.className='voice-consent-dialog';this.dialog.id='opponentVoiceConsent';this.dialog.setAttribute('aria-labelledby','opponentVoiceTitle');
      this.dialog.innerHTML='<h2 id="opponentVoiceTitle">Add Opponents by Voice</h2><p>Say a group of names, like “Kingambit, Sneasler, and Mega Charizard Y.”</p><p>Click the microphone to toggle listening, or hold Space for half a second. Would you like to allow microphone access?</p><small>Speech is handled by your browser’s voice service.</small><div class="inline-actions"><button type="button" class="mini-button" data-voice-decline>Not Now</button><button type="button" class="mini-button" data-voice-allow>Allow Microphone</button></div>';
      document.body.append(this.dialog);
      const decline=()=>{this.declined=true;this.dialog.close();this.cancel();this.sync();};
      this.dialog.querySelector('[data-voice-decline]').onclick=decline;
      this.dialog.addEventListener('cancel',event=>{event.preventDefault();decline();});
      this.dialog.querySelector('[data-voice-allow]').onclick=()=>{this.dialog.close();this.start(this.held ? 'hold' : 'toggle');};
    }
    keydown(event) {
      if(event.code!=='Space' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !this.active() || this.disabled)return;
      const target=event.target;
      if(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]') || target.closest('button,a,summary') && target!==this.button || document.querySelector('dialog[open]'))return;
      if(event.defaultPrevented)return;
      event.preventDefault();if(this.held || event.repeat)return;
      this.held=true;
      this.timer=setTimeout(()=>{
        this.timer=null;if(!this.held || !this.active() || this.disabled)return;
        if(this.permission!=='granted' && !this.session) {if(!this.dialog.open)this.dialog.showModal();return;}
        if(!this.want)this.start('hold');
      },500);
    }
    release(){clearTimeout(this.timer);this.timer=null;this.held=false;if(this.want==='hold')this.stop();}
    cancel(){this.release();this.stop();}
    start(mode) {
      if(this.disabled || !this.active())return;
      this.want=mode;this.sync();if(this.session)return;
      const recognition=new this.Recognition(),session={recognition,seen:new Set(),stopping:false,matched:false};this.session=session;
      recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=5;
      recognition.onstart=()=>{
        if(this.session!==session)return;
        this.failed=false;this.permission='granted';this.sync();
        if(!this.want || !this.active()){this.stop();return;}
        this.say('Listening…');
      };
      recognition.onresult=event=>{
        if(this.session!==session || !this.active())return;
        for(let index=event.resultIndex;index<event.results.length;index++) {
          const result=event.results[index];if(!result.isFinal || session.seen.has(index))continue;
          session.seen.add(index);
          const alternatives=Array.from(result).map(alternative=>({transcript:alternative.transcript,matches:this.match(alternative.transcript)}));
          alternatives.sort((a,b)=>b.matches.reduce((score,row)=>score+(row.end-row.start)*(row.exact ? 3 : 1),0)-a.matches.reduce((score,row)=>score+(row.end-row.start)*(row.exact ? 3 : 1),0));
          const best=alternatives[0],names=best?.matches.map(row=>row.species.name) || [];
          if(names.length){session.matched=true;this.add(names);this.say('Added '+names.join(', ')+'.');}
          else this.say(best?.transcript ? `Heard “${best.transcript.trim()}”. No Pokémon names recognized. Try their full names.` : 'No Pokémon names recognized. Try their full names.');
        }
      };
      recognition.onerror=event=>{
        if(this.session!==session)return;
        if(event.error==='no-speech')return;
        this.failed=true;this.want=null;
        if(event.error==='not-allowed'){this.permission='denied';this.say('Speech input permission was denied. Check browser and microphone permissions (not-allowed).');}
        else {
          const messages={
            'network':'The browser’s speech service could not connect (network). Try Chrome, or check your connection and VPN.',
            'service-not-allowed':'The browser’s speech recognition service is unavailable or blocked (service-not-allowed). Microphone access may still be allowed.',
            'audio-capture':'The browser could not capture microphone audio (audio-capture). Check the selected microphone and system permissions.',
            'language-not-supported':'The browser’s speech service does not support US English (language-not-supported).',
            'aborted':'The browser cancelled speech recognition (aborted). Click the microphone to try again.'
          };
          this.say(messages[event.error] || `Speech recognition failed (${event.error || 'unknown error'}). Click the microphone to try again.`);
        }
        this.sync();
      };
      recognition.onend=()=>{
        if(this.session!==session)return;
        this.session=null;this.sync();
        if(this.want && this.active() && !this.disabled)setTimeout(()=>{if(this.want)this.start(this.want);},100);
      };
      try {recognition.start();}catch(error){this.failed=true;this.session=null;this.want=null;this.say(`Speech recognition could not start (${error.name || 'unknown error'}). Click the microphone to try again.`);this.sync();}
    }
    stop() {
      this.want=null;this.sync();const session=this.session;
      if(session && !session.stopping){session.stopping=true;try{session.recognition.stop();}catch{session.stopping=false;}}
    }
  }
  window.OpponentVoice={Controller,matcher};
})();
