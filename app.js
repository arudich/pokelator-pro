const STORAGE_KEY = 'pokelator-pro-team';
const PREFERENCES_KEY = 'pokelator-pro-preferences-v1';
const LIBRARY_KEY = 'pokelator-pro-teams-v1';
const BUILDER_SETTINGS_KEY = 'pokelator-pro-builder-v1';
const UI_SETTINGS_KEY = 'pokelator-pro-ui-v1';
const COLOR_DEFAULTS_KEY = 'pokelator-pro-color-defaults-v1';
const APP_COLOR_OPTIONS = [
  ['bg','Page background','#101827'],['bg-strong','Deep background','#70d7ff'],['control-bg','Control background','#0c1320'],
  ['panel','Panels','#172334'],['panel-alt','Secondary panels','#1b2a40'],['panel-soft','Raised surfaces','#233852'],
  ['soft-border','Borders','#2f4565'],['text','Text','#edf3ff'],['muted','Secondary text','#9fb5d0'],
  ['accent','Accent','#6cc3ff'],['accent-strong','Active buttons','#64a6ff'],
  ['toolbar-accent','Toolbar Accent','#9cd67f'],['toolbar-button','Toolbar Active','#2b83d7'],
  ['success','Positive','#4ad7a5']
];
const uiSettings = loadUISettings();
const siteColorDefaults = loadColorDefaults(uiSettings);
const itemHighlightColors = {...uiSettings.itemHighlightColors};
const appColors = {...uiSettings.appColors};
const lockedItemColors = {...itemHighlightColors};
const lockedAppColors = {...appColors};
const MAX_TEAM_POINTS = 66;
const MAX_STAT_POINTS = 32;
const ABILITY_USAGE_THRESHOLD = 50;
const NATURE_USAGE_THRESHOLD = 50;
const rosterSnapshot = window.CHAMPIONS_ROSTER;
const pokerData = PokemonForms.catalog(rosterSnapshot);
const cosmeticPokemon=(rosterSnapshot.cosmeticForms || []).flatMap(form=>{
  const base=pokerData.find(species=>species.id===form.baseId);
  return base ? [{...base,...form,calcId:base.calcId || base.id,cosmeticBaseId:base.id}] : [];
});
const pokemonCatalog=[...pokerData,...cosmeticPokemon];
function pokedexNumber(species) {
  let id=species.cosmeticBaseId || species.calcId || species.id;
  while(id) {
    const number=window.POKEDEX_NUMBERS?.[calc.toID(id)];
    if(Number.isInteger(number)) return number;
    const suffix=id.lastIndexOf('-');
    if(suffix<0) break;
    id=id.slice(0,suffix);
  }
}
const builderReferences=new ReferenceSets(pokemonCatalog.map(species=>species.id));
const ordinaryForms=new Map();
const megaFormChoices=new Map();
function megaBaseSpecies(species) {
  return species?.isMega ? getPokemonByName(Battle.generation.species.get(calc.toID(species.calcId||species.id))?.baseSpecies) || species : species;
}
function availableMegaForms(species) {
  const base=megaBaseSpecies(species);if(!base)return [];
  if(!megaFormChoices.has(base.id))megaFormChoices.set(base.id,pokerData.filter(p=>p.isMega&&megaBaseSpecies(p)?.id===base.id));
  return megaFormChoices.get(base.id);
}
function megaFormForStone(species, stone) {
  return stone ? availableMegaForms(species).find(form=>Battle.requiredMegaItem(form)===stone) : undefined;
}
const natureOptions = Battle.natureOptions;
const itemOptions = [...Battle.generation.items].map(item => item.name);
const statOrder = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const statLabels = { hp: 'HP', atk: 'ATK', def: 'DEF', spa: 'SPA', spd: 'SPD', spe: 'SPE' };

function pokemonDisplayName(entry) { return entry?.nickname || entry?.name || ''; }
function canonicalItem(value) {
  const key=calc.toID(String(value || ''));
  return key ? itemOptions.find(name=>calc.toID(name)===key) ?? null : '';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}
function getPokemonRoster() { return pokemonCatalog; }
function getPokemonByName(name) {
  const key = String(name || '').trim().toLowerCase();
  if(PokemonForms.alias(key)) return pokemonCatalog.find(p=>p.id==='Aegislash-Blade');
  if(/^castform(?:[- ](?:sunny|rainy|snowy)(?: form)?)?$/.test(key))return pokemonCatalog.find(p=>p.id==='Castform');
  return pokemonCatalog.find(p => p.name.toLowerCase() === key || p.id.toLowerCase() === key) || null;
}
function savedSpecies(entry) {
  if(entry?.stats) return entry;
  return pokemonCatalog.find(species=>species.id===entry?.id) || getPokemonByName(entry?.name);
}
function battleSpecies(entry,side='opponent') {
  const species=savedSpecies(entry);
  if(PokemonForms.isCastform(species)){
    const base=getPokemonByName('Castform'),prefs=getPreferences(base,side);
    const ability=side==='opponent'?(prefs.abilityChoice==='auto'?'Forecast':prefs.abilityChoice)
      :entry.ability??state.ourTeam.find(p=>p.id==='Castform')?.ability??'Forecast';
    const other=side==='our'?state.opponentList[state.activeOpponentIndex]:state.ourTeam[state.activeOurIndex];
    const otherAbility=other&&!PokemonForms.isCastform(savedSpecies(other))
      ?side==='our'?appliedOpponentAbility(other):battleEntry(other).ability:'';
    const weather=['Air Lock','Cloud Nine'].includes(otherAbility)?'':state.weather;
    return Battle.forecastSpecies(base,ability,weather);
  }
  if(!species || species.originalName || species.selectedMegaFromBase)return species;
  if(!species.isMega){
    const formId=side==='opponent' ? getPreferences(species,side).megaFormId : '';
    const mega=side==='our' ? megaFormForStone(species,entry.item)
      : formId && availableMegaForms(species).find(form=>form.id===formId);
    if(mega && (side!=='our' || getPreferences(entry,side).megaActive)) {
      return {...mega,id:species.id,calcId:mega.id,megaStoneName:Battle.requiredMegaItem(mega),selectedMegaFromBase:true};
    }
  }
  if(PokemonForms.isAegislash(species)) {
    const canonical=getPokemonByName('Aegislash');
    return getPreferences(canonical,side).bladeActive ? canonical : PokemonForms.shield(rosterSnapshot,canonical);
  }
  if(!species.isMega || getPreferences(species,side).megaActive) return species;
  if(!ordinaryForms.has(species.id)){
    const base=megaBaseSpecies(species);
    ordinaryForms.set(species.id,{...base,id:species.id,calcId:base.id,originalName:species.name});
  }
  return ordinaryForms.get(species.id);
}
function ordinaryAbility(species,entry) {
  const choice=getPreferences(species,'our').baseAbilityChoice;
  if(choice!=='auto') return species.abilities.includes(choice) ? choice : '';
  if(entry.ability!==undefined && (entry.ability==='' || entry.ability==='No Ability' || species.abilities.includes(entry.ability))) return entry.ability;
  const rows=(getUsage(species)?.abilities || []).filter(row=>species.abilities.includes(row.name)).sort((a,b)=>b.percent-a.percent);
  return rows[0]?.name || species.abilities[0];
}
function battleEntry(entry,species=battleSpecies(entry,'our')) {
  if(species?.selectedMegaFromBase) return {...entry,ability:species.abilities[0],item:Battle.requiredMegaItem(species)};
  if(species?.originalName) return {...entry,ability:ordinaryAbility(species,entry),item:Battle.requiredMegaItem(getPokemonByName(species.originalName))};
  return entry;
}
function getPokemonImage(name) {
  const species = /^Castform (Sunny|Rainy|Snowy) Form$/.test(name)?rosterSnapshot.pokemon.find(p=>p.name===name)
    :name==='Aegislash Shield Forme' ? rosterSnapshot.pokemon.find(p=>p.id==='Aegislash') : getPokemonByName(name);
  return species ? new URL(species.image, 'https://championsbattledata.com/').href : '';
}
const compactStatLabels={hp:'HP',atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe'};
function baseStatValue(species,stat) {
  return stat==='hp' && species.stats.hp===1 ? 1 : species.stats[stat]-(stat==='hp' ? 75 : 20);
}
const baseStatColorScales=Object.fromEntries(statOrder.map(stat=>{
  // Count each playable form once and exclude cosmetic variants.
  const values=pokerData.map(species=>baseStatValue(species,stat)).sort((a,b)=>a-b);
  const percentile=fraction=>{
    const index=(values.length-1)*fraction,low=Math.floor(index),high=Math.ceil(index);
    return values[low]+(values[high]-values[low])*(index-low);
  };
  return [stat,[
    [Math.min(40,percentile(.05)),'#dc4d5a'],
    [percentile(.45),'#ebcd69'],
    [percentile(.80),'#7aca75'],
    [percentile(.95),'#279d59']
  ]];
}));
function baseStatColor(stat,value) {
  const stops=baseStatColorScales[stat];
  if(value<=stops[0][0]) return stops[0][1];
  for(let index=1;index<stops.length;index++) {
    const [high,to]=stops[index];
    if(value>high) continue;
    const [low,from]=stops[index-1];
    const weight=(high-value)/(high-low)*100;
    return `color-mix(in oklab, ${from} ${weight.toFixed(1)}%, ${to})`;
  }
  return stops.at(-1)[1];
}
function baseStatsMarkup(species) {
  const labels=compactStatLabels;
  const values=statOrder.map(stat=>[stat,baseStatValue(species,stat)]);
  const description=`${species.name} base stats: ${values.map(([stat,value])=>`${labels[stat]} ${value}`).join(' · ')}. Before investment, nature and stat stages.`;
  return `<div class="base-stat-strip" role="group" aria-label="${escapeHtml(description)}" title="Base stats before investment, nature and stat stages.">
    ${values.map(([stat,value])=>`<span class="base-stat" data-base-stat="${stat}" data-base-value="${value}" style="--stat-fill:${Math.min(100,value/255*100).toFixed(1)}%;--stat-color:${baseStatColor(stat,value)}"><span class="base-stat-label">${labels[stat]}</span><strong>${value}</strong><i aria-hidden="true"></i></span>`).join('')}
  </div>`;
}

function ourStatsMarkup(entry,species) {
  const description=`${species.name} level 50 stats with this build’s investment and nature, before battle modifiers.`;
  return `<dl class="raw-stat-strip" aria-label="${escapeHtml(description)}" title="${escapeHtml(description)}">
    ${statOrder.map(stat=>`<div><dt>${compactStatLabels[stat]}</dt><dd data-raw-stat="${stat}">${Battle.effectiveStat(species,entry,stat)}</dd></div>`).join('')}
  </dl>`;
}

function opponentStatsMarkup(species,legendId) {
  return `<div class="opponent-stat-ranges" role="group" aria-label="${escapeHtml(species.name)} level 50 stat ranges" ${legendId ? `tabindex="0" aria-describedby="${legendId}"` : ''}>
    ${legendId ? `<div id="${legendId}" class="range-legend" role="tooltip">
      <span class="range-lowered">− Nature</span>
      <span class="range-neutral">Neutral · 0–32 SP</span>
      <span class="range-boosted">+ Nature</span>
    </div>` : ''}
    ${statOrder.map(stat=>{
      const label=compactStatLabels[stat],investment={[stat]:MAX_STAT_POINTS};
      const neutralMin=Battle.effectiveStat(species,{},stat);
      const neutralMax=Battle.effectiveStat(species,{investment},stat);
      const point=(kind,value)=>`<span class="opponent-range-point" data-point="${kind}">${value}<i class="opponent-range-marker" aria-hidden="true"></i></span>`;
      const neutral=point('neutral-min',neutralMin);
      let scale,details;
      if(stat==='hp') {
        details=neutralMin===neutralMax ? `Fixed at ${neutralMin}` : `${neutralMin} at 0 SP, ${neutralMax} at ${MAX_STAT_POINTS} SP`;
        scale=neutralMin===neutralMax ? `<span class="opponent-range-fixed">${neutral}</span>`
          : `<span class="opponent-range-segment range-neutral">${neutral}${point('neutral-max',neutralMax)}</span>`;
      } else {
        const other=stat==='atk' ? 'spa' : 'atk';
        const min=Battle.effectiveStat(species,{nature:{plus:other,minus:stat}},stat);
        const max=Battle.effectiveStat(species,{nature:{plus:stat,minus:other},investment},stat);
        details=`${min} at 0 SP with a lowering nature, ${neutralMin}–${neutralMax} at 0–${MAX_STAT_POINTS} SP with a neutral nature, ${max} at ${MAX_STAT_POINTS} SP with a boosting nature`;
        scale=`<span class="opponent-range-segment range-lowered" style="--range-size:${neutralMin-min}">${point('min',min)}</span>
          <span class="opponent-range-segment range-neutral" style="--range-size:${neutralMax-neutralMin}">${neutral}${point('neutral-max',neutralMax)}</span>
          <span class="opponent-range-segment range-boosted" style="--range-size:${max-neutralMax}">${point('max',max)}</span>`;
      }
      const description=`${label}. ${details}.`;
      return `<div class="opponent-stat" data-range-stat="${stat}" role="img" aria-label="${description}">
        <span class="opponent-stat-label">${label}</span><span class="opponent-range-scale">${scale}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function megaStatComparisonMarkup(entry,species) {
  const saved=savedSpecies(entry);
  const forms=availableMegaForms(saved);
  const mega=species.isMega ? species : saved.isMega ? saved : megaFormForStone(saved,entry.item) || (forms.length===1 ? forms[0] : null);
  if(!mega) return '';
  const base=megaBaseSpecies(saved);
  const label=`Mega change · ${base.name} → ${mega.name}`;
  return `<div class="mega-stat-comparison"><span title="${escapeHtml(label)}">Mega change</span>
    <dl class="raw-stat-strip" aria-label="${escapeHtml(label)}">${statOrder.map(stat=>{
      const before=Battle.effectiveStat(base,entry,stat),after=Battle.effectiveStat(mega,entry,stat);
      const change=after-before;
      const value=change ? `${change<0 ? '−' : '+'}${Math.abs(change)}` : '0';
      return `<div title="${compactStatLabels[stat]} ${before} → ${after}"><dt>${compactStatLabels[stat]}</dt><dd class="${change<0 ? 'stat-nature-lowered' : change>0 ? 'stat-nature-boosted' : ''}" data-mega-stat="${stat}">${value}</dd></div>`;
    }).join('')}</dl></div>`;
}

const state = {
  ourTeam: [],
  activeOurIndex: 0,
  opponentList: [],
  activeOpponentIndex: 0,
  searchQuery: '',
  searchCursor: 0,
  searchResults: [],
  damageDirection: 'outgoing',
  format: uiSettings.format,
  metaMode: uiSettings.metaMode,
  weather: '',
  terrain: '',
  alliesFainted: 0,
  opponentsFainted: 0,
  preferences: loadPreferences(),
  opponentsExpanded: false,
  view: uiSettings.view, teamLibrary: [], activeTeamId: '', lastDeletedTeam: null,
  builderTopN: loadBuilderTopN(), builderPanel: uiSettings.builderPanel,
  teamOffenseExcluded: new WeakSet(), teamOffenseCustomized:false
};
const teamHistory = {past:[],future:[],present:null,signature:''};
const teamDraftInputs = new WeakSet();

function teamHistorySnapshot() {
  return {teams:structuredClone(state.teamLibrary),activeId:state.activeTeamId || state.teamLibrary[0]?.id,
    activeOurIndex:state.activeOurIndex,offenseCustomized:state.teamOffenseCustomized,
    excluded:state.ourTeam.flatMap((member,index)=>state.teamOffenseExcluded.has(member) ? [index] : [])};
}
function teamHistorySignature(snapshot) {
  return JSON.stringify(snapshot.teams.map(({id,name,pokemon})=>({id,name,
    pokemon:pokemon.map(({damageMultiplier,...build})=>build)})));
}
function recordTeamHistory() {
  const snapshot=teamHistorySnapshot();
  // Saving, selecting a member and switching teams do not create edit steps.
  const signature=teamHistorySignature(snapshot);
  if(teamHistory.present && signature!==teamHistory.signature) {
    teamHistory.past.push(teamHistory.present);
    if(teamHistory.past.length>100) teamHistory.past.shift();
    teamHistory.future=[];
  }
  teamHistory.present=snapshot;teamHistory.signature=signature;
}
function restoreTeamHistory(redo=false) {
  // Commit/close the focused editor before replacing its backing team objects.
  // Otherwise its blur handler can write the old input value into restored state.
  document.activeElement?.blur?.();
  const source=redo ? teamHistory.future : teamHistory.past;
  if(!source.length) return false;
  const snapshot=source.pop();
  (redo ? teamHistory.past : teamHistory.future).push(teamHistory.present);
  const previousArchives=new Map(state.teamLibrary.map(team=>[team.id,team.savedPokemon || []]));
  state.teamLibrary=structuredClone(snapshot.teams);
  for(const team of state.teamLibrary) {
    team.savedPokemon=[...new Map([...(team.savedPokemon || []),...(previousArchives.get(team.id) || [])].map(entry=>[entry.id,entry])).values()];
    rememberTeamPokemon(team,team.pokemon,true);
  }
  state.activeTeamId=snapshot.activeId;
  state.ourTeam=structuredClone(state.teamLibrary.find(team=>team.id===snapshot.activeId).pokemon);
  state.activeOurIndex=clamp(snapshot.activeOurIndex,0,Math.max(0,state.ourTeam.length-1));
  state.teamOffenseExcluded=new WeakSet(snapshot.excluded.map(index=>state.ourTeam[index]).filter(Boolean));
  state.teamOffenseCustomized=snapshot.offenseCustomized;
  state.lastDeletedTeam=null;
  document.getElementById('undoTeamDeleteButton').hidden=true;
  document.getElementById('teamShareLink').hidden=true;
  saveTeamToStorage(false);
  render();
  libraryMessage(redo ? 'Team change redone.' : 'Team change undone.');
  return true;
}
function bindTeamHistory() {
  document.addEventListener('input',event=>teamDraftInputs.add(event.target));
  document.addEventListener('change',event=>teamDraftInputs.delete(event.target));
  document.addEventListener('focusout',event=>teamDraftInputs.delete(event.target));
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase()!=='z' || event.isComposing) return;
    const target=event.target;
    // Keep the browser's text undo for drafts that have not been committed.
    if(target.isContentEditable || teamDraftInputs.has(target)) return;
    if(restoreTeamHistory(event.shiftKey)) event.preventDefault();
  });
}

function validHighlightColor(value,fallback='#70d7ff') {
  return /^#[\da-f]{6}([\da-f]{2})?$/i.test(value || '') ? value : fallback;
}
function loadColorDefaults(settings) {
  const current={...settings.appColors,...settings.itemHighlightColors};
  let saved;
  try {saved=JSON.parse(localStorage.getItem(COLOR_DEFAULTS_KEY) || 'null');} catch { /* Capture the current saved palette. */ }
  if(settings.correctLegacyDeepBackground && saved?.['bg-strong']==='#e5aa68') saved['bg-strong']=settings.appColors['bg-strong'];
  const defaults=Object.fromEntries(Object.entries(current).map(([key,value])=>[key,validHighlightColor(saved?.[key],value)]));
  try {localStorage.setItem(COLOR_DEFAULTS_KEY,JSON.stringify(defaults));} catch { /* Keep the reference palette in memory. */ }
  return defaults;
}

function loadUISettings() {
  let saved,defaults;
  try {defaults=JSON.parse(localStorage.getItem(COLOR_DEFAULTS_KEY) || 'null');} catch { /* Use built-in fallbacks. */ }
  try { saved = JSON.parse(localStorage.getItem(UI_SETTINGS_KEY) || '{}'); } catch { /* Use defaults. */ }
  const correctLegacyDeepBackground=saved?.deepBackgroundVersion!==2;
  const appColor=(key,fallback)=>{
    let baseline=defaults?.[key],value=saved?.appColors?.[key];
    if(key==='bg-strong' && correctLegacyDeepBackground) {
      if(baseline==='#e5aa68') baseline=fallback;
      if(value==='#e5aa68') value=fallback;
    }
    if((key==='accent-strong' && !saved?.toolbarColorsVersion) || (key==='toolbar-accent' && saved?.toolbarColorsVersion!==2)) value=fallback;
    return validHighlightColor(value,validHighlightColor(baseline,fallback));
  };
  return {correctLegacyDeepBackground,itemHighlightColors:{selected:validHighlightColor(saved?.itemHighlightColors?.selected,validHighlightColor(defaults?.selected)),other:saved?.colorEditorVersion===2 ? validHighlightColor(saved?.itemHighlightColors?.other,validHighlightColor(defaults?.other,'#3e7a91')) : validHighlightColor(defaults?.other,'#3e7a91')},
    appColors:Object.fromEntries(APP_COLOR_OPTIONS.map(([key,,fallback])=>[key,appColor(key,fallback)])),
    format:saved?.format === 'Singles' ? 'Singles' : 'Doubles',
    metaMode:saved?.metaMode!==false,
    view:saved?.view === 'builder' ? 'builder' : 'battle',
    builderPanel:['offense','team-offense','defense','balance'].includes(saved?.builderPanel) ? saved.builderPanel : 'speed'};
}
function saveUISettings() {
  try { localStorage.setItem(UI_SETTINGS_KEY,JSON.stringify({format:state.format,metaMode:state.metaMode,view:state.view,builderPanel:state.builderPanel,itemHighlightColors:lockedItemColors,appColors:lockedAppColors,colorEditorVersion:2,deepBackgroundVersion:2,toolbarColorsVersion:2})); }
  catch { /* Navigation still works when storage is unavailable. */ }
}
function renderFormatControls() {
  document.getElementById('metaModeToggle').setAttribute('aria-pressed',String(state.metaMode));
  document.getElementById('metaModeToggle').classList.toggle('active',state.metaMode);
  const meta=window.META_USAGE?.formats[state.format];
  document.getElementById('metaModeToggle').title=`Meta Mode weights all scoring of stat distributions by opposing Pokémon’s relative frequency in the meta. Source: ${meta?.month || 'unavailable'} Smogon Champions ${state.format} Showdown ladder, ${meta?.ratingCutoff || ''} rating weighting. Shared cosmetic forms split their measured weight; missing species have zero weight. Off gives every displayed Pokémon equal weight.`;
  for (const button of document.querySelectorAll('[data-format]')) {
    const active = button.dataset.format === state.format;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  }
  renderFaintedOptions();
}

function renderFaintedOptions() {
  const maximum=state.format==='Doubles' ? 3 : 5;
  const incoming=state.damageDirection==='incoming';
  for(const [field,id,label] of [['alliesFainted','offenseFaintedInput','fainted team members'],
    [incoming ? 'opponentsFainted' : 'alliesFainted','battleFaintedInput',incoming ? 'fainted opponents' : 'fainted team members'],
    ['opponentsFainted','defenseFaintedInput','fainted opponents']]) {
    state[field]=clamp(state[field],0,maximum);
    document.getElementById(id).setAttribute('aria-label',label);
    document.getElementById(id).innerHTML=Array.from({length:maximum+1},(_,value)=>`<button type="button" class="field-icon fainted-option" data-fainted-field="${field}" data-fainted-count="${value}" aria-pressed="${state[field]===value}" aria-label="${value} ${label}" title="${value} ${label}. Used for Supreme Overlord and Last Respects. ${state.format} allows up to ${maximum}."><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17H6a3 3 0 0 1-3-3v-3a9 9 0 0 1 18 0v3a3 3 0 0 1-3 3h-1v4H7z"/><circle cx="8" cy="11" r="2"/><circle cx="16" cy="11" r="2"/><path d="m11 15 1-2 1 2m-3 3v3m4-3v3"/></svg><span>${value}</span></button>`).join('');
  }
}

function loadBuilderTopN() {
  try {
    const value = JSON.parse(localStorage.getItem(BUILDER_SETTINGS_KEY) || 'null')?.topN;
    return Number.isInteger(value) && value > 0 ? value : 100;
  } catch { return 100; }
}

function builderRankLimit() {
  return Math.max(1,...pokerData.map(species => species.usage?.[state.format]?.rank || 0));
}

function builderRoster(selected, includeBaseMatches = true) {
  return [...pokerData,...cosmeticPokemon.filter(species=>builderReferences.has(species.id))].map(species=>battleSpecies(species,'opponent')).filter(species => builderReferences.only ? builderReferences.has(species.id)
    : builderReferences.has(species.id) || (includeBaseMatches && species.stats.spe === selected.stats.spe) ||
    (Number.isInteger(species.usage?.[state.format]?.rank) && species.usage[state.format].rank <= state.builderTopN));
}
function referenceAttributes(id) {
  return `data-reference-id="${escapeHtml(id)}" role="button" tabindex="0" aria-pressed="${builderReferences.has(id)}"`;
}
function tierSelectionControls() {
  return '<span class="tier-selection-controls"><button type="button" data-tier-select="all" title="Highlight every Pokémon in this tier">Select All</button><button type="button" data-tier-select="none" title="Remove highlights from this tier">Select None</button></span>';
}
function syncReferenceHighlights() {
  for(const icon of document.querySelectorAll('[data-reference-id]')) {
    const active=builderReferences.has(icon.dataset.referenceId);
    icon.classList.toggle('reference-highlighted',active);icon.setAttribute('aria-pressed',String(active));
  }
}
function renderReferenceControls() {
  document.getElementById('builderReferenceCount').textContent=builderReferences.active.ids.length;
  const only=document.getElementById('builderReferenceOnly');
  only.classList.toggle('active',builderReferences.only);only.setAttribute('aria-pressed',String(builderReferences.only));
  only.setAttribute('aria-label',`Show only highlighted Pokémon (${builderReferences.active.ids.length})`);
  document.getElementById('builderTopN').disabled=builderReferences.only;
  const button=document.getElementById('builderReferenceSetsButton');
  button.textContent=builderReferences.dirty ? 'Sets *' : 'Sets';
  button.title=`Highlight sets · ${builderReferences.active.name} · ${builderReferences.dirty ? 'unsaved draft; saved group unchanged' : 'saved'} · Ctrl+S or ⌘S saves this set`;
}
function referenceRosterSignature() {
  const selected=state.ourTeam[state.activeOurIndex];
  return selected ? builderRoster(battleSpecies(selected,'our'),state.builderPanel==='speed').map(species=>species.id).join('|') : '';
}
function updateReferences(change) {
  const before=referenceRosterSignature();change();
  renderReferenceControls();
  if(before!==referenceRosterSignature()) {
    cancelDefenseSearch();cancelOffenseThresholdSearch();cancelBalanceSearch();
    renderTeamBuilder();
  }
  syncReferenceHighlights();
  if(document.getElementById('builderReferenceSets').matches(':popover-open')) renderReferenceSets();
}
function renderReferenceSets() {
  const input=document.getElementById('builderReferenceSetName');
  if(document.activeElement!==input) input.value=builderReferences.active.name;
  document.getElementById('builderReferenceSetStatus').textContent=builderReferences.dirty ? 'Unsaved changes · saved group unchanged' : 'Saved';
  document.getElementById('builderReferenceSetStatus').title='The working draft survives reloads separately. Save replaces the loaded group; Save As creates a new group.';
  document.getElementById('builderReferenceSave').disabled=!builderReferences.dirty;
  document.getElementById('builderReferenceRevert').disabled=!builderReferences.dirty;
  document.getElementById('builderReferenceSetList').innerHTML=builderReferences.sets.map(set=>
    `<button type="button" class="reference-set-option${set.id===builderReferences.activeId ? ' active' : ''}" data-reference-set="${escapeHtml(set.id)}" aria-pressed="${set.id===builderReferences.activeId}"><span>${escapeHtml(set.name)}</span><small>${set.ids.length}</small></button>`).join('');
}
function bindReferenceControls() {
  const search=document.getElementById('builderReferenceSearch');
  bindUsagePicker(search,{kind:'pokemon',hint:'Reference highlights · search the full roster',
    choices:query=>buildSearchResults(query,true),
    markup:species=>pokemonChoiceMarkup(species)+(builderReferences.has(species.id) ? '<span class="choice-reference-check" aria-label="Highlighted">✓</span>' : ''),
    choose:species=>{
      search.value='';search.blur();
      updateReferences(()=>builderReferences.toggle(species.id,true));
      const icon=[...document.querySelectorAll('[data-reference-id]')].find(icon=>icon.dataset.referenceId===species.id);
      icon?.scrollIntoView({block:'center',behavior:'smooth'});
    }});
  const panel=document.getElementById('teamBuilderPanel');
  panel.addEventListener('click',event=>{
    const selection=event.target.closest('[data-tier-select]');
    if(selection) {
      const tier=selection.closest('.builder-tier-group,.builder-speed-tie');
      const ids=[...tier.querySelectorAll('[data-reference-id]')].map(icon=>icon.dataset.referenceId);
      updateReferences(()=>builderReferences.selectMany(ids,selection.dataset.tierSelect==='all'));
      return;
    }
    const icon=event.target.closest('[data-reference-id]');if(!icon) return;
    updateReferences(()=>builderReferences.toggle(icon.dataset.referenceId));
  });
  panel.addEventListener('keydown',event=>{
    const icon=event.target.closest('[data-reference-id]');
    if(icon && ['Enter',' '].includes(event.key)) {event.preventDefault();icon.click();}
  });
  document.addEventListener('keydown',event=>{
    if(state.view!=='builder' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
      || event.key.length!==1 || !event.key.trim() || document.querySelector('dialog[open]') || event.target.isContentEditable
      || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="combobox"],#builderReferenceSets')) return;
    event.preventDefault();search.value=event.key;search.focus();search.dispatchEvent(new Event('input',{bubbles:true}));
  });
  document.getElementById('builderReferenceOnly').addEventListener('click',()=>updateReferences(()=>{
    builderReferences.only=!builderReferences.only;builderReferences.save();
  }));
  document.getElementById('builderReferenceClear').addEventListener('click',()=>updateReferences(()=>builderReferences.clear()));
  const popup=document.getElementById('builderReferenceSets'),button=document.getElementById('builderReferenceSetsButton');
  button.addEventListener('click',()=>{
    if(popup.matches(':popover-open')) {popup.hidePopover();return;}
    closeUsagePicker();renderReferenceSets();popup.showPopover();
    const box=button.getBoundingClientRect();
    popup.style.left=`${clamp(box.right-popup.offsetWidth,8,Math.max(8,innerWidth-popup.offsetWidth-8))}px`;
    popup.style.top=`${clamp(box.bottom+7,8,Math.max(8,innerHeight-popup.offsetHeight-8))}px`;
  });
  document.getElementById('builderReferenceSetsClose').addEventListener('click',()=>popup.hidePopover());
  const name=document.getElementById('builderReferenceSetName');
  name.addEventListener('input',()=>{builderReferences.rename(name.value);renderReferenceSets();renderReferenceControls();});
  name.addEventListener('change',()=>{builderReferences.rename(name.value);name.value=builderReferences.active.name;renderReferenceSets();renderReferenceControls();});
  name.addEventListener('keydown',event=>{if(event.key==='Enter') {event.preventDefault();name.blur();}});
  const save=()=>{
    builderReferences.commit();name.value=builderReferences.active.name;renderReferenceSets();renderReferenceControls();
  };
  document.getElementById('builderReferenceSave').addEventListener('click',save);
  document.addEventListener('keydown',event=>{
    if(state.view!=='builder' || event.isComposing || event.altKey || event.shiftKey
      || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase()!=='s') return;
    event.preventDefault();save();
  });
  document.getElementById('builderReferenceRevert').addEventListener('click',()=>updateReferences(()=>builderReferences.load(builderReferences.activeId)));
  document.getElementById('builderReferenceSaveAs').addEventListener('click',()=>{
    builderReferences.copy();renderReferenceSets();renderReferenceControls();name.focus();name.select();
  });
  document.getElementById('builderReferenceDelete').addEventListener('click',()=>updateReferences(()=>builderReferences.remove()));
  document.getElementById('builderReferenceSetList').addEventListener('click',event=>{
    const set=event.target.closest('[data-reference-set]');if(!set) return;
    updateReferences(()=>builderReferences.load(set.dataset.referenceSet));
  });
}

function natureChoice(raw, field, legacyField) {
  const value = raw?.[field];
  if (value === true || value === false || value === 'auto') return value;
  // Existing saved flags are retained as overrides; the UI can restore usage defaults.
  return typeof raw?.[legacyField] === 'boolean' ? raw[legacyField] : 'auto';
}
function sanitizePreferences(raw = {}) {
  const megaFormId=typeof raw?.megaFormId==='string' ? raw.megaFormId : '';
  const itemChoice=raw?.scarfHighlighted===true ? 'Choice Scarf' : typeof raw?.itemChoice==='string' ? raw.itemChoice : '';
  const megaAbilityChoices=Object.fromEntries(Object.entries(raw?.megaAbilityChoices || {}).filter(([,choice])=>typeof choice==='string'));
  if(megaFormId && typeof raw?.megaAbilityChoice==='string' && !Object.hasOwn(megaAbilityChoices,megaFormId)) {
    megaAbilityChoices[megaFormId]=raw.megaAbilityChoice;
  }
  return {megaFormId,bladeActive:raw?.bladeActive!==false,megaActive:raw?.megaActive!==false,baseAbilityChoice:typeof raw?.baseAbilityChoice==='string' ? raw.baseAbilityChoice : 'auto',offenseStage:Number.isInteger(raw?.offenseStage) ? clamp(raw.offenseStage,-6,6) : 0,
    speedStage:Number.isInteger(raw?.speedStage) ? clamp(raw.speedStage,-2,2) : 0,
    builderOpponentOffenseStage:Number.isInteger(raw?.builderOpponentOffenseStage) ? clamp(raw.builderOpponentOffenseStage,-2,2) : 0,
    builderOpponentSpeedStage:Number.isInteger(raw?.builderOpponentSpeedStage) ? clamp(raw.builderOpponentSpeedStage,-2,2) : 0,
    defenseStage:Number.isInteger(raw?.defenseStage) ? clamp(raw.defenseStage,-6,6) : 0,
    defenseNatureChoice: natureChoice(raw, 'defenseNatureChoice', 'boostDefenseNature'),
    offenseNatureChoice: natureChoice(raw, 'offenseNatureChoice', 'boostOffenseNature'),
    itemChoice: megaFormId && Battle.generation.items.get(calc.toID(itemChoice))?.megaStone ? '' : itemChoice,
    megaAbilityChoices,
    abilityChoice: typeof raw?.abilityChoice === 'string' ? raw.abilityChoice : raw?.abilityAssumptionDisabled === true ? '' : 'auto'};
}
function loadPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key]) => /^(our|opponent):/.test(key))
      .map(([key, value]) => [key, sanitizePreferences(value)]));
  } catch { return {}; }
}
function getPreferences(entry, side) {
  if (!entry) return sanitizePreferences();
  if(PokemonForms.isAegislash(entry))entry=getPokemonByName('Aegislash');
  const key = `${side}:${entry.id}`;
  if (!state.preferences[key]) state.preferences[key] = sanitizePreferences(side === 'our' ? entry : {});
  return state.preferences[key];
}
function statStages(entry,side) {
  const prefs=getPreferences(entry,side);
  return {offense:prefs.offenseStage,defense:prefs.defenseStage};
}
function compactStages(role,label,value,description,disabled=false) {
  const limit=role==='builder-offense' ? 6 : 2;
  return `<fieldset class="compact-stage-control stat-stage-control${limit===6 ? ' compact-stage-wide' : ''}" ${disabled ? 'disabled' : ''}><legend>${label}</legend><div class="stat-stage-options compact-stage-options">${Array.from({length:2*limit+1},(_,index)=>index-limit).map(stage=>{
    const text=stage>0 ? `+${stage}` : stage<0 ? `−${-stage}` : '0';
    const factor=stage>=0 ? (2+stage)/2 : 2/(2-stage);
    const hint=`${description} Stage ${text}: ×${Number(factor.toFixed(3))}.`;
    return `<label class="stat-stage-option" title="${escapeHtml(hint)}"><input type="radio" name="compact-${role}" data-compact-stage="${role}" value="${stage}" aria-label="${escapeHtml(label)} stage ${stage}" ${stage===value ? 'checked' : ''} /><span>${text}</span></label>`;
  }).join('')}</div></fieldset>`;
}
function renderBuilderStages(selected) {
  const control=document.getElementById('builderStages');
  const panel=state.builderPanel,prefs=getPreferences(selected,'our');
  control.hidden=panel==='balance' || !selected;
  if(panel==='speed') {
    control.innerHTML=compactStages('builder-our-speed','Our Speed',prefs.speedStage,'Our selected Pokémon’s Speed; shared with Battle and remembered per Pokémon.')
      +compactStages('builder-opponent-speed','Op. Speed',prefs.builderOpponentSpeedStage,'Speed stage assumed for every opposing Pokémon in these tiers. Remembered for our selected Pokémon.');
  } else {
    const defense=panel==='defense';
    const teamStages=panel==='team-offense' ? teamOffenseSelected().map(({entry})=>getPreferences(entry,'our').offenseStage) : [];
    const offenseStage=panel==='team-offense' ? teamStages.every(stage=>stage===teamStages[0]) ? teamStages[0] : null : prefs.offenseStage;
    control.innerHTML=compactStages(defense ? 'builder-opponent-offense' : 'builder-offense',defense ? 'Opponent Atk / SpA' : 'Our Atk / SpA',
      defense ? prefs.builderOpponentOffenseStage : offenseStage,
      defense ? 'Attack and Sp. Atk stage assumed for all opposing attackers, not our defenses. Remembered for our selected Pokémon.'
      : panel==='team-offense' ? 'Our highlighted team members’ Attack and Sp. Atk stages; shared with the damage pane and remembered per Pokémon.' : 'Our selected Pokémon’s Attack and Sp. Atk stages; shared with the damage pane and remembered per Pokémon.');
  }
}
function renderStatStages(ours,theirs) {
  const outgoing=state.damageDirection==='outgoing';
  for(const role of ['attacker','defender']) {
    const ourSide=(role==='attacker')===outgoing,entry=ourSide ? ours : theirs;
    const control=document.getElementById(`${role}StageControl`),offense=role==='attacker';
    const stage=getPreferences(entry,ourSide ? 'our' : 'opponent')[offense ? 'offenseStage' : 'defenseStage'];
    control.disabled=!ours || !theirs;
    document.getElementById(`${role}StageLabel`).textContent=`${ourSide ? 'Our' : 'Opponent'} ${offense ? 'offense (Atk / SpA)' : 'defense (Def / SpD)'}`;
    control.querySelector('.stat-stage-options').innerHTML=Array.from({length:13},(_,index)=>{
      const value=index-6,label=value<0 ? `−${-value}` : `+${value}`;
      const factor=value>=0 ? (2+value)/2 : 2/(2-value);
      const title=`${label}: ×${Number(factor.toFixed(3))} ${offense ? 'Attack and Sp. Atk' : 'Defense and Sp. Def'}${value===0 ? ' (neutral)' : ''}`;
      return `<label class="stat-stage-option" title="${title}"><input type="radio" name="${role}Stage" value="${value}" data-stage-role="${role}"
        aria-label="${role==='attacker' ? 'Attacker offense' : 'Defender defense'} stage ${value>=0 ? '+' : ''}${value}" ${stage===value ? 'checked' : ''} /><span>${label}</span></label>`;
    }).join('');
  }
}
function getOpponentPreferences() {
  return getPreferences(state.opponentList[state.activeOpponentIndex], 'opponent');
}
function getAttackerPreferences() {
  return state.damageDirection === 'outgoing'
    ? getPreferences(state.ourTeam[state.activeOurIndex], 'our') : getOpponentPreferences();
}
function savePreferences() {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(state.preferences)); }
  catch { document.getElementById('storageStatus').textContent = 'Storage unavailable; changes last for this tab'; }
}
function getUsage(species, format = state.format) { return species.usage?.[format] || null; }
function natureUsage(opponent, stat) {
  const species = opponent && battleSpecies(opponent,'opponent');
  const rows = species ? getUsage(species)?.natures || [] : [];
  let found = false, percent = 0;
  for (const row of rows) {
    const nature = Battle.generation.natures.get(calc.toID(row.name));
    if (!nature || !Number.isFinite(row.percent)) continue;
    found = true;
    if (nature.plus !== nature.minus && nature.plus === stat) percent += row.percent;
  }
  return found ? Math.round(percent * 10) / 10 : null;
}
function natureBoostForMove(opponent, role, stat) {
  const choice = getPreferences(opponent, 'opponent')[`${role}NatureChoice`];
  return choice === 'auto' ? (natureUsage(opponent, stat) ?? 0) >= NATURE_USAGE_THRESHOLD : choice;
}
function natureFlagState(opponent, role) {
  const ours = state.ourTeam[state.activeOurIndex];
  const moveNames = role === 'defense' ? ours?.moveSet || [] : battleSpecies(opponent,'opponent')?.learnset || [];
  const relevant = [...new Set(moveNames.map(Battle.moveMeta).filter(move => move && move.category !== 'Status')
    .map(move => role === 'defense' ? move.defensiveStat : move.offensiveStat))];
  const stats = relevant.length ? relevant : role === 'defense' ? ['def', 'spd'] : ['atk', 'spa'];
  const enabled = stats.map(stat => natureBoostForMove(opponent, role, stat));
  return {checked: enabled.some(Boolean), mixed: enabled.some(Boolean) && !enabled.every(Boolean),
    stats, choice: getPreferences(opponent, 'opponent')[`${role}NatureChoice`]};
}
function getOpponentAbilityAssumption(opponent = state.opponentList[state.activeOpponentIndex]) {
  if (!opponent) return null;
  const species = battleSpecies(opponent,'opponent');
  const abilities = [...new Set(species.abilities.map(name => name.trim()).filter(Boolean))];
  if (abilities.length === 1) return {name: abilities[0], reason: 'Only available ability'};
  const eligible = (getUsage(species)?.abilities || []).filter(row =>
    abilities.includes(row.name) && row.percent >= ABILITY_USAGE_THRESHOLD)
    .sort((a,b) => b.percent - a.percent || a.rank - b.rank)[0];
  return eligible ? {name: eligible.name,
    reason: `${eligible.percent}% ${state.format} usage · threshold ≥${ABILITY_USAGE_THRESHOLD}%`} : null;
}
function opponentAbilityOptions(opponent) {
  if (!opponent) return [];
  const species = battleSpecies(opponent,'opponent');
  const automatic = getOpponentAbilityAssumption(opponent);
  const rows = getUsage(species)?.abilities || [];
  const options = [...new Set(species.abilities.map(name => name.trim()).filter(Boolean))]
    .filter(name => name === automatic?.name || Battle.isDamageAbility(name))
    .map(name => {
      const reference = rows.find(row => row.name === name);
      return {name, automatic: name === automatic?.name,
        reason: name === automatic?.name ? automatic.reason
          : `${reference?.percent === undefined || reference.percent === null ? 'Usage not reported' : `${reference.percent}% ${state.format} usage`} · off by default`};
    });
  return options.sort((a,b) => Number(b.automatic)-Number(a.automatic));
}
function opponentAbilityField(species) {
  return species?.originalName ? 'baseAbilityChoice' : 'abilityChoice';
}
function opponentAbilityChoice(species) {
  const prefs=getPreferences(species,'opponent');
  return species?.selectedMegaFromBase ? prefs.megaAbilityChoices[species.calcId] ?? 'auto' : prefs[opponentAbilityField(species)];
}
function appliedOpponentAbility(opponent) {
  const choice=opponentAbilityChoice(battleSpecies(opponent,'opponent'));
  if (choice === 'auto') return getOpponentAbilityAssumption(opponent)?.name || '';
  return opponentAbilityOptions(opponent).some(option => option.name === choice) ? choice : '';
}
function renderAbilityAssumption(opponent) {
  const options = opponentAbilityOptions(opponent);
  const row = document.getElementById('abilityAssumptionRow');
  row.hidden = !options.length;
  const active = appliedOpponentAbility(opponent);
  row.innerHTML = options.map((option,index) => {
    const enabled = option.name === active;
    const label = enabled ? `Damage ranges are assumed to be modified by ${option.name}`
      : `Ability not assumed: ${option.name}`;
    const effect=window.ABILITY_EFFECTS?.[calc.toID(option.name)] || 'Effect description unavailable.';
    const basisId = index === 0 ? 'abilityAssumptionBasis' : `ability-basis-${calc.toID(option.name)}`;
    return `<div class="ability-option"><button ${index === 0 ? 'id="abilityAssumptionToggle"' : ''} data-assumed-ability="${escapeHtml(option.name)}"
      class="ability-assumption" type="button" aria-pressed="${enabled}" aria-describedby="${basisId}"
      aria-label="${escapeHtml(`${label}. ${effect}`)}"
      title="${escapeHtml(`${option.name}\n${effect}`)}">
      <svg class="ability-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" fill="currentColor" /></svg>
      <span>${escapeHtml(option.name)}</span><small>${enabled ? 'assumed' : 'not assumed'}</small></button><span id="${basisId}" class="status-note">${escapeHtml(option.reason)}</span></div>`;
  }).join('');
}
function itemHintMetadata(name) {
  return name==='Choice Scarf' ? {name,image:window.ITEM_SPRITES['Choice Scarf'],referenceOnly:true,
    description:'Speed ×1.5; the holder is locked into one move. Reference only: no Choice Scarf modifier is applied to calculations.'}
    : window.ITEM_HINTS[calc.toID(name)];
}
function getItemHints(species, prefs=getPreferences(species,'opponent')) {
  // Parent-species usage cannot establish an item frequency for an evolved Mega form.
  if (species.isMega) return [];
  const usage = getUsage(species);
  const hints = (usage?.items || []).filter(row => row.percent >= 5 && itemHintMetadata(row.name))
    .map(row => ({...itemHintMetadata(row.name), percent: row.percent, reference: usage.name}));
  for(const mega of availableMegaForms(species)){
    const stone=Battle.requiredMegaItem(mega);if(!stone)continue;
    hints.push({name:stone,image:window.ITEM_SPRITES[stone],percent:null,reference:species.name,megaFormId:mega.id,
      description:`Mega Evolve into ${mega.name}. Click again to return to ${species.name}.`});
  }
  // A manual selection stays visible across formats even if it is no longer common.
  const selected = prefs.itemChoice;
  if (selected && itemHintMetadata(selected) && !hints.some(item => item.name === selected)) {
    const reference = usage?.items?.find(item => item.name === selected);
    hints.push({...itemHintMetadata(selected), percent: reference?.percent ?? null,
      reference: usage?.name || species.name});
  }
  return hints;
}
function appliedOpponentItem(opponent) {
  const species = battleSpecies(opponent,'opponent');
  if (!species) return '';
  const stone=Battle.requiredMegaItem(species);
  if(stone) return stone;
  const selected = getPreferences(opponent, 'opponent').itemChoice;
  const item = window.ITEM_HINTS[calc.toID(selected)];
  return item && Battle.generation.items.get(calc.toID(item.name)) ? item.name : '';
}
function buildItemHints(entry) {
  const species=savedSpecies(entry),effective=battleSpecies(entry,'opponent'),prefs=getPreferences(entry,'opponent');
  if(species.isMega && effective.isMega) return `<div class="item-hints">${megaStoneMarkup(entry,'opponent',effective)}</div>`;
  const hints=getItemHints(megaBaseSpecies(species),prefs).filter(item=>
    effective.isMega ? item.megaFormId===effective.calcId : !species.isMega || !item.megaFormId);
  const stance=species.isMega ? megaStoneMarkup(entry,'opponent',effective) : stanceMarkup(entry,'opponent');
  if (!hints.length) return stance ? `<div class="item-hints">${stance}</div>` : '';
  return `<div class="item-hints" aria-label="Opponent item choices">${stance}${hints.map(item => {
    const enabled = item.megaFormId ? effective.isMega : item.name === prefs.itemChoice;
    const frequency = item.percent === null ? 'Usage not reported' : `${item.percent}% ${state.format} usage`;
    const description = item.megaFormId ? `${item.name}. ${item.description} ${enabled?'Mega form active.':'Mega form inactive.'}` : `${item.name} · ${frequency} (${item.reference}). ${item.description} ${item.referenceOnly ? (enabled ? 'Highlighted for reference. Click to clear.' : 'Click to highlight for reference.') : enabled ? 'Active for damage calculations. Click to deactivate.' : 'Not applied to damage. Click to activate.'}`;
    return `<button class="item-hint" type="button" data-opponent-item="${escapeHtml(item.name)}" aria-pressed="${enabled}"
      aria-label="${escapeHtml(description)}">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" />
      ${itemTooltipMarkup(description)}</button>`;
  }).join('')}</div>`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getNatureDefinition(name, plusKey = null, minusKey = null) {
  if (name && typeof name === 'object') {
    if (Object.hasOwn(name, 'plus') || Object.hasOwn(name, 'minus')) {
      return getNatureDefinition(null, name.plus, name.minus);
    }
    return getNatureDefinition(name.name);
  }
  if (plusKey || minusKey) {
    if (!plusKey || !minusKey || plusKey === minusKey ||
        !Battle.natureStats.includes(plusKey) || !Battle.natureStats.includes(minusKey)) {
      return {name: 'Neutral', plus: null, minus: null};
    }
    const match = natureOptions.find(n => n.plus === plusKey && n.minus === minusKey);
    return match ? {...match} : {name: 'Neutral', plus: null, minus: null};
  }
  const match = natureOptions.find(n => n.name.toLowerCase() === String(name || '').trim().toLowerCase());
  return match ? {...match} : {name: 'Neutral', plus: null, minus: null};
}

function getNatureSelectOptions(selectedValue) {
  const options = [`<option value="" ${!selectedValue ? 'selected' : ''}>None</option>`];
  for (const key of Battle.natureStats) {
    const label = statLabels[key];
    options.push(`<option value="${key}" ${selectedValue === key ? 'selected' : ''}>${label}</option>`);
  }
  return options.join('');
}

function updateNature(entry, value, mode = null) {
  if (!entry) return;

  const currentPlus = entry.nature?.plus || null;
  const currentMinus = entry.nature?.minus || null;

  if (mode === 'plus' || mode === 'minus') {
    const key = Battle.natureStats.includes(value) ? value : null;
    const plus = mode === 'plus' ? key : currentPlus;
    const minus = mode === 'minus' ? key : currentMinus;
    entry.nature = { ...getNatureDefinition(null, plus, minus), plus, minus };
    saveTeamToStorage();
    render();
    return;
  }

  const parsed = getNatureDefinition(value);
  entry.nature = parsed;
  saveTeamToStorage();
  render();
}

function updateItem(entry, value) {
  if (!entry) return;
  const species = savedSpecies(entry),effective=battleSpecies(entry,'our');
  const item=canonicalItem(value);
  if(item===null || effective.isMega) {renderTeam();return;}
  const mega=megaFormForStone(species,item);
  if(Battle.generation.items.get(calc.toID(item))?.megaStone && !mega) {renderTeam();return;}
  if(item===entry.item) {renderTeam();return;}
  if(species.isMega) {
    const base=megaBaseSpecies(species);
    Object.assign(entry,{name:base.name,id:base.id,types:base.types,form:base.form,ability:ordinaryAbility(effective,entry)});
  }
  entry.item=item;
  if(mega) {getPreferences(entry,'our').megaActive=true;savePreferences();}
  saveTeamToStorage();
  render();
}

function defaultInvestment() {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

function sanitizeTeamEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') return null;
  const pokemon = getPokemonByName(rawEntry.name);
  if (!pokemon) return null;
  let remaining = MAX_TEAM_POINTS;
  const investment = Object.fromEntries(statOrder.map(stat => {
    const numeric = Number(rawEntry.investment?.[stat] ?? 0);
    const value = Number.isFinite(numeric) ? clamp(Math.floor(numeric), 0, Math.min(MAX_STAT_POINTS, remaining)) : 0;
    remaining -= value;
    return [stat, value];
  }));
  const moveSet = Array.isArray(rawEntry.moveSet)
    ? rawEntry.moveSet.filter(move => typeof move === 'string' && Battle.moveMeta(move)).slice(0, 4)
    : pokemon.moves.slice(0, 4);
  const nature = getNatureDefinition(rawEntry.nature);
  // Keep partial nature drafts through reload; their effective modifier is neutral.
  if (rawEntry.nature && typeof rawEntry.nature === 'object') {
    nature.plus = Battle.natureStats.includes(rawEntry.nature.plus) ? rawEntry.nature.plus : null;
    nature.minus = Battle.natureStats.includes(rawEntry.nature.minus) ? rawEntry.nature.minus : null;
  }
  let item=canonicalItem(rawEntry.item) ?? '';
  if(pokemon.isMega) item=Battle.requiredMegaItem(pokemon);
  else if(!item && rawEntry.megaFormId) {
    const legacyForm=availableMegaForms(pokemon).find(form=>form.id===rawEntry.megaFormId);
    item=Battle.requiredMegaItem(legacyForm);
  } else if(Battle.generation.items.get(calc.toID(item))?.megaStone && !megaFormForStone(pokemon,item)) item='';
  return {name: pokemon.name, nickname:typeof rawEntry.nickname==='string' ? rawEntry.nickname.trim().slice(0,40) : '', id: pokemon.id, types: pokemon.types, form: pokemon.form,
    item,
    ability: pokemon.abilities.includes(rawEntry.ability) ? rawEntry.ability : pokemon.abilities[0],
    nature, moveSet: moveSet.length ? moveSet : pokemon.moves.slice(0, 4), investment,
    damageMultiplier: 1};
}
function sanitizeOpponentEntry(rawEntry) {
  const species = getPokemonByName(rawEntry?.name);
  return species ? {kind: 'opponent', name: species.name, id: species.id,
    types: species.types, form: species.form} : null;
}

function getTeamFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(sanitizeTeamEntry).filter(Boolean);
  } catch (error) {
    return null;
  }
}

function repairTeamState() {
  const stored = getTeamFromStorage();

  state.ourTeam = Array.isArray(stored) ? stored : createDefaultTeam();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ourTeam));
  } catch (error) {
    // Ignore storage failures and keep the in-memory defaults.
  }
}

function rememberTeamPokemon(team,pokemon,force=false) {
  const saved=new Map((team.savedPokemon || []).map(entry=>[entry.id,entry]));
  const previous=new Map();
  for(const entry of team.pokemon || []) {const key=JSON.stringify(entry);previous.set(key,(previous.get(key) || 0)+1);}
  for(const entry of pokemon) {
    const key=JSON.stringify(entry),remaining=previous.get(key) || 0;
    if(remaining) previous.set(key,remaining-1);
    if(force || !saved.has(entry.id) || !remaining) saved.set(entry.id,structuredClone(entry));
  }
  team.savedPokemon=[...saved.values()];
}

function saveTeamToStorage(recordHistory=true) {
  if (!Array.isArray(state.ourTeam)) {
    repairTeamState();
  }

  const active = state.teamLibrary.find(team => team.id === state.activeTeamId);
  if (active) {
    rememberTeamPokemon(active,state.ourTeam);
    active.pokemon = structuredClone(state.ourTeam);
    active.updatedAt = new Date().toISOString();
  }
  if(recordHistory) recordTeamHistory();
  else {
    teamHistory.present=teamHistorySnapshot();
    teamHistory.signature=teamHistorySignature(teamHistory.present);
  }
  try {
    if (active) {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify({version:1, activeId:state.activeTeamId, teams:state.teamLibrary}));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ourTeam));
    document.getElementById('storageStatus').textContent = 'Team saved automatically';
  } catch (error) {
    document.getElementById('storageStatus').textContent = 'Storage unavailable; changes last for this tab';
  }
}

function teamId() { return crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
function uniqueTeamName(name) {
  const base = String(name || 'New team').trim().slice(0,80) || 'New team';
  let candidate = base, number = 2;
  while (state.teamLibrary.some(team => team.name === candidate)) candidate = `${base} (${number++})`;
  return candidate;
}
function initializeTeamLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY) || 'null');
    if (saved?.version === 1 && Array.isArray(saved.teams)) {
      const seen = new Set();
      state.teamLibrary = saved.teams.filter(team => team && typeof team.id === 'string' &&
        Array.isArray(team.pokemon)).flatMap(team => {
        const pokemon = team.pokemon.map(sanitizeTeamEntry);
        if (seen.has(team.id) || pokemon.some(p => !p)) return [];
        seen.add(team.id);
        const archived=Array.isArray(team.savedPokemon) ? team.savedPokemon.map(sanitizeTeamEntry).filter(Boolean) : [];
        const savedPokemon=[...new Map([...pokemon,...archived].map(entry=>[entry.id,entry])).values()];
        return [{id:team.id, name:String(team.name || 'My team').slice(0,80), pokemon,savedPokemon,
          updatedAt:team.updatedAt || new Date().toISOString()}];
      });
      state.activeTeamId = state.teamLibrary.find(team => team.id === saved.activeId)?.id || state.teamLibrary[0]?.id || '';
    }
  } catch { /* Preserve the working-team save if the library is unavailable. */ }
  if (!state.teamLibrary.length) {
    const team = {id:teamId(), name:'My team', pokemon:structuredClone(state.ourTeam), updatedAt:new Date().toISOString()};
    state.teamLibrary = [team]; state.activeTeamId = team.id;
  }
  state.ourTeam = structuredClone(state.teamLibrary.find(team => team.id === state.activeTeamId).pokemon);
  resetTeamOffenseSelection();
  saveTeamToStorage();
}
function renderTeamLibrary() {
  const active = state.teamLibrary.find(team => team.id === state.activeTeamId);
  if (!active) return;
  if(teamHistory.present?.activeId===state.activeTeamId) {
    teamHistory.present.activeOurIndex=state.activeOurIndex;
    teamHistory.present.offenseCustomized=state.teamOffenseCustomized;
    teamHistory.present.excluded=state.ourTeam.flatMap((member,index)=>state.teamOffenseExcluded.has(member) ? [index] : []);
  }
  document.getElementById('activeTeamName').textContent = active.name;
  document.getElementById('teamLibrarySelect').innerHTML = state.teamLibrary.map(team =>
    `<option value="${escapeHtml(team.id)}" ${team.id === active.id ? 'selected' : ''}>${escapeHtml(team.name)}</option>`).join('');
  document.getElementById('teamNameInput').value = active.name;
  document.getElementById('deleteTeamButton').disabled = state.teamLibrary.length <= 1;
  document.getElementById('copyTeamLinkButton').disabled = !state.ourTeam.length;
}
function selectLibraryTeam(id) {
  const team = state.teamLibrary.find(team => team.id === id);
  if (!team) return;
  saveTeamToStorage();
  state.activeTeamId = id;
  state.ourTeam = structuredClone(team.pokemon);
  resetTeamOffenseSelection();
  state.activeOurIndex = 0;
  document.getElementById('teamShareLink').hidden = true;
  saveTeamToStorage(); render();
}
function createLibraryTeam(copy = false) {
  saveTeamToStorage();
  const active = state.teamLibrary.find(team => team.id === state.activeTeamId);
  const team = {id:teamId(), name:uniqueTeamName(copy ? `${active.name} copy` : 'New team'),
    pokemon:copy ? structuredClone(state.ourTeam) : [], updatedAt:new Date().toISOString()};
  state.teamLibrary.push(team); selectLibraryTeam(team.id);
  window.SiteUsage?.count('team_created');
  document.getElementById('teamNameInput').focus(); document.getElementById('teamNameInput').select();
}
function libraryMessage(message) {
  const status = document.getElementById('libraryStatus');
  status.textContent = message; status.hidden = false;
}
function importTeamSnapshots(teams) {
  saveTeamToStorage();
  const added = teams.map(team => {
    const record = {id:teamId(), name:uniqueTeamName(team.name), pokemon:structuredClone(team.pokemon), savedPokemon:structuredClone(team.savedPokemon || []), updatedAt:new Date().toISOString()};
    state.teamLibrary.push(record); return record;
  });
  selectLibraryTeam(added[0].id);
  for(const team of added) window.SiteUsage?.count('team_imported');
  document.getElementById('teamLibraryPanel').open = true;
  libraryMessage(`Imported ${added.length} ${added.length === 1 ? 'team' : 'teams'}.`);
}
function exportTeams(all = false) {
  saveTeamToStorage();
  const active = state.teamLibrary.find(team => team.id === state.activeTeamId);
  const blob = new Blob([JSON.stringify(TeamFiles.pack(all ? state.teamLibrary : [active],true),null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = all ? 'pokelator-teams.json' : `${active.name.replace(/[^\p{L}\p{N}_-]/gu,'-') || 'team'}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
async function copyTeamLink() {
  saveTeamToStorage();
  const team = state.teamLibrary.find(team => team.id === state.activeTeamId);
  const url = new URL(location.href); url.hash = `team=${TeamFiles.encode([team])}`;
  const input = document.getElementById('teamShareLink'); input.value = url.href; input.hidden = false;
  try { await navigator.clipboard.writeText(url.href); libraryMessage('Team link copied.'); }
  catch { input.focus(); input.select(); libraryMessage('Copy the selected team link.'); }
}
function importSharedTeam() {
  if (!location.hash.startsWith('#team=')) return;
  try {
    const teams = TeamFiles.decode(location.hash.slice(6),sanitizeTeamEntry);
    importTeamSnapshots(teams);
    history.replaceState(null,'',location.pathname + location.search);
  } catch (error) {
    document.getElementById('teamLibraryPanel').open = true;
    libraryMessage(`Could not open team link: ${error.message}`);
  }
}

function loadSavedTeam() {
  const stored = getTeamFromStorage();
  if (!stored) {
    repairTeamState();
    state.activeOurIndex = 0;
    return;
  }
  state.ourTeam = stored;
  resetTeamOffenseSelection();
  state.activeOurIndex = 0;
}

function createDefaultTeam() {
  return [
    sanitizeTeamEntry({ name: 'Sneasler', item: 'Focus Sash', ability: 'Pressure', nature: 'Jolly', investment: { hp: 1, atk: 32, def: 1, spa: 0, spd: 0, spe: 32 }, moveSet: ['Dire Claw', 'Close Combat', 'Fake Out', 'Acrobatics'] }),
    sanitizeTeamEntry({ name: 'Mega Charizard Y', nature: 'Timid', investment: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 }, moveSet: ['Heat Wave', 'Air Slash', 'Solar Beam', 'Protect'] }),
    sanitizeTeamEntry({ name: 'Garchomp', item: 'Life Orb', nature: 'Jolly', investment: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 }, moveSet: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] })
  ];
}

function createDefaultOpponents() {
  const kingambit=sanitizeOpponentEntry({name:'Kingambit'});
  const key=`opponent:${kingambit.id}`;
  if(!state.preferences[key]) state.preferences[key]=sanitizePreferences({itemChoice:'Life Orb'});
  return [sanitizeOpponentEntry({name:'Mega Kangaskhan'}),kingambit];
}

function popularTeamBuild(species) {
  const usage=getUsage(species);
  const byPopularity=(a,b)=>(b.percent ?? -1)-(a.percent ?? -1) || (a.rank ?? Infinity)-(b.rank ?? Infinity);
  const spreads=[...(usage?.spreads || [])].filter(row=>row.investment
    && statOrder.every(stat=>Number.isInteger(row.investment[stat]) && row.investment[stat]>=0 && row.investment[stat]<=MAX_STAT_POINTS)
    && statOrder.reduce((sum,stat)=>sum+row.investment[stat],0)<=MAX_TEAM_POINTS).sort(byPopularity);
  const spread=spreads.find(row=>statOrder.reduce((sum,stat)=>sum+row.investment[stat],0)===MAX_TEAM_POINTS) || spreads[0];
  const nature=[...(usage?.natures || [])].filter(row=>Battle.generation.natures.get(calc.toID(row.name))).sort(byPopularity)[0];
  const offense=species.stats.atk>=species.stats.spa ? 'atk' : 'spa';
  const fallback=defaultInvestment();fallback[offense]=32;
  if(species.stats.spe<=80) {fallback.hp=32;fallback[offense==='atk' ? 'spd' : 'def']=2;}
  else {fallback.spe=32;fallback.hp=2;}
  const investment=spread ? {...spread.investment} : {...fallback};
  let remaining=MAX_TEAM_POINTS-statOrder.reduce((sum,stat)=>sum+investment[stat],0);
  // Complete partial-only reports without taking points away from their allocation.
  for(const stat of [...statOrder].sort((a,b)=>fallback[b]-fallback[a] || statOrder.indexOf(a)-statOrder.indexOf(b))) {
    const extra=Math.min(remaining,MAX_STAT_POINTS-investment[stat]);
    investment[stat]+=extra;remaining-=extra;
  }
  return {investment,
    nature:nature?.name || (offense==='atk' ? 'Adamant' : 'Modest')};
}

function addTeamPokemon(name,savedBuild=null,satisfyingSet=null) {
  const status = document.getElementById('teamAddStatus');
  const species = getPokemonByName(name);
  if (!species) {
    status.textContent = 'Choose a Pokémon from the list.';
    status.hidden = false;
    return false;
  }
  if(!savedBuild && teamPokemonFilters?.requiresMoves) {
    satisfyingSet=satisfyingSet || teamPokemonFilters.satisfyingSet(species);
    if(!satisfyingSet){status.textContent='Choose a Pokémon that matches the move filters.';status.hidden=false;return false;}
  }
  state.ourTeam.push(sanitizeTeamEntry(savedBuild ? {...structuredClone(savedBuild),name:species.name} : {name:species.name,...popularTeamBuild(species),...satisfyingSet}));
  window.SiteUsage?.count('pokemon_added');
  if(!state.teamOffenseCustomized) resetTeamOffenseSelection();
  else state.teamOffenseExcluded.add(state.ourTeam.at(-1));
  state.activeOurIndex = state.ourTeam.length - 1;
  document.getElementById('teamPokemonInput').value = '';
  status.hidden = true;
  saveTeamToStorage();
  render();
  document.querySelector('.expanded-team .set-editor').open = true;
  document.querySelector('.expanded-team input[data-stat="hp"]').focus();
  return true;
}

function removeTeamPokemon(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.ourTeam.length) return;
  saveTeamToStorage();
  state.ourTeam.splice(index, 1);
  if(!state.teamOffenseCustomized) resetTeamOffenseSelection();
  if (state.activeOurIndex > index) state.activeOurIndex--;
  state.activeOurIndex = Math.max(0,Math.min(state.activeOurIndex, state.ourTeam.length - 1));
  document.getElementById('teamAddStatus').hidden = true;
  saveTeamToStorage();
  render();
  document.getElementById('teamPokemonInput').focus();
}

function moveTeamPokemon(index,step) {
  const destination=index+step;
  if(![-1,1].includes(step) || !reorderTeamPokemon(index,destination)) return;
  document.querySelector(`[data-move-team-index="${destination}"][data-team-step="${step}"]`)?.focus();
}
function reorderTeamPokemon(index,destination) {
  if(index===destination || ![index,destination].every(slot=>Number.isInteger(slot) && slot>=0 && slot<state.ourTeam.length)) return false;
  document.activeElement?.blur?.();
  const selected=state.ourTeam[state.activeOurIndex],member=state.ourTeam.splice(index,1)[0];
  state.ourTeam.splice(destination,0,member);
  state.activeOurIndex=state.ourTeam.indexOf(selected);
  if(!state.teamOffenseCustomized) resetTeamOffenseSelection();
  saveTeamToStorage();render();
  return true;
}
function teamOrderControls(entry,index) {
  const handle=index!==state.activeOurIndex ? ` class="column-tag team-order-handle" data-team-drag title="Drag to reorder ${escapeHtml(pokemonDisplayName(entry))}"` : ' class="column-tag"';
  return `<span${handle}>${index+1}</span>`+[-1,1].map(step=>`<button type="button" class="control-btn team-order-button" data-move-team-index="${index}" data-team-step="${step}"
    ${index+step<0 || index+step>=state.ourTeam.length ? 'disabled' : ''}
    title="Move ${escapeHtml(entry.name)} ${step<0 ? 'earlier' : 'later'} in default order"
    aria-label="Move ${escapeHtml(entry.name)} ${step<0 ? 'earlier' : 'later'} in team order">${step<0 ? '↑' : '↓'}</button>`).join('');
}

const teamCardControls='input, select, textarea, label, summary, button, a, [contenteditable]';
function bindTeamReorder(list) {
  const panel=list.closest('.our-team-panel');
  let drag=null,scrollFrame=0,suppressClick=false;
  const finish=()=>{
    const current=drag;
    if(!current) return;
    drag=null;
    cancelAnimationFrame(scrollFrame);
    current.row.classList.remove('team-drag-source');
    current.target?.removeAttribute('data-team-drop');
    if(current.surface.hasPointerCapture(current.pointer)) current.surface.releasePointerCapture(current.pointer);
  };
  const updateTarget=()=>{
    const hit=document.elementFromPoint(drag.x,drag.y);
    let target=hit?.closest('.team-row');
    if(hit===list) {
      target=[...list.children].find((row,index,rows)=>{
        const bottom=row.getBoundingClientRect().bottom;
        const nextTop=rows[index+1]?.getBoundingClientRect().top ?? bottom;
        return drag.y<=(bottom+nextTop)/2;
      });
    }
    if(target?.parentElement!==list || target===drag.row) target=null;
    if(target===drag.target) return;
    drag.target?.removeAttribute('data-team-drop');
    drag.target=target;
    // The active card stays pinned above the other cards, so use the numbered slots.
    if(target) target.dataset.teamDrop=Number(target.dataset.teamIndex)<drag.index ? 'before' : 'after';
  };
  const autoscroll=()=>{
    if(!drag.row.isConnected) {finish();return;}
    const {left,right,top,bottom}=panel.getBoundingClientRect();
    if(drag.x>=left && drag.x<=right) {
      const edge=36;
      const above=Math.max(0,top)+edge-drag.y,below=drag.y-Math.min(innerHeight,bottom)+edge;
      const distance=clamp(Math.max(0,below)-Math.max(0,above),-edge,edge);
      if(distance) {
        const last=panel.scrollTop,step=Math.sign(distance)*Math.ceil(Math.abs(distance)/3);
        panel.scrollTop+=step;
        if(panel.scrollTop===last && (drag.y<edge || drag.y>innerHeight-edge)) window.scrollBy(0,step);
        updateTarget();
      }
    }
    scrollFrame=requestAnimationFrame(autoscroll);
  };
  list.addEventListener('pointerdown',event=>{
    if(event.button!==0 || !event.isPrimary || drag?.row.isConnected) return;
    suppressClick=false;
    let surface=event.target,row=surface.closest('.compact-team');
    if(!row || surface.closest(teamCardControls)) return;
    if(event.pointerType==='touch' && !surface.closest('[data-team-drag]')) return;
    finish();
    event.preventDefault();
    const index=row.dataset.teamIndex;
    document.activeElement?.blur?.();
    if(!surface.isConnected) {
      // Committing an editor can replace the card under the pointer.
      surface=document.elementFromPoint(event.clientX,event.clientY);
      row=surface?.closest('.compact-team');
      if(row?.dataset.teamIndex!==index || surface.closest(teamCardControls)) return;
    }
    drag={row,surface,pointer:event.pointerId,index:Number(index),x:event.clientX,y:event.clientY,started:false,target:null};
    surface.setPointerCapture(event.pointerId);
  });
  list.addEventListener('pointermove',event=>{
    if(drag?.pointer!==event.pointerId) return;
    if(!drag.started) {
      if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5) return;
      drag.started=true;
      suppressClick=true;
      drag.row.classList.add('team-drag-source');
      scrollFrame=requestAnimationFrame(autoscroll);
    }
    drag.x=event.clientX;drag.y=event.clientY;
    updateTarget();
  });
  list.addEventListener('pointerup',event=>{
    if(drag?.pointer!==event.pointerId) return;
    if(drag.started) {
      drag.x=event.clientX;drag.y=event.clientY;
      updateTarget();
    }
    const index=drag.index,destination=Number(drag.target?.dataset.teamIndex);
    finish();
    reorderTeamPokemon(index,destination);
  });
  for(const eventName of ['pointercancel','lostpointercapture']) {
    list.addEventListener(eventName,event=>{if(drag?.pointer===event.pointerId) finish();});
  }
  list.addEventListener('dragstart',event=>{if(!event.target.closest(teamCardControls)) event.preventDefault();});
  list.addEventListener('click',event=>{
    if(!suppressClick || event.detail===0) return;
    suppressClick=false;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && drag) finish();});
}

function pokemonUsageReference(species) {
  const data=window.META_USAGE?.formats[state.format]?.species || {};
  const exact=calc.toID(species.id),reference=calc.toID(getUsage(species)?.name || '');
  const shared={mausholdfour:'maushold',toxtricitylowkey:'toxtricity'}[exact]
    || (exact.startsWith('vivillon') ? 'vivillon' : null);
  return data[exact] || (shared && data[shared]) || (!species.isMega && data[reference]) || null;
}
let teamPokemonFilters,opponentVoice;
const priorityChoiceCache=new Map(),priorityRankingCache=new Map();
let priorityJob=null;
function priorityChoices(species,filters) {
  const key=JSON.stringify([state.format,species.id,filters.abilities,filters.priorityConditional,filters.priorityUsage,filters.priorityCategory,filters.priorityType]);
  if(!priorityChoiceCache.has(key))priorityChoiceCache.set(key,PriorityMoves.choices(species,getUsage(species),filters));
  return priorityChoiceCache.get(key);
}
function priorityBuild(species,allowedAbilities=[]) {
  const usage=getUsage(species),popular=rows=>[...(rows || [])].sort((a,b)=>(b.percent || 0)-(a.percent || 0));
  const ability=popular(usage?.abilities).find(row=>species.abilities.includes(row.name) && (!allowedAbilities.length || allowedAbilities.includes(row.name)))?.name
    || species.abilities.find(name=>!allowedAbilities.length || allowedAbilities.includes(name));
  return sanitizeTeamEntry({name:species.name,...popularTeamBuild(species),ability,item:popular(usage?.items)[0]?.name || ''});
}
function priorityRanking(filters) {
  const roster=builderRoster({stats:{spe:-1}},false),weights=statDistributionWeights(roster);
  const options={format:state.format,weather:state.weather,terrain:state.terrain};
  const key=JSON.stringify([options,state.metaMode,roster.map(s=>[s.id,weights.get(s.id)]),filters.abilities,
    filters.priorityConditional,filters.priorityUsage,filters.priorityCategory,filters.priorityType]);
  if(priorityRankingCache.has(key))return priorityRankingCache.get(key);
  if(priorityJob?.key===key)return null;
  priorityJob?.worker.terminate();
  const worker=new Worker('priority-worker.js?v=20261123-priority');
  priorityJob={key,worker,progress:'Ranking priority attacks…'};
  const refresh=()=>{
    if(!filters.enabled || filters.sort!=='priority') return;
    for(const picker of [activeUsagePicker,gridUsagePicker]) {
      if(picker?.pokemonFilters===filters) refreshUsagePicker(picker);
    }
  };
  worker.onmessage=({data})=>{
    if(priorityJob?.key!==key)return;
    if(data.rows){
      priorityRankingCache.set(key,new Map(data.rows.map(row=>[row.id,row.best])));
      if(priorityRankingCache.size>4)priorityRankingCache.delete(priorityRankingCache.keys().next().value);
      priorityJob=null;worker.terminate();
    }else if(data.error){priorityJob.progress='Priority ranking unavailable. Try changing the filters.';worker.terminate();}
    else priorityJob.progress=`Ranking priority attacks · ${data.progress}/${data.total}`;
    refresh();
  };
  worker.onerror=()=>{if(priorityJob?.key===key){priorityJob.progress='Priority ranking unavailable. Try changing the filters.';worker.terminate();refresh();}};
  const candidates=pokemonCatalog.flatMap(species=>{
    const moves=priorityChoices(species,filters);
    return moves.length ? [{species:defenseSpecies(species),entry:priorityBuild(species,filters.abilities),moves}] : [];
  });
  worker.postMessage({candidates,targets:roster.map(species=>({species:defenseSpecies(species),entry:priorityBuild(species),weight:weights.get(species.id) ?? 1})),options});
  return null;
}
function buildSearchResults(query,includeAll=false,filters=null) {
  const clean=query.trim().toLowerCase();
  if(!clean && !includeAll && !filters?.active && !filters?.showAll) return [];
  const matches=pokemonCatalog.filter(p=>p.name.toLowerCase().includes(clean) || p.id.toLowerCase().includes(clean));
  if(filters) return filters.apply(matches);
  return matches
    .sort((a,b)=>(pokemonUsageReference(b)?.percent ?? -1)-(pokemonUsageReference(a)?.percent ?? -1)
      || (getUsage(a)?.rank ?? Infinity)-(getUsage(b)?.rank ?? Infinity) || a.name.localeCompare(b.name));
}
function buildTeamSearchResults(query) {
  const regular=buildSearchResults(query,true,teamPokemonFilters),matches=new Map(regular.map(species=>[species.id,species]));
  if(!matches.size) return regular;
  const saved=state.teamLibrary.flatMap(team=>(team.savedPokemon || team.pokemon).flatMap(entry=>{
    const species=matches.get(entry.id);
    if(!species) return [];
    const satisfyingSet=teamPokemonFilters.requiresMoves ? teamPokemonFilters.satisfyingBuild(species,entry) : null;
    return !teamPokemonFilters.requiresMoves || satisfyingSet
      ? [{...species,satisfyingSet,savedBuild:structuredClone(entry),sourceTeamId:team.id,sourceTeamName:team.name}] : [];
  })).sort((a,b)=>(b.sourceTeamId===state.activeTeamId)-(a.sourceTeamId===state.activeTeamId)
    || a.sourceTeamName.localeCompare(b.sourceTeamName)
    || (a.pickerSort==='dex' ? (a.pickerSortValue ?? Infinity)-(b.pickerSortValue ?? Infinity) : 0)
    || a.name.localeCompare(b.name));
  return [...regular,...saved];
}
function pokemonChoiceRanking(species) {
  if(species.pickerSort==='dex') return species.pickerSortValue===undefined ? 'Dex number unavailable' : `#${String(species.pickerSortValue).padStart(4,'0')}`;
  const sortValue=species.pickerSort==='priority' ? (Number.isFinite(species.pickerSortValue) ? `${species.pickerSortValue.toFixed(1)}% avg HP` : species.priorityPending ? 'Ranking…' : 'Unavailable') : species.pickerSort && species.pickerSort!=='usage' ? `${statLabels[species.pickerSort]} ${species.pickerSortValue}` : '';
  if(species.savedBuild) return species.pickerSort==='priority' ? 'Saved build' : sortValue || 'Saved build';
  if(sortValue) return sortValue;
  const usage=pokemonUsageReference(species);
  if(!usage) return 'Usage unavailable';
  return `${species.pickerSort==='usage' && usage.rank ? '#'+usage.rank+' · ' : ''}${usage.percent.toFixed(2)}%`;
}
function satisfyingMovesMarkup(moves) {
  return moves?.length ? `<div class="search-item-sub satisfying-moves">${moves.map(name=>`<span>${escapeHtml(name)}</span>`).join(' · ')}</div>` : '';
}
function pokemonChoiceMarkup(species) {
  const ranking=escapeHtml(pokemonChoiceRanking(species));
  const portrait=`<img class="search-item-image" src="${getPokemonImage(species.name)}" alt="" loading="lazy" />`;
  if(species.savedBuild) {
    const build=species.savedBuild;
    return `${portrait}<div class="choice-copy"><div class="choice-heading"><strong>${escapeHtml(species.name)}</strong><small>${ranking}</small></div>
      <div class="saved-build-team">${escapeHtml(species.sourceTeamName)}</div>
      <div class="search-item-sub">${escapeHtml(build.nature.name)}${build.item ? ` · ${escapeHtml(build.item)}` : ''} · ${escapeHtml(build.ability)}</div>
      <div class="search-item-sub">${statOrder.filter(stat=>build.investment[stat]).map(stat=>`${statLabels[stat]} ${build.investment[stat]}`).join(' · ') || 'No stat investment'}</div>
      <div class="search-item-sub">${build.moveSet.map(escapeHtml).join(' · ')}</div></div>`;
  }
  return `${portrait}<div class="choice-copy"><div class="choice-heading"><strong>${escapeHtml(species.name)}</strong><small ${species.pickerSort==='priority' ? 'data-quick-tooltip="Average damage as a percentage of target HP, capped at 100% per opponent. Conditions are assumed satisfied. Weather, terrain and Meta Mode weights apply."' : ''}>${ranking}</small></div>
    <div class="search-item-sub">${species.types.join(' / ')}${species.cosmeticBaseId ? ' · Cosmetic form' : ''}</div>${baseStatsMarkup(species)}${satisfyingMovesMarkup(species.satisfyingSet?.moveSet)}</div>`;
}
function pokemonGridChoiceMarkup(species,showStats) {
  const subtitle=species.savedBuild ? species.sourceTeamName : pokemonChoiceRanking(species);
  return `<img class="search-item-image" src="${getPokemonImage(species.name)}" alt="" loading="lazy" />
    <div class="choice-copy"><strong>${escapeHtml(species.name)}</strong><small>${escapeHtml(subtitle)}</small></div>
    ${showStats ? baseStatsMarkup(species) : ''}${satisfyingMovesMarkup(species.satisfyingSet?.moveSet)}`;
}
function buildMoveChoices(species,query='') {
  const clean=query.trim().toLowerCase();
  const usage=new Map((getUsage(species)?.moves || []).map(row=>[calc.toID(row.name),row.percent]));
  return species.learnset.flatMap(name=>{
    const meta=Battle.moveMeta(name);
    return meta ? [{...meta,name,percent:usage.get(calc.toID(name)) ?? null}] : [];
  })
    .filter(move=>!clean || move.name.toLowerCase().includes(clean) || move.type?.toLowerCase().includes(clean))
    .sort((a,b)=>(b.percent ?? -1)-(a.percent ?? -1) || a.name.localeCompare(b.name));
}
function moveChoiceMarkup(move) {
  const effect=window.BALANCE_MOVES?.moves[calc.toID(move.name)];
  const multihit=move.multihit || effect?.multihit;
  const hits=Array.isArray(multihit) ? `${multihit[0]}–${multihit[1]} hits`
    : Number.isInteger(multihit) && multihit>1 ? `${effect?.multiaccuracy ? '1–' : ''}${multihit} hits` : '';
  const powerLabel=hits && /power rises/i.test(effect?.shortDesc || '') ? 'starting power' : hits ? 'power/hit' : 'power';
  const accuracy=effect?.accuracy===true ? 'No accuracy check' : Number.isFinite(effect?.accuracy) ? `${effect.accuracy}% acc` : '';
  const summary=MoveSummary.describe(effect);
  return `<div class="choice-copy"><div class="choice-heading"><strong>${escapeHtml(move.name)}</strong><small>${move.percent===null ? 'Usage unavailable' : `${move.percent}%`}</small></div>
    <div class="search-item-sub">${escapeHtml(move.type || 'Unknown')} · ${escapeHtml(move.category || '')}${move.power ? ` · ${move.power} ${powerLabel}` : ''}${hits ? ` · ${escapeHtml(hits)}` : ''}${accuracy ? ` · ${accuracy}` : ''}</div>${summary ? `<div class="search-item-sub move-effect-summary">${escapeHtml(summary)}</div>` : ''}</div>`;
}
function buildItemChoices(species,query='') {
  const clean=query.trim().toLowerCase();
  const usage=new Map((getUsage(megaBaseSpecies(species))?.items || []).map(row=>[calc.toID(row.name),row.percent]));
  const megaForms=availableMegaForms(species);
  const validStones=new Map(megaForms.map(form=>[Battle.requiredMegaItem(form),form]));
  return [{name:'No Item',value:'',percent:null,description:'No held item.'},...itemOptions.flatMap(name=>{
    const item=Battle.generation.items.get(calc.toID(name));
    const mega=validStones.get(name);
    if(item.megaStone && !mega) return [];
    const description=mega ? `Mega Evolve into ${mega.name}.`
      : window.ITEM_DESCRIPTIONS?.[calc.toID(name)] || window.ITEM_HINTS[calc.toID(name)]?.description || 'Held item; its supported effects apply to calculations.';
    return [{name,value:name,percent:usage.get(calc.toID(name)) ?? null,description,image:window.ITEM_SPRITES[name],mega:!!mega}];
  }).sort((a,b)=>Number(b.mega)-Number(a.mega) || (b.percent ?? -1)-(a.percent ?? -1) || a.name.localeCompare(b.name))]
    .filter(item=>!clean || item.name.toLowerCase().includes(clean) || item.description.toLowerCase().includes(clean));
}
function itemChoiceMarkup(item) {
  return `${item.image ? `<img class="item-choice-image" src="${escapeHtml(item.image)}" alt="" />` : ''}<div class="choice-copy"><div class="choice-heading"><strong>${escapeHtml(item.name)}</strong><small>${item.percent===null ? '' : `${item.percent}%`}</small></div><div class="search-item-sub">${escapeHtml(item.description)}</div></div>`;
}
function buildAbilityChoices(species,query='') {
  const clean=query.trim().toLowerCase();
  const usage=new Map((getUsage(species)?.abilities || []).map(row=>[row.name,row.percent]));
  return species.abilities.map(name=>({name,percent:usage.get(name) ?? null,
    description:window.ABILITY_EFFECTS?.[calc.toID(name)] || 'Effect description unavailable.'}))
    .filter(ability=>!clean || ability.name.toLowerCase().includes(clean) || ability.description.toLowerCase().includes(clean))
    .sort((a,b)=>(b.percent ?? -1)-(a.percent ?? -1) || a.name.localeCompare(b.name));
}
function abilityChoiceMarkup(ability) {
  return `<div class="choice-copy"><div class="choice-heading"><strong>${escapeHtml(ability.name)}</strong><small>${ability.percent===null ? 'Usage unavailable' : `${ability.percent}%`}</small></div>
    <div class="search-item-sub">${escapeHtml(ability.description)}</div></div>`;
}
let activeUsagePicker=null,gridUsagePicker=null;
function usagePickerFor(input) {
  if(gridUsagePicker?.input===input) return gridUsagePicker;
  return activeUsagePicker?.input===input ? activeUsagePicker : null;
}
function closeUsagePicker({commitDraft=false,picker=activeUsagePicker}={}) {
  if(!picker) return;
  const {input,popup,deferredChange}=picker;
  const wasGrid=picker===gridUsagePicker;
  if(picker===activeUsagePicker) activeUsagePicker=null;
  if(wasGrid) gridUsagePicker=null;
  if(popup.matches(':popover-open')) popup.hidePopover();
  popup.replaceChildren();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
  if(wasGrid) {
    picker.pokemonFilters.setGridButton(null);
    picker.pokemonFilters.syncPanelLayer();
  }
  if(commitDraft && deferredChange && input.isConnected) input.dispatchEvent(new Event('change',{bubbles:true}));
}
function restoreGridPickerInput(picker) {
  if(picker!==gridUsagePicker || picker.input.isConnected) return;
  const index=state.ourTeam.indexOf(picker.member);
  if(index>=0) {state.activeOurIndex=index;render();}
}
function changeUsagePickerLayout(picker,layout) {
  const inGrid=picker===gridUsagePicker,wantsGrid=layout!=='list';
  const fromToolbar=picker.popup.contains(document.activeElement);
  if(inGrid!==wantsGrid) {
    if(inGrid) restoreGridPickerInput(picker);
    closeUsagePicker({picker});
    if(wantsGrid) {
      closeUsagePicker({picker:gridUsagePicker});
      picker.popup=document.getElementById('pokemonGridResults');
      gridUsagePicker=picker;
    } else {
      closeUsagePicker({commitDraft:true});
      picker.popup=document.getElementById('searchResults');
      activeUsagePicker=picker;
    }
  }
  picker.layout=layout;picker.popup.scrollTop=0;
  updateUsagePicker(picker);
  if(wantsGrid && !inGrid) picker.pokemonFilters.syncPanelLayer();
  if(!wantsGrid) {
    const editor=picker.input.closest('details');
    if(editor) editor.open=true;
    picker.input.focus();positionUsagePicker(picker);
  }
  else if(!inGrid && fromToolbar) picker.popup.querySelector('[data-picker-control="stats"]').focus({preventScroll:true});
}
function resetUsagePickerQuery(picker,query) {
  picker.query=query;
  picker.items=picker.choices(query);
  picker.cursor=Math.max(0,picker.items.findIndex(item=>item.name.toLowerCase()===query.trim().toLowerCase()));
  picker.popup.scrollTop=0;
  updateUsagePicker(picker);
}
function refreshUsagePicker(picker) {
  picker.items=picker.choices(picker.query);
  picker.cursor=Math.min(picker.cursor,Math.max(0,picker.items.length-1));
  updateUsagePicker(picker);
}
function usageChoiceId(picker,index) {
  return `${picker===gridUsagePicker ? 'pokemon-grid-choice' : 'usage-choice'}-${index}`;
}
function bindUsagePicker(input,{choices,markup,choose,kind='pokemon',hint='',moveFilterOptions={},pokemonFilters=null,member=null}) {
  input.removeAttribute('list');input.autocomplete='off';input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',pokemonFilters ? 'pokemon-picker-options' : 'searchResults');
  if(member && gridUsagePicker?.member===member) {
    Object.assign(gridUsagePicker,{input,choices,markup,choose,hint});
    input.value=gridUsagePicker.query;
  }
  let moveFilters=null;
  const unfilteredChoices=choices;
  if(kind==='move')choices=query=>unfilteredChoices(query).filter(move=>moveFilters.accept(move));
  const open=(query)=>{
    if(gridUsagePicker?.input===input) {resetUsagePickerQuery(gridUsagePicker,query);return;}
    closeUsagePicker();
    const popup=document.getElementById('searchResults');
    activeUsagePicker={input,popup,choices,markup,choose,kind,hint,pokemonFilters,member,layout:'list'};
    resetUsagePickerQuery(activeUsagePicker,query);
  };
  if(kind==='move') {
    moveFilters=new MoveFilters.Picker({input,choices:()=>unfilteredChoices(''),
      test:moveFilterOptions.matches || ((move,query)=>MoveFilters.matches(move,query,moveFilterOptions.species)),
      onRequirement:moveFilterOptions.onRequirement,
      onChange:show=>{if(show)open('');else if(activeUsagePicker?.input===input)open(activeUsagePicker.query);}});
    moveFilters.mount();input.moveFilters=moveFilters;
  }
  input.addEventListener('focus',()=>{
    if(!usagePickerFor(input))open(kind==='move' || kind==='ability' || kind==='item' ? '' : input.value);
  });
  if(kind==='move')input.addEventListener('click',()=>{if(activeUsagePicker?.input!==input)open('');});
  if(pokemonFilters)input.addEventListener('click',()=>{if(!usagePickerFor(input))open(input.value);});
  input.addEventListener('input',()=>open(input.value));
  input.addEventListener('blur',event=>{
    if(activeUsagePicker?.input===input && !activeUsagePicker.popup.contains(event.relatedTarget)) closeUsagePicker({commitDraft:true});
  });
  input.addEventListener('keydown',event=>{
    const picker=usagePickerFor(input);
    if(event.key==='Tab' && !event.shiftKey && picker) {
      const control=picker.popup.querySelector('[data-picker-control]');
      if(control) {
        event.preventDefault();
        picker.focusingPickerControl=true;
        control.focus();
        picker.focusingPickerControl=false;
        return;
      }
    }
    if(event.key==='Escape') {
      if(picker && picker===gridUsagePicker) changeUsagePickerLayout(picker,'list');
      else {
        if(kind==='pokemon') {
          input.value=picker?.deferredChange ? input.defaultValue : '';
          if(input.id==='pokemonSearchInput') state.searchQuery='';
        }
        if(picker) closeUsagePicker({picker});
      }
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    if(event.key==='ArrowDown' || event.key==='ArrowUp') {
      event.preventDefault();event.stopImmediatePropagation();
      if(!picker) {open(input.value);return;}
      const count=picker.items.length;
      if(!count) return;
      const previous=document.getElementById(usageChoiceId(picker,picker.cursor));
      previous.classList.remove('active');previous.setAttribute('aria-selected','false');
      picker.cursor=(picker.cursor+(event.key==='ArrowDown' ? 1 : -1)+count)%count;
      if(input.id==='pokemonSearchInput')state.searchCursor=picker.cursor;
      const next=document.getElementById(usageChoiceId(picker,picker.cursor));
      next.classList.add('active');next.setAttribute('aria-selected','true');
      input.setAttribute('aria-activedescendant',next.id);
      next.scrollIntoView({block:'nearest'});
    } else if(event.key==='Enter' && picker?.items.length) {
      event.preventDefault();event.stopImmediatePropagation();
      const item=picker.items[picker.cursor];closeUsagePicker({picker});choose(item);
    }
  });
}
function updateUsagePicker(picker=activeUsagePicker) {
  if(!picker) return;
  const {input,popup,items,cursor,kind,pokemonFilters}=picker;
  const canGrid=pokemonFilters?.active && pokemonFilters.enabled;
  const grid=picker===gridUsagePicker;
  const listId=grid ? 'pokemon-grid-options' : 'pokemon-picker-options';
  if(pokemonFilters) popup.removeAttribute('role');
  else popup.setAttribute('role','listbox');
  input.setAttribute('aria-controls',pokemonFilters ? listId : popup.id);
  if(input.id==='pokemonSearchInput') {state.searchQuery=picker.query;state.searchResults=items;state.searchCursor=cursor;}
  const snapshot=window.META_USAGE?.formats[state.format];
  const rankingHint=pokemonFilters?.enabled && pokemonFilters.sort==='priority' ? `${priorityJob?.progress || 'Priority Strength'} · ${state.format}` : '';
  const focusedControl=popup.contains(document.activeElement) ? document.activeElement.dataset.pickerControl : undefined;
  const filterToggle=pokemonFilters?.active ? `<button type="button" class="mini-button" data-picker-filter-toggle data-picker-control="filters" aria-label="Apply Pokémon filters" aria-pressed="${pokemonFilters.enabled}">Filters ${pokemonFilters.enabled ? 'on' : 'off'}</button>` : '';
  const layoutButton=(layout,label,pressed='')=>`<button type="button" class="mini-button" data-picker-control="${layout}" ${pressed!=='' ? `aria-pressed="${pressed}"` : ''}>${label}</button>`;
  const layoutControls=grid ? `<button type="button" class="mini-button" data-picker-control="edit-filters" aria-controls="${pokemonFilters.panel.id}">Edit filters</button>
    ${layoutButton('stats','Base stats',picker.layout==='stats')}<button type="button" class="mini-button picker-grid-close" data-picker-control="list" aria-label="Close">×</button>`
    : canGrid ? layoutButton('compact','Grid') : '';
  const count=grid ? `<strong>${items.filter(item=>!item.savedBuild).length} matching Pokémon</strong>` : '';
  const source=rankingHint || picker.hint || `${state.format} · ${snapshot?.month || ''} Showdown usage`;
  const markup=grid ? item=>pokemonGridChoiceMarkup(item,picker.layout==='stats') : picker.markup;
  const optionClass=kind==='pokemon' ? 'search-item' : kind==='ability' ? 'ability-choice' : kind==='item' ? 'item-choice' : 'move-choice';
  const choices=items.length ? items.map((item,index)=>`${item.savedBuild && !items[index-1]?.savedBuild ? '<div class="choice-source saved-build-divider">Saved builds · per team</div>' : ''}<div role="option" aria-selected="${index===cursor}" id="${usageChoiceId(picker,index)}" data-choice-index="${index}" class="${optionClass} usage-choice ${index===cursor ? 'active' : ''}">${markup(item)}</div>`).join('') : '<div class="empty-state">No matching choices.</div>';
  const summary=[];
  if(grid && picker.member) summary.push(`Editing ${pokemonDisplayName(picker.member)}`);
  if(grid && canGrid) {
    summary.push(...pokemonFilters.moves);
    if(pokemonFilters.stabTargets.length) summary.push(`STAB into ${pokemonFilters.stabTargets.join(', ')}`);
  }
  summary.push(source);
  popup.innerHTML=`<div class="choice-source"><div class="picker-source-copy">${count}<span>${escapeHtml(summary.join(' · '))}</span></div>${filterToggle || layoutControls ? `<div class="picker-controls">${filterToggle}${layoutControls}</div>` : ''}</div>`
    +(pokemonFilters ? `<div id="${listId}" data-results-layout="${picker.layout}" role="listbox" aria-label="Pokémon results">${choices}</div>` : choices);
  if(kind==='move' && input.moveFilters && !input.moveFilters.onRequirement)popup.querySelector('.choice-source').append(input.moveFilters.button);
  const controls=[...popup.querySelectorAll('[data-picker-control]')];
  for(const control of controls) {
    control.addEventListener('pointerdown',event=>event.preventDefault());
    control.addEventListener('click',()=>{
      const action=control.dataset.pickerControl;
      if(action==='filters') {
        pokemonFilters.setEnabled(!pokemonFilters.enabled);
        resetUsagePickerQuery(picker,picker.query);
      } else if(action==='edit-filters') pokemonFilters.toggle(control);
      else changeUsagePickerLayout(picker,action==='stats' && picker.layout==='stats' ? 'compact' : action);
    });
    control.addEventListener('keydown',event=>{
      if(event.key==='Tab') {
        const adjacent=controls[controls.indexOf(control)+(event.shiftKey ? -1 : 1)];
        if(adjacent || event.shiftKey) {
          event.preventDefault();
          if(!adjacent) restoreGridPickerInput(picker);
          (adjacent || picker.input).focus();
        }
      } else if(event.key==='Escape') {
        event.preventDefault();
        if(grid) changeUsagePickerLayout(picker,'list');
        else {
          input.focus();if(picker.deferredChange) input.value=input.defaultValue;
          closeUsagePicker({picker});
        }
      }
    });
    control.addEventListener('blur',()=>queueMicrotask(()=>{
      if(activeUsagePicker===picker && document.activeElement!==input && !popup.contains(document.activeElement)) closeUsagePicker({commitDraft:true});
    }));
  }
  for(const row of popup.querySelectorAll('[data-choice-index]')) {
    row.addEventListener('pointerdown',event=>event.preventDefault());
    row.addEventListener('click',()=>{
      const item=items[Number(row.dataset.choiceIndex)];
      restoreGridPickerInput(picker);
      closeUsagePicker({picker});picker.choose(item);
    });
  }
  input.setAttribute('aria-expanded','true');
  if(items.length) input.setAttribute('aria-activedescendant',usageChoiceId(picker,cursor));
  else input.removeAttribute('aria-activedescendant');
  if(!popup.matches(':popover-open')) popup.showPopover();
  positionUsagePicker(picker);
  if(grid) pokemonFilters.setGridButton(popup.querySelector('[data-picker-control="edit-filters"]'));
  if(focusedControl) {
    const target=controls.find(control=>control.dataset.pickerControl===focusedControl) || controls[1] || controls[0] || input;
    target.focus({preventScroll:true});
  }
}
function positionUsagePicker(picker=activeUsagePicker) {
  if(!picker)return;
  const {input,popup}=picker;
  const grid=picker===gridUsagePicker;
  const box=input.getBoundingClientRect();
  const width=Math.min(grid ? 1280 : Math.max(box.width,340),innerWidth-16);
  popup.style.width=`${width}px`;
  popup.style.left=`${grid ? (innerWidth-width)/2 : clamp(box.left,8,Math.max(8,innerWidth-width-8))}px`;
  if(grid && (!box.height || box.bottom<=0 || box.top>=innerHeight)) {
    popup.style.top='8px';popup.style.maxHeight=`${innerHeight-16}px`;return;
  }
  const below=innerHeight-box.bottom-8,above=box.top-8;
  const down=below>=(grid ? above : Math.min(280,above));
  popup.style.maxHeight=`${Math.max(70,Math.min(grid ? innerHeight : 380,(down ? below : above)-4))}px`;
  popup.style.top=down ? `${box.bottom+4}px` : `${Math.max(8,box.top-popup.getBoundingClientRect().height-4)}px`;
}

function getTotalInvestment(entry) {
  return statOrder.reduce((sum, stat) => sum + (entry.investment[stat] || 0), 0);
}

function sanitizeNumericDraft(rawValue, maxValue = MAX_STAT_POINTS) {
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) return 0;
  return clamp(Math.floor(numericValue), 0, maxValue);
}

function commitTeamInvestment(entry, stat, rawValue) {
  const sanitized = sanitizeNumericDraft(rawValue, MAX_STAT_POINTS);
  const next = { ...entry.investment, [stat]: sanitized };
  const total = statOrder.reduce((sum, key) => sum + next[key], 0);

  if (total > MAX_TEAM_POINTS) {
    const overflow = total - MAX_TEAM_POINTS;
    next[stat] = clamp(next[stat] - overflow, 0, MAX_STAT_POINTS);
  }

  entry.investment = next;
  saveTeamToStorage();
  const row = document.querySelector('.expanded-team');
  if (row) {
    row.querySelector(`input[data-stat="${stat}"]`).value = next[stat];
    row.querySelector('.points-readout strong').textContent = getTotalInvestment(entry);
    updateStatInvestmentLabels(row,entry);
    const comparison=row.querySelector('.mega-stat-comparison');
    if(comparison) comparison.outerHTML=megaStatComparisonMarkup(entry,battleSpecies(entry,'our'));
    row.querySelector('[data-clear-investments]').disabled=!getTotalInvestment(entry);
  }
  renderActiveSummary();
  renderSpeedSummary();
  renderDamageRanges();
  renderTeamBuilder();
}

function commitStatInput(event) {
  const teamIndex = Number.parseInt(event.target.getAttribute('data-team-index'), 10);
  const stat = event.target.getAttribute('data-stat');
  const entry = state.ourTeam[teamIndex];
  if (!entry || !stat) return;
  commitTeamInvestment(entry, stat, event.target.value);
}

let teamSetEditorExpanded=false;
function buildSetEditor(entry, index, side) {
  const activeAbility=side==='our' ? battleEntry(entry).ability : entry.ability;
  const attr = `data-set-side="${side}" data-set-index="${index}"`;
  return `<details class="set-editor"${side==='our' && teamSetEditorExpanded ? ' open' : ''}><summary>Edit ${side === 'our' ? 'Pokémon & moves' : 'opponent set'}</summary>
    <label class="field-label">Pokémon<input type="text" list="speciesList" value="${escapeHtml(entry.name)}" ${attr} data-set-field="name" /></label>
    ${side==='our' ? `<label class="field-label">Nickname<input type="text" maxlength="40" placeholder="${escapeHtml(entry.name)}" value="${escapeHtml(entry.nickname || '')}" ${attr} data-set-field="nickname" /></label>` : ''}
    <label class="field-label">Ability<input type="text" value="${escapeHtml(activeAbility || '')}" ${attr} data-set-field="ability" /></label>

    ${Array.from({length: 4}, (_, i) => `<label class="field-label">Move ${i + 1}<input type="text" value="${escapeHtml(entry.moveSet[i] || '')}" ${attr} data-set-field="move-${i}" /></label>`).join('')}
  </details>`;
}
function bindSetEditors(container) {
  container.querySelectorAll('[data-set-field]').forEach(input => {
    const entry=(input.dataset.setSide==='our' ? state.ourTeam : state.opponentList)[Number(input.dataset.setIndex)];
    const species=savedSpecies(entry);
    if(input.dataset.setField==='name' || input.dataset.setField==='ability' || input.dataset.setField.startsWith('move-')) {
      const isMove=input.dataset.setField.startsWith('move-');
      const isAbility=input.dataset.setField==='ability';
      const teamName=input.dataset.setSide==='our' && !isMove && !isAbility;
      const abilitySpecies=input.dataset.setSide==='our' ? battleSpecies(entry,'our') : species;
      bindUsagePicker(input,{pokemonFilters:teamName ? teamPokemonFilters : null,member:teamName ? entry : null,moveFilterOptions:{species:{...abilitySpecies,ability:input.dataset.setSide==='our' ? battleEntry(state.ourTeam[Number(input.dataset.setIndex)]).ability : undefined}},kind:isMove ? 'move' : isAbility ? 'ability' : 'pokemon',choices:query=>isMove ? buildMoveChoices(species,query) : isAbility ? buildAbilityChoices(abilitySpecies,query) : input.dataset.setSide==='our' ? buildTeamSearchResults(query) : buildSearchResults(query),
        markup:isMove ? moveChoiceMarkup : isAbility ? abilityChoiceMarkup : pokemonChoiceMarkup,
        hint:isMove || isAbility ? `${state.format} ${isAbility ? 'ability' : 'move'} usage · ${getUsage(isAbility ? abilitySpecies : species)?.name || species.name} · Champions Battle Data` : '',
        choose:item=>{
          if(item.savedBuild && input.dataset.setSide==='our') {
            const index=Number(input.dataset.setIndex),previous=state.ourTeam[index];
            saveTeamToStorage();state.ourTeam[index]=sanitizeTeamEntry(structuredClone(item.savedBuild));
            if(state.teamOffenseExcluded.has(previous)) state.teamOffenseExcluded.add(state.ourTeam[index]);
            saveTeamToStorage();render();
            document.querySelector('.expanded-team .set-editor').open=true;
          } else {input.satisfyingSet=item.satisfyingSet;input.value=item.name;input.dispatchEvent(new Event('change',{bubbles:true}));}
        }});
    }
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    });
    input.addEventListener('change', () => {
      if(input.moveFilters?.panel.matches(':popover-open'))return;
      const {setSide: side, setIndex: index, setField: field} = input.dataset;
      const team = side === 'our' ? state.ourTeam : state.opponentList;
      const entry = team[Number(index)];
      if(field==='ability') {
        const species=side==='our' ? battleSpecies(entry,'our') : getPokemonByName(entry.name);
        const choice=species.abilities.find(name=>name.toLowerCase()===input.value.trim().toLowerCase());
        if(!choice) {input.value=side==='our' ? battleEntry(entry).ability : entry.ability || '';return;}
        input.value=choice;
      }
      if (field === 'name') {
        const picker=usagePickerFor(input);
        if(picker && (picker===gridUsagePicker || picker.focusingPickerControl)) {
          picker.deferredChange=true;
          return;
        }
        const species = getPokemonByName(input.value);
        if (!species) { input.value = entry.name; return; }
        const previous=getPokemonByName(entry.name);
        const cosmeticChange=(previous.cosmeticBaseId || previous.id)===(species.cosmeticBaseId || species.id);
        team[index] = sanitizeTeamEntry({...entry, name: species.name, ability:input.satisfyingSet?.ability || (cosmeticChange ? entry.ability : species.abilities[0]),
          item: previous.isMega && !species.isMega ? '' : entry.item,
          moveSet:input.satisfyingSet?.moveSet || (cosmeticChange ? entry.moveSet : species.moves), damageMultiplier: 1});
        if(side==='our' && state.teamOffenseExcluded.has(entry)) state.teamOffenseExcluded.add(team[index]);
      } else if(field==='ability' && side==='our') {
        const species=battleSpecies(entry,'our');
        if(species.originalName) {
          getPreferences(entry,'our').baseAbilityChoice=input.value;savePreferences();
        } else if(!species.selectedMegaFromBase) entry.ability=input.value;
      } else if (field.startsWith('move-')) {
        const move = Battle.moveMeta(input.value);
        if (!move) { input.value = entry.moveSet[Number(field.slice(5))] || ''; return; }
        entry.moveSet[Number(field.slice(5))] = move.name;
      } else if (field.startsWith('investment-')) {
        const stat = field.slice(11);
        const other = statOrder.filter(s => s !== stat).reduce((sum, s) => sum + entry.investment[s], 0);
        entry.investment[stat] = Math.min(sanitizeNumericDraft(input.value), MAX_TEAM_POINTS - other);
      } else if (field === 'nature') {
        entry.nature = getNatureDefinition(input.value);
      } else {
        entry[field] = input.value.trim();
      }
      if (side === 'our') saveTeamToStorage();
      const openEditors = [...document.querySelectorAll('.set-editor')].map(d => d.open);
      render();
      document.querySelectorAll('.set-editor').forEach((d, i) => { d.open = openEditors[i]; });
    });
  });
}

function renderTeam() {
  hideItemTooltip();
  const container = document.getElementById('ourTeamList');
  const editor=container.querySelector('.set-editor');
  if(editor) teamSetEditorExpanded=editor.open;
  document.getElementById('teamCount').textContent = `${state.ourTeam.length} Pokémon`;

  if (!state.ourTeam.length) {
    container.innerHTML = '<div class="empty-state">No Pokémon in your team.</div>';
    return;
  }

  const ordered = [...state.ourTeam];
  const selected = ordered[state.activeOurIndex];
  if (selected) {
    const selectedIndex = ordered.indexOf(selected);
    if (selectedIndex !== 0) {
      ordered.splice(selectedIndex, 1);
      ordered.unshift(selected);
    }
  }

  container.innerHTML = ordered
    .map((entry, index) => {
      const actualIndex = state.ourTeam.indexOf(entry);
      const isSelected = index === 0;
      const species=battleSpecies(entry,'our'),display=listDisplayEntry(entry,species);
      if (!isSelected) {
        return `<div class="team-row compact-team" data-team-index="${actualIndex}">
          ${pokemonListPortrait(display,species)}
          <div class="compact-row-copy">${pokemonListHeading(entry,display,actualIndex,false,true,species)}
            ${ourStatsMarkup(entry,species)}</div>
        </div>`;
      }

      const total = getTotalInvestment(entry);
      const megaItem = species.isMega ? Battle.requiredMegaItem(species) : '';
      const plusValue = entry.nature?.plus || '';
      const minusValue = entry.nature?.minus || '';
      const statFields = statOrder.map((stat) => `
        <div class="input-block">
          <label class="stat-investment-label" for="team-${actualIndex}-${stat}">
            <strong>${statLabels[stat]}</strong>
            <output data-stat-total="${stat}" title="Level 50 stat with investment and nature, before battle modifiers">${Battle.effectiveStat(species,entry,stat)}</output>
            <span class="stat-investment-breakdown" data-stat-breakdown="${stat}" title="Default stat + invested points ± nature change">${statInvestmentBreakdown(entry,species,stat)}</span>
          </label>
          <input
            id="team-${actualIndex}-${stat}"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            maxlength="2"
            value="${entry.investment[stat] || 0}"
            data-team-index="${actualIndex}"
            data-stat="${stat}"
            class="plain-number-input"
          />
        </div>
      `).join('');

      return `
        <div class="team-row expanded-team" data-team-index="${actualIndex}">
          ${pokemonListPortrait(display,species)}
          <div class="team-main">
            <div class="team-top-row">
              <div>
                <div class="pokemon-name">${escapeHtml(pokemonDisplayName(display))}</div>
                <div class="pokemon-type">${listDisplayTypes(entry,display)}</div>
              </div>
              <div class="team-member-actions">${knownItemMarkup(entry,species)}
                ${teamOrderControls(entry,actualIndex)}
                <button type="button" class="control-btn delete" data-remove-team-index="${actualIndex}"
                  aria-label="Remove ${escapeHtml(entry.name)} from team">×</button></div>
            </div>
            <div class="investment-heading"><span>Stat Investments</span><button type="button" class="mini-button clear-investments" data-clear-investments="${actualIndex}" ${!total ? 'disabled' : ''} title="Clear all six investments; keep the nature, item, ability and moves">Clear Investments</button></div>
            <div class="stat-grid">${statFields}</div>
            <div class="team-bottom-row">
              <div class="input-block">
                <label>Nature</label>
                <input
                  class="searchable-input"
                  list="natureList-${actualIndex}"
                  value="${escapeHtml(entry.nature.name)}"
                  data-team-index="${actualIndex}"
                  data-field="nature"
                />
                <datalist id="natureList-${actualIndex}">
                  ${natureOptions.map((nature) => `<option value="${nature.name}"></option>`).join('')}
                </datalist>
              </div>
              ${megaItem ? `<div class="required-mega-item"><strong>${escapeHtml(megaItem)}</strong><span>Required for Mega Evolution</span></div>` : `<div class="input-block">
                <label>Item</label>
                <input
                  class="searchable-input"
                  value="${escapeHtml(battleEntry(entry,species).item)}"
                  data-team-index="${actualIndex}"
                  data-field="item"
                />
              </div>`}
            </div>
                <div class="nature-toggle-row">
                  <div class="nature-balance">
                    <label class="nature-mark">
                      <span>+ </span>
                      <select data-team-index="${actualIndex}" data-nature-mode="plus">
                        ${getNatureSelectOptions(plusValue)}
                      </select>
                    </label>
                  </div>
                  <div class="nature-balance">
                    <label class="nature-mark">
                      <span>- </span>
                      <select data-team-index="${actualIndex}" data-nature-mode="minus">
                        ${getNatureSelectOptions(minusValue)}
                      </select>
                    </label>
                  </div>
                </div>
            ${megaStatComparisonMarkup(entry,species)}
            ${buildSetEditor(entry, actualIndex, 'our')}
            <div class="points-readout">Invested: <strong>${total}</strong> / ${MAX_TEAM_POINTS}</div>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.team-row').forEach((row) => {
    row.classList.toggle('coverage-selected',state.view === 'builder' && state.builderPanel === 'team-offense'
      && !state.teamOffenseExcluded.has(state.ourTeam[Number(row.dataset.teamIndex)]));
    row.addEventListener('click', (event) => {
      const interactive = event.target.closest(`${teamCardControls}, [data-team-drag]`);
      if (interactive) return;
      const teamIndex = Number.parseInt(row.getAttribute('data-team-index'), 10);
      if (!Number.isNaN(teamIndex) && teamIndex!==state.activeOurIndex) {
        state.activeOurIndex = teamIndex;
        render();
      }
    });
  });

  container.querySelectorAll('[data-clear-investments]').forEach(button=>button.addEventListener('click',()=>{
    const entry=state.ourTeam[Number(button.dataset.clearInvestments)];
    entry.investment=defaultInvestment();saveTeamToStorage();render();
  }));
  container.querySelectorAll('input[data-stat]').forEach((input) => {
    input.addEventListener('focus',()=>input.select());
    input.addEventListener('input',()=>{
      const entry=state.ourTeam[Number(input.dataset.teamIndex)],stat=input.dataset.stat;
      const other=statOrder.filter(key=>key!==stat).reduce((sum,key)=>sum+entry.investment[key],0);
      const investment={...entry.investment,[stat]:Math.min(sanitizeNumericDraft(input.value),MAX_TEAM_POINTS-other)};
      updateStatInvestmentLabels(input.closest('.input-block'),{...entry,investment});
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });

    input.addEventListener('blur', (event) => {
      commitStatInput(event);
    });


  });

  container.querySelectorAll('select[data-nature-mode]').forEach((select) => {
    select.addEventListener('change', (event) => {
      const teamIndex = Number.parseInt(event.target.getAttribute('data-team-index'), 10);
      const mode = event.target.getAttribute('data-nature-mode');
      const value = event.target.value;
      const entry = state.ourTeam[teamIndex];
      if (!entry) return;
      updateNature(entry, value, mode);
    });
  });

  bindSetEditors(container);
  container.querySelectorAll('[data-move-team-index]').forEach(button=>{
    button.addEventListener('click',()=>moveTeamPokemon(Number(button.dataset.moveTeamIndex),Number(button.dataset.teamStep)));
  });
  container.querySelectorAll('[data-remove-team-index]').forEach(button => {
    button.addEventListener('click', () => removeTeamPokemon(Number(button.dataset.removeTeamIndex)));
  });

  container.querySelectorAll('input[data-field="item"]').forEach(input=>{
    const entry=state.ourTeam[Number(input.dataset.teamIndex)];
    bindUsagePicker(input,{kind:'item',choices:query=>buildItemChoices(savedSpecies(entry),query),markup:itemChoiceMarkup,
      hint:`${state.format} item usage · ${getUsage(getPokemonByName(entry.name))?.name || entry.name}`,
      choose:item=>updateItem(entry,item.value)});
  });
  container.querySelectorAll('input[data-field]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const teamIndex = Number.parseInt(event.target.getAttribute('data-team-index'), 10);
      const field = event.target.getAttribute('data-field');
      const value = event.target.value;

      if (field === 'nature') {
        updateNature(state.ourTeam[teamIndex], value);
      }
      if (field === 'item') {
        updateItem(state.ourTeam[teamIndex], value);
      }
    });
  });
}

function renderSearchResults() {
  if(activeUsagePicker?.input.id==='pokemonSearchInput') updateUsagePicker();
}

function addOpponentsByName(names) {
  const byFamily=new Map();
  for(const species of names.map(getPokemonByName).filter(Boolean)){
    const id=megaBaseSpecies(species).id;
    if(!byFamily.get(id)?.isMega||species.isMega)byFamily.set(id,species);
  }
  const requested=[...byFamily.values()];
  if(!requested.length)return;
  const family=entry=>megaBaseSpecies(savedSpecies(entry)).id;
  const existing=new Map();for(const entry of state.opponentList)if(!existing.has(family(entry)))existing.set(family(entry),entry);
  const added=requested.map(species=>{
    const previous=existing.get(megaBaseSpecies(species).id);
    if(!species.isMega)return previous||sanitizeOpponentEntry({name:species.name});
    const entry=previous?.id===species.id?previous:sanitizeOpponentEntry({name:species.name});
    const prefs=getPreferences(previous||entry,'opponent');
    const fromBase=previous && !savedSpecies(previous).isMega;
    state.preferences[`opponent:${species.id}`]=sanitizePreferences({...prefs,megaActive:true,megaFormId:'',
      abilityChoice:fromBase ? prefs.megaAbilityChoices[species.id] : prefs.abilityChoice,
      baseAbilityChoice:fromBase ? prefs.abilityChoice : prefs.baseAbilityChoice});
    return entry;
  });
  const seen=new Set(added.map(family));
  state.opponentList=[...added,...state.opponentList.filter(entry=>{if(seen.has(family(entry)))return false;seen.add(family(entry));return true;})];
  state.activeOpponentIndex=0;state.searchQuery='';state.searchCursor=0;
  const input=document.getElementById('pokemonSearchInput');if(input)input.value='';
  savePreferences();render();
}
function addOpponentFromSearch(name) {addOpponentsByName([name]);}

function resetBattle() {
  state.weather='';state.terrain='';state.alliesFainted=0;state.opponentsFainted=0;
  state.preferences=Object.fromEntries(Object.keys(state.preferences).map(key=>[key,sanitizePreferences()]));
  // These legacy mirrors must agree with preferences when a team is reloaded.
  for(const member of state.ourTeam) member.damageMultiplier=1;
  for(const team of state.teamLibrary) for(const member of team.pokemon) member.damageMultiplier=1;
  cancelBalanceSearch();stopBalanceOptimization(true);cancelDefenseSearch();cancelOffenseThresholdSearch();
  savePreferences();saveTeamToStorage();render();
}

function knownItemMarkup(entry,species) {
  const saved=savedSpecies(entry);
  const mega=saved.isMega ? saved : megaFormForStone(saved,entry.item);
  if(mega) return megaStoneMarkup(entry,'our',species,mega);
  const stance=stanceMarkup(entry,'our');
  return `${stance}${heldItemMarkup(entry.item)}`;
}
function itemTooltipMarkup(label) {
  return `<span role="tooltip" class="item-tooltip" popover="manual">${escapeHtml(label)}</span>`;
}
function heldItemMarkup(item) {
  if(!item) return '';
  const image=window.ITEM_SPRITES?.[item],hint=window.ITEM_HINTS[calc.toID(item)] || {description:window.ITEM_DESCRIPTIONS?.[calc.toID(item)]};
  const label=`${item}${hint?.description ? `. ${hint.description}` : ''}`;
  const tooltip=image || hint?.description ? itemTooltipMarkup(label) : '';
  return `<span class="item-hint known-item" aria-label="${escapeHtml(label)}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item)}" />` : `<small>${escapeHtml(item)}</small>`}${tooltip}</span>`;
}
function stanceMarkup(entry,side) {
  const species=savedSpecies(entry);if(!PokemonForms.isAegislash(species))return '';
  const active=getPreferences(species,side).bladeActive;
  const label=`${active?'Blade':'Shield'} Forme active. Click to use ${active?'Shield':'Blade'} Forme.`;
  const image=getPokemonImage('Aegislash Blade Forme');
  return `<button type="button" class="item-hint mega-stone stance-toggle" data-stance-side="${side}" aria-pressed="${active}" aria-label="${label}"><img src="${escapeHtml(image)}" alt="" />${itemTooltipMarkup(label)}</button>`;
}
function megaStoneMarkup(entry,side,effective,readyForm=savedSpecies(entry)) {
  const saved=savedSpecies(entry),form=effective.isMega ? effective : readyForm;
  const stone=Battle.requiredMegaItem(form),image=window.ITEM_SPRITES[stone],active=effective.isMega;
  const label=`${stone}. ${active ? `Return to ${megaBaseSpecies(saved).name}.` : `Mega Evolve into ${form.name}.`}`;
  return `<button type="button" class="item-hint mega-stone" data-mega-side="${side}" aria-pressed="${active}" aria-label="${escapeHtml(label)}">${image ? `<img src="${escapeHtml(image)}" alt="" />` : escapeHtml(stone)}${itemTooltipMarkup(label)}</button>`;
}
function listDisplayEntry(entry,species) {
  return species.isMega || species.originalName ? {...entry,name:species.name,types:species.types} : entry;
}
function pokemonListPortrait(display,species) {
  const name=species.stanceForm ? `Aegislash ${species.stanceForm} Forme` : display.name;
  return `<img class="team-avatar" src="${escapeHtml(getPokemonImage(name))}" alt="${escapeHtml(name)}" />`;
}
function listDisplayTypes(entry,display) {
  const form=entry.nickname && display.name!==entry.name ? `${escapeHtml(display.name)} · ` : '';
  return `${form}${display.types.join(' / ')}`;
}
function pokemonListHeading(entry,display,index,remove=false,ours=false,species) {
  return `<div class="opponent-name-block"><div class="opponent-name-line">
    <div class="pokemon-identity"><div class="pokemon-name">${escapeHtml(pokemonDisplayName(display))}</div><div class="pokemon-type">${listDisplayTypes(entry,display)}</div></div>
    ${ours ? knownItemMarkup(entry,species)+teamOrderControls(display,index) : `${buildItemHints(entry)}<span class="column-tag">${index+1}</span>`}
    ${ours ? `<button type="button" class="control-btn delete" data-remove-team-index="${index}" title="Remove ${escapeHtml(pokemonDisplayName(entry))}" aria-label="Remove ${escapeHtml(pokemonDisplayName(entry))} from team">×</button>` : ''}
    ${remove ? `<button type="button" class="control-btn" data-opponent-action="up" data-opponent-index="${index}" ${index===0 ? 'disabled' : ''} aria-label="Move ${escapeHtml(entry.name)} earlier">↑</button><button type="button" class="control-btn" data-opponent-action="down" data-opponent-index="${index}" ${index===state.opponentList.length-1 ? 'disabled' : ''} aria-label="Move ${escapeHtml(entry.name)} later">↓</button><button type="button" class="control-btn delete" data-opponent-action="delete" data-opponent-index="${index}" title="Remove ${escapeHtml(entry.name)}" aria-label="Remove ${escapeHtml(entry.name)} from opposition">✕</button>` : ''}
    </div></div>`;
}

function renderOpponentList() {
  hideItemTooltip();
  const container = document.getElementById('opponentList');
  const toggle = document.getElementById('toggleOpponentsButton');
  toggle.hidden = state.opponentList.length <= 6;
  toggle.textContent = state.opponentsExpanded ? 'Show first six' : `Show all ${state.opponentList.length}`;

  if (!state.opponentList.length) {
    container.innerHTML = '<div class="empty-state">No opposing Pokémon loaded.</div>';
    return;
  }

  const ordered = [...state.opponentList];
  const selected = ordered[state.activeOpponentIndex];
  if (selected) {
    const selectedIndex = ordered.indexOf(selected);
    if (selectedIndex !== 0) {
      ordered.splice(selectedIndex, 1);
      ordered.unshift(selected);
    }
  }

  const visible = state.opponentsExpanded ? ordered : ordered.slice(0, 6);
  container.innerHTML = visible
    .map(entry => {
      const actualIndex = state.opponentList.indexOf(entry);
      const species=battleSpecies(entry,'opponent'),display=listDisplayEntry(entry,species);
      return `<div class="opponent-row compact${actualIndex === state.activeOpponentIndex ? ' item-color-selected' : ''}" data-opponent-index="${actualIndex}">
        ${pokemonListPortrait(display,species)}
        <div class="compact-row-copy">${pokemonListHeading(entry,display,actualIndex,true)}</div>
        ${opponentStatsMarkup(species,`opponent-range-key-${actualIndex}`)}
      </div>`;
    })
    .join('');

  bindSetEditors(container);
  container.querySelectorAll('.opponent-row').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('input, select, label, button, details, .item-hint')) return;
      const index = Number.parseInt(row.getAttribute('data-opponent-index'), 10);
      if (Number.isNaN(index)) return;
      const [entry] = state.opponentList.splice(index, 1);
      state.opponentList.unshift(entry);
      state.activeOpponentIndex = 0;
      render();
    });
  });

  container.querySelectorAll('[data-opponent-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const action = button.getAttribute('data-opponent-action');
      const index = Number.parseInt(button.getAttribute('data-opponent-index'), 10);
      if (Number.isNaN(index)) return;

      if (action === 'delete') {
        const selected=state.opponentList[state.activeOpponentIndex];
        state.opponentList.splice(index, 1);
        const remainingIndex=state.opponentList.indexOf(selected);
        state.activeOpponentIndex=remainingIndex>=0 ? remainingIndex : Math.max(0,Math.min(index,state.opponentList.length-1));
      }

      if (action === 'up' && index > 0) {
        [state.opponentList[index - 1], state.opponentList[index]] = [state.opponentList[index], state.opponentList[index - 1]];
        state.activeOpponentIndex = index - 1;
      }

      if (action === 'down' && index < state.opponentList.length - 1) {
        [state.opponentList[index], state.opponentList[index + 1]] = [state.opponentList[index + 1], state.opponentList[index]];
        state.activeOpponentIndex = index + 1;
      }

      render();
    });
  });
}

function buildActiveSummaryMarkup(entry,species) {
  if (!entry) {
    return '<div class="empty-state">No selection</div>';
  }

  const side=entry.kind==='opponent' ? 'opponent' : 'our';
  const display={...(side==='our' ? battleEntry(entry,species) : entry),name:species.name,types:species.types};
  const opponentItem = side==='opponent' ? appliedOpponentItem(entry) : '';
  const portrait=`<img src="${getPokemonImage(display.name)}" alt="${display.name}" />`;
  const identity=`
    <div class="summary-meta">
      <div class="summary-name">${escapeHtml(pokemonDisplayName(display))}</div>
      <div class="summary-types">${listDisplayTypes(entry,display)}</div>
      <div class="summary-item">${side==='opponent' ? escapeHtml(opponentItem || 'No assumed moves, investment or item') : [display.item,entry.nature.name].filter(Boolean).map(escapeHtml).join(' · ')}</div>
    </div>
  `;
  return side==='opponent' ? portrait+identity
    : `<div class="our-active-portrait">${portrait}</div>
        <div class="our-active-details">${identity}<div id="ourActiveStats" class="active-stats">${ourStatsMarkup(entry,species)}</div></div>`;
}

function renderActiveSummary() {
  const ourEntry = state.ourTeam[state.activeOurIndex] || state.ourTeam[0];
  const opponentEntry = state.opponentList[state.activeOpponentIndex] || state.opponentList[0];

  const ours=battleSpecies(ourEntry,'our'),opponent=battleSpecies(opponentEntry,'opponent');
  document.getElementById('ourActiveSummary').innerHTML=buildActiveSummaryMarkup(ourEntry,ours);
  document.getElementById('opponentActiveSummary').innerHTML=buildActiveSummaryMarkup(opponentEntry,opponent);
  document.getElementById('opponentActiveStats').innerHTML=opponent ? opponentStatsMarkup(opponent,'opponent-active-range-key') : '';
  document.getElementById('opponentStatKey').hidden=!opponent;
}

function speedEstimateText(estimate) {
  return !estimate ? '' : estimate.chance>0 && estimate.chance<0.001 ? '<0.1%'
    : `${Number((estimate.chance*100).toFixed(1))}%`;
}
function speedEstimateDescription(estimate) {
  return !estimate ? 'Usage estimate unavailable.'
    : `Reported builds: ${speedEstimateText(estimate)} faster · ${Number((estimate.tieChance*100).toFixed(1))}% tied\nEstimated from Speed spreads × natures; excludes item usage.`;
}
function speedMatchupDescription(tier) {
  return tier.kind==='always-slower' ? 'Even at maximum Speed: slower than us'
    : tier.kind==='always-faster' ? 'Faster than us even with no Speed investment'
    : tier.kind==='max-speed-tie' ? 'Maximum Speed: ties us'
    : tier.kind==='nature' ? 'Needs a Speed-boosting nature to outspeed us'
    : `Needs ${tier.points} Speed SP to outspeed us (neutral nature)`;
}
function renderSpeedSummary() {
  const container = document.getElementById('speedSummary');
  if (!container) return;

  const ourEntry = state.ourTeam[state.activeOurIndex] || state.ourTeam[0];
  const opponentEntry = state.opponentList[state.activeOpponentIndex] || state.opponentList[0];

  document.getElementById('battleSpeedStages').innerHTML=compactStages('battle-our-speed','Our Speed',getPreferences(ourEntry,'our').speedStage,'Our active Pokémon’s Speed stage. Remembered per Pokémon and shared with Team Builder.',!ourEntry)
    +compactStages('battle-opponent-speed','Op. Speed',getPreferences(opponentEntry,'opponent').speedStage,'Our active opponent’s Speed stage. Applies to Normal, Choice Scarf and Tailwind; remembered per opposing Pokémon.',!opponentEntry);
  if (!ourEntry || !opponentEntry) {
    container.innerHTML = '<div class="empty-state">No matchup selected.</div>';
    return;
  }

  const species = battleSpecies(opponentEntry,'opponent');
  const ability=appliedOpponentAbility(opponentEntry);
  const field=Battle.speedField(state,battleEntry(ourEntry).ability,ability);
  const targetSpeed = Battle.speed(battleSpecies(ourEntry,'our'),{...battleEntry(ourEntry),speedStage:getPreferences(ourEntry,'our').speedStage},field);
  // These are independent opponent scenarios; our exact build remains fixed.
  const scenarios = [
    {label: 'Normal', item: ''},
    {label: 'Choice Scarf', item: 'Choice Scarf'},
    {label: 'Tailwind', item: '', tailwind: true}
  ];
  container.innerHTML = scenarios.map(scenario => {
    if (species.isMega && scenario.item === 'Choice Scarf') {
      return '<div class="speed-scenario"><dt>Choice Scarf</dt><dd class="speed-unavailable">Unavailable · Mega Stone required</dd></div>';
    }
    const tier = Battle.speedTier(species, {...opponentEntry,speedStage:getPreferences(opponentEntry,'opponent').speedStage,ability,item: scenario.item}, targetSpeed,
      {...field,tailwind: !!scenario.tailwind});
    const showEstimate=!['always-faster','always-slower'].includes(tier.kind);
    const estimate=showEstimate ? Battle.speedUsageChance(species,{...opponentEntry,speedStage:getPreferences(opponentEntry,'opponent').speedStage,ability,item:scenario.item},targetSpeed,
      getUsage(species),{...field,tailwind:!!scenario.tailwind}) : null;
    const percent=showEstimate && estimate ? `<span class="speed-chance" title="${escapeHtml(speedEstimateDescription(estimate))}">${speedEstimateText(estimate)}</span>` : '';
    const detail=[speedMatchupDescription(tier),showEstimate ? speedEstimateDescription(estimate) : '',[field.weather,field.terrain,ability].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
    return `<div class="speed-scenario" title="${escapeHtml(detail)}"><dt>${scenario.label}</dt><dd><strong class="speed-tier">${tier.label}</strong>${percent}</dd></div>`;
  }).join('');
}

let builderAnchorKey = '';
let offenseSignature = '';
let offenseAnchorKey = '';
const offenseCache = new Map();
let moveTrial = {key:'',enabled:false,best:null,running:false,finished:false};
const attackTrials = new WeakMap();
let offenseThresholdTrial={key:'',worker:null,finished:false,thresholds:null};
function cancelOffenseThresholdSearch() {
  if(offenseThresholdTrial.worker) offenseThresholdTrial.worker.terminate();
  offenseThresholdTrial.worker=null;
}
function annotateOffenseThresholds(ours,stats,rows) {
  if(!stats.length) {cancelOffenseThresholdSearch();offenseThresholdTrial={key:'',worker:null,finished:false,thresholds:null};return rows;}
  const job={species:defenseSpecies(ours,'our'),ours:battleEntry(ours),stats,
    options:{format:state.format,attackerAlliesFainted:state.alliesFainted,attackerStages:statStages(ours,'our')},
    targets:builderOffenseProfiles(ours).map(profile=>({id:profile.scenarioId,species:defenseSpecies(profile.species),
      spreads:getUsage(profile.species)?.spreads || [],
      options:{weather:profile.weather,terrain:profile.terrain,defenderAbility:profile.ability,defenderItem:appliedOpponentItem(profile.species),defenderStages:statStages(profile.species,'opponent')},
      boosts:{def:natureBoostForMove(profile.species,'defense','def'),spd:natureBoostForMove(profile.species,'defense','spd')}}))};
  const key=JSON.stringify(job);
  if(key!==offenseThresholdTrial.key) {cancelOffenseThresholdSearch();offenseThresholdTrial={key,worker:null,finished:false,thresholds:null};}
  const trial=offenseThresholdTrial;
  if(!trial.worker && !trial.finished) {
    const worker=new Worker('stat-threshold-worker.js?v=20261121-full-attacks');trial.worker=worker;
    worker.onmessage=({data})=>{
      if(offenseThresholdTrial!==trial || trial.worker!==worker) return;
      trial.thresholds=data.thresholds;trial.sweeps=data.sweeps;trial.error=data.error;trial.finished=true;
      worker.terminate();trial.worker=null;
      if(state.view==='builder' && state.builderPanel==='offense') renderTeamBuilder();
    };
    worker.onerror=event=>{event.preventDefault();if(offenseThresholdTrial!==trial) return;trial.finished=true;trial.error=event.message;worker.terminate();trial.worker=null;renderTeamBuilder();};
    worker.postMessage(job);
  }
  return rows.map(row=>({...row,statThresholds:stats.map(stat=>trial.thresholds?.[row.scenarioId || row.species.id]?.[stat]
    || {stat,pending:!trial.finished,error:trial.error})}));
}
function getAttackTrial(selected,stat='atk') {
  if (!attackTrials.has(selected)) attackTrials.set(selected,{});
  const drafts=attackTrials.get(selected);
  if (!drafts[stat]) drafts[stat]={enabled:false,points:1};
  const trial=drafts[stat];
  trial.points=clamp(trial.points,0,selected.investment[stat]);
  if (!selected.investment[stat]) trial.enabled=false;
  return trial;
}
let teamTrialContext = '';
let teamMoveTrials = new Map();
// Measured Showdown usage, normalized within the displayed roster.
function statDistributionWeights(roster) {
  if(!state.metaMode) return new Map(roster.map(species=>[species.id,1]));
  const data=window.META_USAGE?.formats[state.format]?.species || {},resolved=new Map(),counts=new Map();
  for(const species of roster) {
    const exact=calc.toID(species.selectedMegaFromBase ? species.calcId : species.id),reference=calc.toID(getUsage(species)?.name || '');
    // Showdown groups these cosmetic forms under a shared usage entry.
    const shared={mausholdfour:'maushold',toxtricitylowkey:'toxtricity'}[exact]
      || (exact.startsWith('vivillon') ? 'vivillon' : null);
    const key=data[exact] ? exact : shared && data[shared] ? shared : !species.isMega && data[reference] ? reference : null;
    resolved.set(species.id,key);
    if(key) counts.set(key,(counts.get(key) || 0)+1);
  }
  const raw=roster.map(species=>{
    const key=resolved.get(species.id);
    return [species.id,key ? data[key].percent/counts.get(key) : 0];
  });
  const total=raw.reduce((sum,row)=>sum+row[1],0);
  return new Map(raw.map(([id,value])=>[id,total ? value/total*roster.length : 0]));
}
function builderOffenseProfiles(ours) {
  const species = battleSpecies(ours,'our');
  const combatant=battleEntry(ours,species);
  const attackerStages=statStages(ours,'our');
  const signature = JSON.stringify([{...combatant,moveSet:[]},state.format,state.weather,state.terrain,state.alliesFainted,attackerStages,species.calcId || species.id]);
  offenseSignature = signature;
  if (!offenseCache.has(signature)) {
    if (offenseCache.size >= 12) offenseCache.delete(offenseCache.keys().next().value);
    offenseCache.set(signature,new Map());
  }
  const memberCache = offenseCache.get(signature);
  const roster=builderRoster(species,false),weights=statDistributionWeights(roster);
  return roster.flatMap(defender => Battle.fieldScenarios(defender,appliedOpponentAbility(defender),state).map(condition => {
    condition={...condition,weight:condition.weight*(weights.get(defender.id) ?? 1)};
    const usage = getUsage(defender);
    const ability = condition.ability, item = appliedOpponentItem(defender);
    const preference = getPreferences(defender,'opponent').defenseNatureChoice;
    const defenderStages=statStages(defender,'opponent');
    const key = JSON.stringify([signature,condition,defender.stats,defender.types,usage?.spreads,usage?.natures,ability,item,preference,defenderStages]);
    let cached = memberCache.get(condition.scenarioId);
    if (!cached || cached.key !== key) { cached = {key,moves:new Map()}; memberCache.set(condition.scenarioId,cached); }
    return {...condition,species:defender,reference:usage?.name || defender.name,rank:usage?.rank,key,
      evaluate(name) {
        if (!cached.moves.has(name)) cached.moves.set(name,Offense.analyze(species,{...combatant,moveSet:[name]},defender,usage?.spreads || [],{
          format:state.format,weather:condition.weather,terrain:condition.terrain,attackerStages,defenderStages,
          attackerAlliesFainted:state.alliesFainted,
          defenderAbility:ability,defenderItem:item,
          boostDefenseNature:stat => natureBoostForMove(defender,'defense',stat)
        }));
        return cached.moves.get(name);
      }};
  }));
}
function builderOffenseRows(ours) {
  return builderOffenseProfiles(ours).map(profile => ({scenarioId:profile.scenarioId,scenario:profile.scenario,weight:profile.weight,species:profile.species,reference:profile.reference,rank:profile.rank,
    ...Offense.best(ours.moveSet.map(name => profile.evaluate(name)))}));
}
function updateMoveTrialControl() {
  const input = document.getElementById('builderMoveTrial');
  input.disabled = !moveTrial.finished || !moveTrial.best;
  input.checked = moveTrial.enabled;
  document.getElementById('builderMoveTrialRow').classList.toggle('preview-active',moveTrial.enabled);
  document.getElementById('builderMoveLock').disabled=!moveTrial.finished || !moveTrial.best;
  document.getElementById('builderMoveTrialText').innerHTML = moveTrial.best
    ? `Try <b>${escapeHtml(moveTrial.best.to)}</b> <span class="swap-over">over ${escapeHtml(moveTrial.best.from)}</span>`
    : moveTrial.finished ? 'No move swap improves this offense score.' : 'Finding best move swap…';
  document.getElementById('builderMoveTrialText').classList.add('swap-description');
  input.setAttribute('aria-label',document.getElementById('builderMoveTrialText').textContent);
  document.getElementById('builderMoveTrialGain').textContent = moveTrial.best ? `+${moveTrial.best.gain.toFixed(1)} points` : '';
}
function moveSuggestionRanker(ours) {
  const species=battleSpecies(ours,'our');
  // Equal defenses let physical and special moves compete using our exact build.
  // Grass has no type immunities; its type modifier is shared within each type.
  const benchmark={id:'Snorlax',name:'Snorlax',types:['Grass'],stats:{hp:200,atk:100,def:100,spa:100,spd:100,spe:100}};
  return name=>{
    const range=Battle.range(species,ours,benchmark,{investment:{},ability:'No Ability'},name,{
      format:state.format,weather:state.weather,terrain:state.terrain,attackerAlliesFainted:state.alliesFainted,attackerStages:statStages(ours,'our')});
    const meta=range.meta || Battle.moveMeta(name);
    return {type:meta.type,power:Offense.meanDamage(range.rolls) ?? 0};
  };
}
function highlightTierChanges(rows,baseline) {
  const identity=row=>row.scenarioId || row.species.id;
  const before=new Map(baseline.map(row=>[identity(row),row.kind]));
  return rows.map(row=>before.has(identity(row)) && before.get(identity(row))!==row.kind
    ? {...row,baselineKind:before.get(identity(row))} : row);
}
function prepareMoveTrial(selected) {
  const profiles = builderOffenseProfiles(selected);
  const key = JSON.stringify([offenseSignature,state.activeTeamId,state.activeOurIndex,selected.moveSet,state.builderTopN,profiles.map(p=>p.key)]);
  if (key !== moveTrial.key) moveTrial = {key,enabled:false,best:null,running:false,finished:false};
  const trial = moveTrial;
  if (!trial.running && !trial.finished) {
    trial.running = true;
    const active = () => moveTrial === trial && state.view === 'builder' && state.builderPanel === 'offense';
    setTimeout(async () => {
      const result = await Offense.bestSwap([...selected.moveSet],battleSpecies(selected,'our').learnset,profiles,{
        active,rankMove:moveSuggestionRanker(selected),pause:()=>new Promise(resolve=>setTimeout(resolve,0))
      });
      trial.running = false;
      if (!active()) return;
      trial.best = result; trial.finished = true; updateMoveTrialControl();
    },0);
  }
  updateMoveTrialControl();
}
function renderBuilderOffense(selected) {
  prepareMoveTrial(selected);
  const preview = {...selected,moveSet:[...selected.moveSet],investment:{...selected.investment}};
  if (moveTrial.enabled && moveTrial.best) preview.moveSet[moveTrial.best.slot] = moveTrial.best.to;
  const categories=new Set(preview.moveSet.map(Battle.moveMeta).filter(Boolean).map(meta=>meta.category));
  let removingInvestment=false;
  const thresholdStats=[];
  for (const [stat,prefix,category] of [['atk','builderAttack','Physical'],['spa','builderSpecialAttack','Special']]) {
    const trial=getAttackTrial(selected,stat),input=document.getElementById(`${prefix}Reduction`);
    const relevant=categories.has(category);
    document.getElementById(`${prefix}TrialRow`).hidden=!relevant;
    document.getElementById(`${prefix}TrialRow`).classList.toggle('preview-active',trial.enabled);
    input.max=String(selected.investment[stat]);input.value=String(trial.points);
    input.disabled=!selected.investment[stat];
    document.getElementById(`${prefix}Lock`).disabled=!trial.points || !selected.investment[stat];
    document.getElementById(`${prefix}Trial`).checked=trial.enabled;
    document.getElementById(`${prefix}Trial`).disabled=!selected.investment[stat];
    if(relevant && trial.enabled) thresholdStats.push(stat);
    if (relevant && trial.enabled && trial.points) {
      preview.investment[stat]-=trial.points;removingInvestment=true;
    }
  }
  const baseline=builderOffenseRows(selected);
  let rows = builderOffenseRows(preview);
  renderBuilderScore(baseline,rows);
  if ((moveTrial.enabled && moveTrial.best) || removingInvestment) rows=highlightTierChanges(rows,baseline);
  rows=annotateOffenseThresholds(preview,thresholdStats,rows);
  document.getElementById('builderSelectedSummary').innerHTML=`<strong>${escapeHtml(selected.nickname || battleSpecies(selected,'our').name)}</strong><span>ATK ${getEffectiveStat(preview,'atk')} · SPA ${getEffectiveStat(preview,'spa')}</span>`;
  renderOffenseRows(rows,`${state.activeTeamId}:${state.activeOurIndex}:${selected.id}:${state.format}:${state.builderTopN}`,
    '');
}
function renderBuilderScore(baseline,preview=baseline,{lower=false,balance=false}={}) {
  const node=document.getElementById('builderScore');
  const score=rows=>balance ? Balance.totalScore(rows) : rows.reduce((sum,row)=>sum+Offense.points(row)*(row.weight ?? 1),0);
  const before=score(baseline),after=score(preview),delta=after-before;
  node.hidden=false;
  node.textContent=`Baseline: ${before.toFixed(1)} points${Math.abs(delta)>1e-9 ? ` · Preview: ${after.toFixed(1)} (${delta>0 ? '+' : ''}${delta.toFixed(1)})` : ''} · ${lower ? 'Lower' : 'Higher'} is better`;
  node.title=`${state.metaMode ? 'Weighted by Pokémon usage in the meta.' : 'Each displayed Pokémon has equal weight.'} Baseline uses the saved build, without active previews.`;
}

function renderOffenseRows(rows,key,context = '',groups = Offense.groups) {
  const list = document.getElementById('builderOffenseTiers');
  const names = groups.reduce((labels,group) => ({...labels,[group.kind]:group.label}),{});
  const chances=new Map(rows.map(row=>[row,state.builderPanel==='balance' ? row.score : Offense.tierProbability(row)]));
  list.innerHTML = groups.map(group => {
    const members = rows.filter(row => row.kind === group.kind).sort((a,b) =>
      (chances.get(b) ?? -Infinity)-(chances.get(a) ?? -Infinity) || (b.score ?? -Infinity)-(a.score ?? -Infinity)
      || (a.rank ?? Infinity)-(b.rank ?? Infinity) || a.species.name.localeCompare(b.species.name));
    if (!members.length) return '';
    const icons = members.map(member => {
      const defense=state.builderPanel==='defense',balance=state.builderPanel==='balance';
      const detail=member.error || (balance
        ? [`Estimated wins: ${(100*member.wins/member.samples).toFixed(1)}%`,
           `We act first: ${member.samples>member.unknown ? (100*member.first/(member.samples-member.unknown)).toFixed(1) : 0}% of modeled duels`,
           `Core: ${(member.coreModel?.core || []).map(move=>move.name).join(' + ') || 'unavailable'}; 2 sampled coverage moves`,
           `${member.samples-member.unknown}/${member.samples} modeled · ${member.unknown} unmodeled · ${member.draws} draws`,
           ...(member.coreModel?.warnings || []),
           'Estimated builds + items; direct attacks only.'].join('\n')
        : defense
          ? [`Best attacks: ${(member.bestAttacks || []).slice(0,4).map(move=>`${move.name} ${move.percent.toFixed(1)}%`).join(' · ') || 'none'}`,
             member.bestAttacks?.length>4 ? `+${member.bestAttacks.length-4} other attacks` : '',
             'Attack shares are estimated per set, not move usage.'].filter(Boolean).join('\n')
          : [`${member.attacker ? member.attacker+' · ' : ''}${member.move || 'No effective attack'}`,
             member.hitModel ? `${member.hitModel.expected.toFixed(1)} hits on average, including misses` : '',
             member.extraTurns ? '+1 turn for Disguise' : '',
             member.firstHitAbility ? `${member.firstHitAbility}: first hit halved` : '',
             member.repeatedUse ? 'Includes repeated-use stat drops' : ''].filter(Boolean).join('\n'));
      const changed=member.baselineKind;
      // Tier direction and optimization points differ: Might OHKO and 2HKO
      // intentionally score equally, but losing the OHKO chance improves defense.
      const currentTier=groups.findIndex(group=>group.kind===member.kind);
      const previousTier=groups.findIndex(group=>group.kind===changed);
      const better=changed && (state.builderPanel==='defense' ? currentTier>previousTier : currentTier<previousTier);
      const scenario=member.scenario;
      const assumption=scenario ? `${scenario.value}${scenario.field==='terrain' ? ' Terrain' : ''}: ${scenario.active ? 'active' : 'inactive'} (${scenario.ability})` : '';
      const thresholds=(member.statThresholds || []).map(threshold=>{
        const label={atk:'Atk',spa:'SpA',defense:'Def SP'}[threshold.stat];
        const delta=threshold.low===threshold.high ? `${threshold.high}` : `${threshold.low}–${threshold.high}`;
        const text=threshold.pending ? `${label} …` : threshold.error ? `${label} ?` : threshold.high ? `−${delta} ${label}` : '';
        const explanation=threshold.pending ? `${label}: calculating…` : threshold.error ? `${label}: unavailable`
          : threshold.high ? `Remove ${delta} ${label} → ${names[threshold.kind]} (${threshold.stat==='defense' ? 'approximate bulk-removal path' : 'approximate threshold'})`
          : `${label}: no tier change within ${threshold.limit} removable points`;
        return {text,explanation,stat:threshold.stat};
      });
      const showChance=state.builderPanel!=='balance',chance=showChance ? Offense.tierProbability(member) : null;
      const chanceText=chance===null ? '' : chance>0 && chance<0.001 ? '<0.1%' : `${(100*chance).toFixed(1).replace(/\.0$/,'')}%`;
      const hits=Offense.tierHits(member.kind),koTarget=state.builderPanel==='defense' ? 'opponent KOing us' : 'KOing the opponent';
      const chanceDetail=showChance ? chance===null ? 'KO estimate unavailable.'
        : `${chanceText} chance of ${koTarget} ${hits===Infinity ? 'over the modeled attack sequence' : `within ${hits} attack${hits===1 ? '' : 's'}`}\nUsage-weighted; ${member.accuracyMode==='multi-hit' ? 'includes hit accuracy/count' : 'excludes accuracy'}; no healing.` : '';
      const description = [assumption,member.species.name,
        showChance ? chanceDetail : '',names[member.kind],detail,
        changed ? `Preview: ${names[changed]} → ${names[member.kind]}` : '',
        ...thresholds.map(t=>t.explanation)].filter(Boolean).join('\n');
      const hasModeled=member.samples>(member.unknown || 0);
      const winText=hasModeled ? `${(100*member.wins/member.samples).toFixed(1).replace(/\.0$/,'')}%` : '';
      const winBadge=state.builderPanel==='balance' && hasModeled ? `<span class="balance-win-badge" aria-label="Estimated win percentage">${winText}</span>` : '';
      const chanceBadge=showChance && chance!==null ? `<span class="ko-chance-badge" title="${escapeHtml(chanceDetail)}" aria-label="${escapeHtml(chanceDetail)}">${chanceText}</span>` : '';
      return `<span class="tier-pokemon${builderReferences.has(member.species.id) ? ' reference-highlighted' : ''}${showChance && chance!==null ? ' has-ko-chance' : ''}${scenario?.active ? ` field-assumed field-${scenario.value.toLowerCase()}` : ''}${changed ? ` tier-changed ${better ? 'tier-improved' : 'tier-worsened'}` : ''}" ${referenceAttributes(member.species.id)} data-scenario-id="${escapeHtml(member.scenarioId || member.species.id)}" data-scenario-weight="${member.weight ?? 1}" ${scenario ? `data-field-active="${scenario.active}"` : ''} ${changed ? `data-baseline-tier="${changed}"` : ''} data-offense-species="${escapeHtml(member.species.id)}" ${state.builderPanel === 'defense' ? `data-defense-species="${escapeHtml(member.species.id)}"` : state.builderPanel === 'balance' ? `data-balance-species="${escapeHtml(member.species.id)}"` : ''} title="${escapeHtml(description)}">
        <img src="${getPokemonImage(member.species.name)}" alt="${escapeHtml(description)}" loading="lazy" />${winBadge}${chanceBadge}${thresholds.some(t=>t.text) ? `<span class="stat-thresholds">${thresholds.filter(t=>t.text).map(t=>`<span class="stat-threshold-badge" data-stat-threshold="${t.stat}">${escapeHtml(t.text)}</span>`).join('')}</span>` : ''}</span>`;
    }).join('');
    return `<section class="builder-tier-group" data-offense-group="${group.kind}"><h3>${group.kind === 'guaranteed-ohko' ? 'Nearly Guaranteed OHKO<sup class="ko-caveat" tabindex="0" title="Based on reported statistical usage spreads, not the maximum possible bulk. Unreported builds may survive." aria-label="Based on usage spreads, not maximum possible bulk">?</sup>' : group.label}${state.builderPanel==='balance' ? '' : `<small class="tier-point-value">${Offense.points(group)} points</small>`}${members.length ? tierSelectionControls() : ''}<span class="offense-tier-count">${members.length}</span></h3><div class="tier-icon-cloud">${icons}</div></section>`;
  }).join('');
  if (key !== offenseAnchorKey) { offenseAnchorKey = key; list.scrollTop = 0; }
  document.getElementById('builderOffenseContext').textContent = `${state.format} · Weather: ${state.weather || 'None'} · Terrain: ${state.terrain || 'None'}${context}`;
}
function resetTeamOffenseSelection() {
  state.teamOffenseExcluded=new WeakSet(state.ourTeam.slice(2));
  state.teamOffenseCustomized=false;
}
function teamOffenseSelected() {
  return state.ourTeam.map((entry,index) => ({entry,index})).filter(({entry}) => !state.teamOffenseExcluded.has(entry));
}
function teamOffenseRows(profiles,preview = true) {
  const selected = teamOffenseSelected();
  if (!selected.length) return [];
  return profiles[selected[0].index].map((profile,targetIndex) => {
    const results = selected.map(({entry,index}) => {
      const moves = [...entry.moveSet],trial = teamMoveTrials.get(index);
      if (preview && trial?.enabled && trial.best) moves[trial.best.slot] = trial.best.to;
      return {...Offense.best(moves.map(name => profiles[index][targetIndex].evaluate(name))),attacker:pokemonDisplayName(entry)};
    });
    return {scenarioId:profile.scenarioId,scenario:profile.scenario,weight:profile.weight,species:profile.species,reference:profile.reference,rank:profile.rank,...Offense.best(results)};
  });
}
function renderTeamMoveTrials() {
  document.getElementById('teamOffenseTrials').innerHTML = teamOffenseSelected().map(({entry,index}) => {
    const trial = teamMoveTrials.get(index);
    const text = trial?.best ? `Try <b>${escapeHtml(trial.best.to)}</b> <span class="swap-over">over ${escapeHtml(trial.best.from)}</span>`
      : trial?.finished ? 'No move swap improves team coverage.' : 'Finding best move swap…';
    return `<div class="team-move-trial ${trial?.enabled ? 'preview-active' : ''}"><input type="checkbox" aria-label="Preview move swap for ${escapeHtml(pokemonDisplayName(entry))}" data-team-move-trial="${index}" ${trial?.enabled ? 'checked' : ''} ${trial?.best && trial.finished ? '' : 'disabled'} />
      <strong>${escapeHtml(pokemonDisplayName(entry))}</strong><span class="swap-description">${text}</span>${trial?.best ? `<small>+${trial.best.gain.toFixed(1)} points</small>` : ''}<button type="button" class="mini-button" data-team-move-lock="${index}" title="Save only this Pokémon’s move swap" ${trial?.best && trial.finished ? '' : 'disabled'}>Lock In Move</button></div>`;
  }).join('');
}
function prepareTeamMoveTrials(profiles) {
  const key = JSON.stringify([state.activeTeamId,state.builderTopN,state.ourTeam.map(entry =>
    [entry.moveSet,!state.teamOffenseExcluded.has(entry)]),profiles.map(rows => rows?.map(p=>p.key))]);
  if (key !== teamTrialContext) { teamTrialContext = key; teamMoveTrials = new Map(); }
  for (const {index,entry} of teamOffenseSelected()) {
    if (!teamMoveTrials.has(index)) teamMoveTrials.set(index,{enabled:false,best:null,running:false,finished:false});
    const trial = teamMoveTrials.get(index);
    if (trial.running || trial.finished) continue;
    trial.running = true;
    const active = () => teamTrialContext === key && teamMoveTrials.get(index) === trial
      && state.view === 'builder' && state.builderPanel === 'team-offense';
    // Teammates remain available when trying a replacement, including an empty moveset.
    const targets = profiles[index].map((profile,targetIndex) => {
      const teammates = teamOffenseSelected().filter(member => member.index !== index);
      const baseline = Offense.best(teammates.map(({entry,index}) =>
        Offense.best(entry.moveSet.map(name => profiles[index][targetIndex].evaluate(name)))));
      return {baseline,weight:profile.weight,evaluate:name => Offense.best([baseline,profile.evaluate(name)])};
    });
    setTimeout(async () => {
      if (!active()) { trial.running = false; return; }
      const result = await Offense.bestSwap([...entry.moveSet],battleSpecies(entry,'our').learnset,targets,{
        active,rankMove:moveSuggestionRanker(entry),pause:()=>new Promise(resolve=>setTimeout(resolve,0))
      });
      trial.running = false;
      if (!active()) return;
      trial.best = result;trial.finished = true;renderTeamMoveTrials();
    },0);
  }
  renderTeamMoveTrials();
}
function renderTeamOffense() {
  const profiles = state.ourTeam.map(entry => state.teamOffenseExcluded.has(entry) ? null : builderOffenseProfiles(entry));
  prepareTeamMoveTrials(profiles);
  const members = teamOffenseSelected();
  document.getElementById('builderSelectedSummary').innerHTML = members.length ? `<strong>Move swaps</strong><span>${members.length} active ${members.length === 1 ? 'member' : 'members'}</span>` : '';
  const ordered = state.ourTeam.map((entry,index) => ({entry,index})).sort((a,b) =>
    Number(state.teamOffenseExcluded.has(a.entry))-Number(state.teamOffenseExcluded.has(b.entry)));
  document.getElementById('teamOffenseMembers').innerHTML = ordered.map(({entry,index}) =>
    `<button type="button" class="mini-button team-offense-member" data-team-offense-member="${index}" aria-pressed="${!state.teamOffenseExcluded.has(entry)}">
      <img src="${getPokemonImage(battleSpecies(entry,'our').name)}" alt="" />${escapeHtml(entry.nickname || battleSpecies(entry,'our').name)}</button>`).join('');
  const key = JSON.stringify([state.activeTeamId,state.format,state.builderTopN,members.map(m=>m.index)]);
  const preview=teamOffenseRows(profiles),baseline=teamOffenseRows(profiles,false);
  renderBuilderScore(baseline,preview);
  renderOffenseRows([...teamMoveTrials.values()].some(trial=>trial.enabled)
    ? highlightTierChanges(preview,baseline) : preview,key);
  if (!members.length) document.getElementById('builderOffenseTiers').innerHTML = '<div class="empty-state">Highlight team members to compare their offense.</div>';
}
let defenseTrial = {key:'',enabled:false,best:null,running:false,finished:false,baselineRows:null,previewRows:null,worker:null};
const defenseBudgets=new WeakMap();
let defenseRequestSerial=0;
function getDefenseBudget(selected) {
  return clamp(defenseBudgets.get(selected) ?? Defense.freePoints(selected),0,Defense.freePoints(selected));
}
function cancelDefenseSearch() {
  if (defenseTrial.worker) defenseTrial.worker.terminate();
  defenseTrial.worker=null;defenseTrial.running=false;
  defenseTrial.requested=defenseTrial.finished && (!defenseTrial.enabled || Boolean(defenseTrial.thresholds));
}
function updateDefenseTrialControl(selected) {
  const free=Defense.freePoints(selected),trial=defenseTrial;
  const input=document.getElementById('builderDefenseTrial');
  const points=getDefenseBudget(selected),budgetInput=document.getElementById('builderDefensePoints');
  budgetInput.max=String(free);
  if(document.activeElement!==budgetInput || !teamDraftInputs.has(budgetInput)) budgetInput.value=String(points);
  budgetInput.hidden=!free;budgetInput.disabled=!free;
  document.getElementById('builderDefenseTrialSuffix').hidden=!free;
  input.checked=trial.enabled;input.disabled=!points || !trial.finished || !trial.best;
  document.getElementById('builderDefenseTrialRow').classList.toggle('preview-active',trial.enabled);
  document.getElementById('builderDefenseLock').disabled=!points || !trial.finished || !trial.best || trial.running;
  document.getElementById('builderDefenseTrialText').textContent=free
    ? 'Invest my'
    : 'Free up some stat points for defense and we will help you invest them :)';
  document.getElementById('builderDefenseTrialSpread').textContent=trial.error || (!points ? '' : trial.best
    ? `HP ${trial.best.investment.hp} · Def ${trial.best.investment.def} · Sp. Def ${trial.best.investment.spd}`
    : `Finding best defensive spread…${trial.evaluations ? ` ${trial.evaluations} spreads checked` : ''}`);
}
function defenseSpecies(species,side='opponent') {
  species=battleSpecies(species,side);
  return {id:species.id,name:species.name,isMega:species.isMega,stats:species.stats,types:species.types,calcId:species.calcId,megaStoneName:species.megaStoneName};
}
function renderBuilderDefense(selected) {
  const roster=builderRoster(battleSpecies(selected,'our'),false),weights=statDistributionWeights(roster);
  const job={species:defenseSpecies(selected,'our'),ours:battleEntry(selected),
    options:{format:state.format,weather:state.weather,terrain:state.terrain,attackerAlliesFainted:state.opponentsFainted},
    targets:roster.flatMap(species=>Battle.fieldScenarios(species,appliedOpponentAbility(species),state).map(condition=>{
      const usage=getUsage(species),prefs=getPreferences(species,'opponent');
      return {scenarioId:condition.scenarioId,scenario:condition.scenario,weight:condition.weight*(weights.get(species.id) ?? 1),species:defenseSpecies(species),usage:{name:usage?.name,rank:usage?.rank,moves:usage?.moves || [],spreads:usage?.spreads || []},
        options:{weather:condition.weather,terrain:condition.terrain,attackerAbility:condition.ability,attackerItem:appliedOpponentItem(species),
          attackerStages:{...statStages(species,'opponent'),offense:getPreferences(selected,'our').builderOpponentOffenseStage},defenderStages:statStages(selected,'our')},
        boosts:Object.fromEntries(['atk','def','spa','spd','spe'].map(stat=>[stat,natureBoostForMove(species,'offense',stat)]))};
    }))};
  const contextKey=JSON.stringify(job);
  job.pointBudget=getDefenseBudget(selected);
  const sameContext=defenseTrial.contextKey===contextKey;
  job.showThresholds=sameContext && defenseTrial.enabled && job.pointBudget>0;
  const key=JSON.stringify(job);
  if (key!==defenseTrial.key || (!defenseTrial.worker && !defenseTrial.finished)) {
    const previous=defenseTrial,previousBudget=previous.pointBudget;
    const sameBudget=sameContext && previousBudget===job.pointBudget;
    const localAdjustment=sameContext && Math.abs(job.pointBudget-previousBudget)===1;
    const localSteps=localAdjustment ? (previous.localSteps || 0)+1 : sameBudget ? (previous.localSteps || 0) : 0;
    const worker=sameContext ? previous.worker : null;
    if (!sameContext) cancelDefenseSearch();
    defenseTrial={key,contextKey,buildKey:JSON.stringify(selected),pointBudget:job.pointBudget,previousBudget,localAdjustment,
      previousInvestment:sameContext ? previous.best?.investment : null,
      forceFull:localAdjustment ? localSteps>=5 : !sameBudget,localSteps:localSteps>=5 ? 0 : localSteps,
      enabled:job.showThresholds,best:sameBudget ? previous.best : null,
      running:false,requested:false,finished:sameBudget && previous.finished,
      baselineRows:sameContext ? previous.baselineRows : null,previewRows:sameBudget ? previous.previewRows : null,
      thresholds:sameBudget ? previous.thresholds : null,worker,requestId:++defenseRequestSerial};
  }
  const trial=defenseTrial;
  if (!trial.requested) {
    trial.running=true;trial.requested=true;
    const fail=message=>{
      if (defenseTrial!==trial) return;
      if (trial.worker) trial.worker.terminate();
      trial.worker=null;trial.running=false;trial.finished=true;trial.error=message;
      if (state.view==='builder' && state.builderPanel==='defense') renderTeamBuilder();
    };
    try {
      const worker=trial.worker || new Worker('defense-worker.js?v=20261121-full-attacks');
      trial.worker=worker;
      worker.onmessage=({data})=>{
        if (defenseTrial!==trial || trial.worker!==worker || data.requestId!==trial.requestId) return;
        if (data.type==='error') {fail(data.message);return;}
        if (data.type==='progress') {trial.evaluations=data.evaluations;updateDefenseTrialControl(selected);return;}
        if (data.type==='baseline') trial.baselineRows=data.rows;
        if (data.type==='thresholds') trial.thresholds=data.thresholds;
        if (data.type==='done') {
          trial.best=data.best;trial.previewRows=data.rows;trial.finished=true;trial.running=false;trial.searchMode=data.searchMode;
        }
        if (state.view==='builder' && state.builderPanel==='defense') renderTeamBuilder();
      };
      worker.onerror=event=>{event.preventDefault();fail(event.message || 'Unable to start background defense calculation.');};
      worker.postMessage({...job,contextKey,requestId:trial.requestId,previousBudget:trial.previousBudget,previousInvestment:trial.previousInvestment,localAdjustment:trial.localAdjustment,forceFull:trial.forceFull});
    } catch(error) {fail(error.message);}
  }
  const investment=trial.enabled && trial.best ? trial.best.investment : selected.investment;
  document.getElementById('builderSelectedSummary').innerHTML=`<strong>${escapeHtml(selected.nickname || battleSpecies(selected,'our').name)}</strong><span>HP ${getEffectiveStat({...selected,investment},'hp')} · Def ${getEffectiveStat({...selected,investment},'def')} · Sp. Def ${getEffectiveStat({...selected,investment},'spd')}</span>`;
  if (trial.baselineRows) {
    let rows=trial.enabled && trial.best ? highlightTierChanges(trial.previewRows,trial.baselineRows) : trial.baselineRows;
    if (trial.enabled && trial.best) rows=rows.map(row=>({...row,statThresholds:[trial.thresholds?.[row.scenarioId || row.species.id] || {stat:'defense',pending:true}]}));
    renderBuilderScore(trial.baselineRows,rows,{lower:true});
    renderOffenseRows(rows,`defense:${state.activeTeamId}:${state.activeOurIndex}:${state.format}:${state.builderTopN}`,'',Defense.groups);
  } else {
    document.getElementById('builderScore').hidden=true;
    document.getElementById('builderOffenseTiers').innerHTML=`<div class="empty-state" role="status">${escapeHtml(trial.error || 'Calculating incoming damage…')}</div>`;
  }
  document.getElementById('builderOffenseTiers').setAttribute('aria-label','Opponents by incoming KO tier');
  updateDefenseTrialControl(selected);
}
let balanceOptimization={worker:null,best:null,enabled:false,running:false,evaluations:0};
function stopBalanceOptimization(reset=false) {
  if(balanceOptimization.worker) balanceOptimization.worker.terminate();
  balanceOptimization.worker=null;
  if(balanceOptimization.running) balanceOptimization.message='Stopped. Best confirmed spread retained.';
  balanceOptimization.running=false;
  if(reset) balanceOptimization={worker:null,best:null,enabled:false,running:false,evaluations:0};
}
function renderBalanceOptimization() {
  const opt=balanceOptimization,total=(balanceTrial.job?.targets || []).reduce((sum,target)=>sum+(target.weight ?? 1),0);
  const rows=opt.enabled && opt.best ? opt.best.rows : balanceTrial.rows;
  const score=Balance.totalScore(rows);
  document.getElementById('builderBalanceScore').textContent=`${balanceTrial.finished ? 'Total matchup score' : 'Matchup score so far'}: ${score.toFixed(2)} / ${total.toFixed(0)}${total ? ` · average win rate ${(100*score/total).toFixed(1)}%` : ''}`;
  document.getElementById('balanceOptimizeStart').disabled=!balanceTrial.finished || Boolean(balanceTrial.error) || opt.running || !total;
  document.getElementById('balanceOptimizeStop').hidden=!opt.running;
  document.getElementById('balanceOptimizePreview').disabled=!opt.best || opt.locked;
  document.getElementById('balanceOptimizePreview').checked=opt.enabled;
  document.getElementById('balanceOptimizeLock').disabled=opt.running || !opt.best || opt.locked;
  document.getElementById('balanceOptimizeLock').textContent=opt.locked ? 'Best spread locked in' : 'Lock in best spread';
  const spread=opt.best ? ` · ${statOrder.map(stat=>`${statLabels[stat]} ${opt.best.investment[stat]}`).join(' / ')}` : '';
  document.getElementById('balanceOptimizeProgress').textContent=opt.best
    ? `${opt.running ? opt.message || 'Searching' : opt.message || 'Search complete'} · ${opt.evaluations} spreads evaluated (limit 160) · Best confirmed: ${opt.best.score.toFixed(2)} / ${total.toFixed(0)}${spread}`
    : opt.message || '';
}
function lockSuggestedMove(index=state.activeOurIndex,team=false) {
  const entry=state.ourTeam[index],trial=team ? teamMoveTrials.get(index) : moveTrial;
  if(!entry || !trial?.finished || !trial.best || entry.moveSet[trial.best.slot]!==trial.best.from) return;
  entry.moveSet[trial.best.slot]=trial.best.to;
  trial.enabled=false;
  saveTeamToStorage();render();
}
function lockAttackReduction(stat) {
  const entry=state.ourTeam[state.activeOurIndex];if(!entry) return;
  const trial=getAttackTrial(entry,stat),points=clamp(trial.points,0,entry.investment[stat]);
  if(!points) return;
  entry.investment[stat]-=points;trial.enabled=false;trial.points=0;
  saveTeamToStorage();render();
}
function lockDefenseSpread() {
  const entry=state.ourTeam[state.activeOurIndex],trial=defenseTrial;
  if(!entry || !trial.finished || trial.running || !trial.best || !getDefenseBudget(entry)) return;
  entry.investment={...trial.best.investment};trial.enabled=false;
  defenseBudgets.set(entry,0);cancelDefenseSearch();
  saveTeamToStorage();render();
}
function lockBalanceSpread() {
  const opt=balanceOptimization,selected=state.ourTeam[state.activeOurIndex];
  if(!selected || opt.running || !opt.best || opt.locked || !balanceTrial.finished) return;
  selected.investment={...opt.best.investment};
  balanceTrial.job.ours=battleEntry(selected);
  balanceTrial.key=JSON.stringify(balanceTrial.job);
  balanceTrial.rows=opt.best.rows;
  balanceTrial.finished=true;
  opt.enabled=false;opt.locked=true;opt.message='Best spread saved';
  saveTeamToStorage();render();
}
function startBalanceOptimization() {
  if(!balanceTrial.finished || !balanceTrial.job) return;
  const warm=balanceOptimization.best?.investment;
  const starts=[warm,defenseTrial.buildKey===JSON.stringify(balanceTrial.job.ours) ? defenseTrial.best?.investment : null].filter(Boolean);
  stopBalanceOptimization(true);
  const opt=balanceOptimization,worker=new Worker('balance-opt-worker.js?v=20261121-full-attacks');
  opt.worker=worker;opt.running=true;opt.message='Starting search';
  worker.onmessage=({data})=>{
    if(balanceOptimization!==opt || opt.worker!==worker) return;
    if(data.type==='progress') {opt.evaluations=data.evaluations;opt.message=data.phase || 'Searching';}
    if(data.type==='confirming') opt.message='Validating a promising spread at 256 trials';
    if(data.type==='best' || data.type==='done') opt.best=data.best;
    if(data.type==='done' || data.type==='error') {
      opt.message=data.type==='error' ? data.message : 'Search complete';
      opt.running=false;worker.terminate();opt.worker=null;
    }
    if(data.type==='progress' || data.type==='confirming') renderBalanceOptimization();else renderBalanceResults();
  };
  worker.onerror=event=>{event.preventDefault();if(balanceOptimization!==opt) return;stopBalanceOptimization();opt.message=event.message;renderBalanceOptimization();};
  worker.postMessage({job:balanceTrial.job,baselineRows:balanceTrial.rows,starts});renderBalanceOptimization();
}

let balanceTrial={key:'',worker:null,rows:[],finished:false};
function cancelBalanceSearch() {
  stopBalanceOptimization();
  if(balanceTrial.worker) balanceTrial.worker.terminate();
  balanceTrial.worker=null;
}
function renderBalanceResults() {
  const rows=balanceOptimization.enabled && balanceOptimization.best ? highlightTierChanges(balanceOptimization.best.rows,balanceTrial.rows) : balanceTrial.rows;
  renderBalanceOptimization();
  renderBuilderScore(balanceTrial.rows,rows,{balance:true});
  const selected=state.ourTeam[state.activeOurIndex];
  if(selected) {
    const build=balanceOptimization.enabled && balanceOptimization.best ? {...selected,investment:balanceOptimization.best.investment} : selected;
    document.getElementById('builderSelectedSummary').innerHTML=`<strong>${escapeHtml(selected.nickname || battleSpecies(selected,'our').name)}</strong><span>${statOrder.map(stat=>`${statLabels[stat]} ${getEffectiveStat(build,stat)}`).join(' · ')}</span>`;
  }
  renderOffenseRows(rows,`balance:${state.activeTeamId}:${state.activeOurIndex}:${state.format}:${state.builderTopN}`,'',Balance.groups);
  const status=document.getElementById('builderBalanceStatus');
  status.textContent=balanceTrial.error || (balanceTrial.finished ? '256 usage-sampled duels per matchup · hover for assumptions' : `Simulating 1v1s… ${balanceTrial.rows.length}/${balanceTrial.total} matchups`);
  if(!balanceTrial.rows.length) document.getElementById('builderOffenseTiers').innerHTML=`<div class="empty-state">${escapeHtml(balanceTrial.error || 'Simulating full-HP matchups…')}</div>`;
  document.getElementById('builderOffenseTiers').setAttribute('aria-label','Estimated 1v1 matchup outcomes');
}
function renderBuilderBalance(selected) {
  const roster=builderRoster(battleSpecies(selected,'our'),false),weights=statDistributionWeights(roster);
  const job={species:defenseSpecies(selected,'our'),ours:battleEntry(selected),
    targets:roster.flatMap(species=>Battle.fieldScenarios(species,appliedOpponentAbility(species),state).map(condition=>{
      const usage=getUsage(species) || {};
      const abilities=species.abilities.length===1 ? [{name:species.abilities[0],percent:100}]
        : opponentAbilityChoice(species)!=='auto' || condition.scenario?.active ? [{name:condition.ability,percent:100}]
        : (usage.abilities || []).filter(row=>species.abilities.includes(row.name));
      return {species:defenseSpecies(species),usage:{name:usage.name,rank:usage.rank,moves:usage.moves || [],spreads:usage.spreads || [],natures:usage.natures || [],items:usage.items || []},
        ability:condition.ability,abilities,scenarioId:condition.scenarioId,scenario:condition.scenario,weight:condition.weight*(weights.get(species.id) ?? 1),
        field:{weather:condition.weather,terrain:condition.terrain,ourFainted:state.alliesFainted,opponentsFainted:state.opponentsFainted,
          ourStages:statStages(selected,'our'),opponentStages:statStages(species,'opponent')}};
    }))};
  const key=JSON.stringify(job);
  if(key!==balanceTrial.key) {
    const withoutWeights=value=>JSON.stringify({...value,targets:value.targets.map(({weight,...target})=>target)});
    const reusable=balanceTrial.finished && !balanceTrial.error && balanceTrial.job && withoutWeights(job)===withoutWeights(balanceTrial.job);
    const weightsById=new Map(job.targets.map(target=>[target.scenarioId,target.weight]));
    const rows=reusable ? balanceTrial.rows.map(row=>({...row,weight:weightsById.get(row.scenarioId)})) : [];
    cancelBalanceSearch();stopBalanceOptimization(true);
    balanceTrial={key,worker:null,rows,finished:Boolean(reusable),total:job.targets.length};
  }
  balanceTrial.job=job;
  const audit=new Map();
  for(const target of job.targets) {
    const model=Balance.movesetModel(target.usage.moves),id=target.usage.name || target.species.name;
    if(!model.warnings.length) continue;
    if(!audit.has(id)) audit.set(id,{model,names:new Set()});
    audit.get(id).names.add(target.species.name);
  }
  document.getElementById('builderBalanceCoreSummary').textContent=`Fixed-core model cautions: ${audit.size} usage references`;
  document.getElementById('builderBalanceCoreAudit').innerHTML=[...audit.values()].map(({model,names})=>
    `<li><strong>${escapeHtml([...names].join(' / '))}</strong>: ${escapeHtml(model.warnings.join(' '))}</li>`).join('') || '<li>No structural cautions for the current selection. The fixed pair remains an assumption, not observed joint data.</li>';
  const trial=balanceTrial;
  if(!trial.worker && !trial.finished) {
    const fail=message=>{if(balanceTrial!==trial) return;trial.error=message;trial.finished=true;cancelBalanceSearch();renderBalanceResults();};
    try {
      const worker=new Worker('balance-worker.js?v=20261121-full-attacks');trial.worker=worker;
      worker.onmessage=({data})=>{
        if(balanceTrial!==trial || trial.worker!==worker) return;
        if(data.type==='error') {fail(data.message);return;}
        if(data.type==='progress') trial.started=true;
        if(data.type==='row') {
          const index=trial.rows.findIndex(row=>row.scenarioId===data.row.scenarioId);
          if(index<0) trial.rows.push(data.row);else trial.rows[index]=data.row;
        }
        if(data.type==='done') {trial.finished=true;worker.terminate();trial.worker=null;}
        if(state.view==='builder' && state.builderPanel==='balance') renderBalanceResults();
      };
      worker.onerror=event=>{event.preventDefault();fail(event.message || 'Unable to calculate Balance matchups.');};
      worker.postMessage(job);
    } catch(error) {fail(error.message);}
  }
  document.getElementById('builderSelectedSummary').innerHTML=`<strong>${escapeHtml(selected.nickname || battleSpecies(selected,'our').name)}</strong><span>${statOrder.map(stat=>`${statLabels[stat]} ${getEffectiveStat(selected,stat)}`).join(' · ')}</span>`;
  renderBalanceResults();
}

function centerBuilderTie() {
  if (state.view !== 'builder' || state.builderPanel !== 'speed') return;
  const list = document.getElementById('builderSpeedTiers');
  const anchor = document.getElementById('builderSpeedTie');
  if (anchor) {
    const box = anchor.getBoundingClientRect(), viewport = list.getBoundingClientRect();
    list.scrollTop += box.top + box.height/2 - viewport.top - list.clientHeight/2;
  }
}
function setView(view) {
  if(view!=='battle')opponentVoice?.cancel();
  if (view!=='builder') {cancelDefenseSearch();cancelOffenseThresholdSearch();cancelBalanceSearch();}
  state.view = view;
  saveUISettings();
  document.querySelector('.layout').dataset.view = view;
  document.querySelector('.battle-panel').hidden = view === 'builder';
  document.querySelector('.opponent-panel').hidden = view === 'builder';
  document.getElementById('teamBuilderPanel').hidden = view !== 'builder';
  for (const [id,selected] of [['battleViewButton',view === 'battle'],['teamBuilderButton',view === 'builder']]) {
    const button = document.getElementById(id);
    button.classList.toggle('primary-button',selected); button.classList.toggle('secondary-button',!selected);
    button.classList.toggle('active',selected); button.setAttribute('aria-pressed',String(selected));
  }
  builderAnchorKey = ''; renderTeamBuilder();
  renderTeam();
}
function renderTeamBuilder() {
  if (state.view !== 'builder') return;
  renderReferenceControls();
  if(state.builderPanel!=='offense') cancelOffenseThresholdSearch();
  if(state.builderPanel!=='balance') cancelBalanceSearch();
  state.builderTopN = clamp(state.builderTopN,1,builderRankLimit());
  document.getElementById('builderTopN').value = String(state.builderTopN);
  document.getElementById('builderUsageFormat').textContent = `by ${state.format} usage`;
  const selected = state.ourTeam[state.activeOurIndex];
  const summary = document.getElementById('builderSelectedSummary');
  const teamOffense = state.builderPanel === 'team-offense';
  const defense = state.builderPanel === 'defense';
  const balance = state.builderPanel === 'balance';
  const offense = state.builderPanel === 'offense' || teamOffense;
  const damage = offense || defense || balance;
  document.getElementById('builderBalanceAssumptions').hidden=!balance || !selected;
  document.getElementById('builderBalanceStatus').hidden=!balance || !selected;
  document.getElementById('builderBalanceOptimize').hidden=!balance || !selected;
  document.getElementById('builderDefenseTrialRow').hidden = !defense || !selected;
  document.getElementById('builderDefenseAssumptions').hidden = !defense || !selected;
  document.getElementById('teamOffenseMembers').hidden = !teamOffense;
  document.getElementById('teamOffenseTrials').hidden = !teamOffense || !selected;
  document.getElementById('teamOffenseNote').hidden = !teamOffense;
  document.getElementById('builderMoveTrialRow').hidden = !offense || teamOffense || !selected;
  document.getElementById('builderAttackTrialRow').hidden = state.builderPanel!=='offense' || !selected;
  document.getElementById('builderSpecialAttackTrialRow').hidden = state.builderPanel!=='offense' || !selected;
  document.getElementById('builderOffenseFields').append(document.getElementById('builderStages'));
  renderBuilderStages(selected);
  document.getElementById('builderOffenseFields').hidden = !damage;
  document.getElementById('offenseFaintedInput').closest('.fainted-control').hidden = defense;
  document.getElementById('defenseFaintedInput').closest('.fainted-control').hidden = !defense && !balance;
  renderFieldOptions();
  renderFaintedOptions();
  document.getElementById('builderPanelTitle').textContent = balance ? 'Balance' : defense ? 'Defense' : teamOffense ? 'Team Offense' : offense ? 'Offense' : 'Speed Tiers';
  document.getElementById('builderSpeedTiers').hidden = damage;
  document.getElementById('builderOffenseTiers').hidden = !damage;
  document.getElementById('builderOffenseTiers').setAttribute('aria-label','Opponent KO tiers');
  document.getElementById('builderOffenseAssumptions').hidden = !offense || !selected;
  for (const button of document.querySelectorAll('[data-builder-panel]')) {
    const active = button.dataset.builderPanel === state.builderPanel;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  }
  document.getElementById('builderScore').hidden=!damage || !selected;
  const list = document.getElementById(damage ? 'builderOffenseTiers' : 'builderSpeedTiers');
  if(builderReferences.only && !builderReferences.active.ids.length) {
    document.getElementById('builderScore').hidden=true;
    for(const id of ['builderMoveTrialRow','builderAttackTrialRow','builderSpecialAttackTrialRow','builderDefenseTrialRow','teamOffenseTrials','builderBalanceOptimize']) document.getElementById(id).hidden=true;
    summary.textContent=selected?.name || '';
    list.innerHTML='<div class="empty-state">Search above to highlight Pokémon, or turn off ★ to return to Top N.</div>';
    return;
  }
  if (teamOffense) { renderTeamOffense(); return; }
  if (!selected) {
    builderAnchorKey = '';
    summary.textContent = '';
    list.innerHTML = `<div class="empty-state">Add a Pokémon to explore ${offense ? 'offense' : 'speed tiers'}.</div>`;
    return;
  }
  const species = battleSpecies(selected,'our');
  if (balance) { renderBuilderBalance(selected);return; }
  if (defense) { renderBuilderDefense(selected);return; }
  if (offense) {
    summary.innerHTML = `<strong>${escapeHtml(selected.nickname || battleSpecies(selected,'our').name)}</strong><span>ATK ${getEffectiveStat(selected,'atk')} · SPA ${getEffectiveStat(selected,'spa')}</span>`;
    renderBuilderOffense(selected);return;
  }
  const combatant=battleEntry(selected,species);
  const data = Battle.builderSpeedGroups(builderRoster(species),species,{...combatant,speedStage:getPreferences(selected,'our').speedStage},{...state,opponentAbility:appliedOpponentAbility,opponentSpeedStage:getPreferences(selected,'our').builderOpponentSpeedStage});
  const ourItem=combatant.item;
  summary.innerHTML = `<strong>${escapeHtml(selected.nickname || battleSpecies(selected,'our').name)}</strong><span>Speed <b>${data.target}</b> · ${selected.investment.spe} SP · ${escapeHtml(selected.nature.name)}</span>`;
  summary.append(document.getElementById('builderStages'));
  const icon = member => {
    let description = member.species.name;
    const showEstimate=!['always-faster','always-slower'].includes(member.tier.kind);
    const chanceBadge=showEstimate && member.speedEstimate
      ? `<span class="speed-chance-badge" title="${escapeHtml(speedEstimateDescription(member.speedEstimate))}">${speedEstimateText(member.speedEstimate)}</span>` : '';
    if(showEstimate) description+=`\n${speedEstimateDescription(member.speedEstimate)}`;
    description+=`\n${speedMatchupDescription(member.tier)}`;
    description+=`\nDefault Speed (0 SP, neutral): ${member.defaultSpeed}`;
    const conditions=[member.weather,member.terrain,member.ability,ourItem ? `Our item: ${ourItem}` : ''].filter(Boolean);
    if(conditions.length) description+=`\n${conditions.join(' · ')}`;
    const investmentEligible=!(member.tier.kind==='always-slower' && member.outspeedPoints===0);
    const showBadge=investmentEligible && member.outspeedPoints!==null;
    const investmentTip=showBadge && member.outspeedPoints!==null
      ? `${member.outspeedPoints>32 ? 'With a Speed-boosting nature · ' : ''}Invest ${member.outspeedPoints} or more to always be faster` : '';
    if(investmentTip) description+=`\n${investmentTip}`;
    if(investmentEligible && member.outspeedPoints===null) description+='\nCannot guarantee outspeeding, even with max Speed + nature.';
    const badge=showBadge ? `<span class="speed-investment-badge" title="${escapeHtml(investmentTip)}&#10;Against max Speed + nature; current field, no opponent item.">${member.outspeedPoints}</span>` : '';

    return `<span class="tier-pokemon${builderReferences.has(member.species.id) ? ' reference-highlighted' : ''}" ${referenceAttributes(member.species.id)} data-tier-species="${escapeHtml(member.species.id)}" data-required-points="${member.tier.points ?? ''}" title="${escapeHtml(description)}">
      <img src="${getPokemonImage(member.species.name)}" alt="${escapeHtml(description)}" loading="lazy" />${badge}${chanceBadge}</span>`;
  };
  const cloud = members => members.length ? `<div class="tier-icon-cloud">${members.map(icon).join('')}</div>` : '';
  const tie = members => `<section id="builderSpeedTie" class="builder-speed-tie" aria-label="Matching default Speed"><h3>Same Default Speed <small>${data.defaultSpeed}</small>${tierSelectionControls()}</h3>${cloud(members)}</section>`;
  list.innerHTML = data.groups.filter(group => group.members.length).map(group => {
    const ties = group.members.filter(member => member.tie);
    const body = ties.length ? cloud(group.members.filter(member => member.defaultSpeed > data.defaultSpeed)) + tie(ties)
      + cloud(group.members.filter(member => member.defaultSpeed < data.defaultSpeed)) : cloud(group.members);
    return `<section class="builder-tier-group" data-speed-group="${group.kind}"><h3>${group.label}${tierSelectionControls()}</h3>${body}</section>`;
  }).join('');
  const key = `${state.activeTeamId}:${state.activeOurIndex}:${species.id}:${data.target}:${state.format}:${state.builderTopN}`;
  if (key !== builderAnchorKey) {
    builderAnchorKey = key;
    requestAnimationFrame(centerBuilderTie);
  }
}

function render() {
  closeUsagePicker();
  renderFormatControls();
  renderTeamLibrary();
  renderTeam();
  renderOpponentList();
  renderActiveSummary();
  renderSpeedSummary();
  renderDamageRanges();
  renderSearchResults();
  renderTeamBuilder();
  if(gridUsagePicker) {
    if(gridUsagePicker.input.isConnected || state.ourTeam.includes(gridUsagePicker.member)) refreshUsagePicker(gridUsagePicker);
    else closeUsagePicker({picker:gridUsagePicker});
  }
}

let itemTooltipTarget=null;
let itemTooltipTimer;
function hideItemTooltip() {
  clearTimeout(itemTooltipTimer);
  itemTooltipTarget?.querySelector('.item-tooltip:popover-open')?.hidePopover();
  itemTooltipTarget=null;
}
function positionItemTooltip(target,tooltip) {
  const anchor=target.getBoundingClientRect(),box=tooltip.getBoundingClientRect();
  tooltip.style.left=`${Math.max(8,Math.min(anchor.left,innerWidth-box.width-8))}px`;
  const top=anchor.bottom+6+box.height<=innerHeight-8 ? anchor.bottom+6 : anchor.top-box.height-6;
  tooltip.style.top=`${Math.max(8,Math.min(top,innerHeight-box.height-8))}px`;
}
function scheduleItemTooltip(target) {
  if(itemTooltipTarget===target) return;
  const tooltip=target.querySelector('.item-tooltip');
  if(!tooltip) return;
  hideItemTooltip();
  itemTooltipTarget=target;
  itemTooltipTimer=setTimeout(()=>{
    if(!target.isConnected) {
      hideItemTooltip();
      return;
    }
    tooltip.showPopover();
    positionItemTooltip(target,tooltip);
  },500);
}
function bindStaticControls() {
  bindTeamReorder(document.getElementById('ourTeamList'));
  const iconSize=document.getElementById('builderIconSize');
  const applyIconSize=value=>{
    const size=clamp(Number(value) || 94.5,54,160);
    iconSize.value=String(size);iconSize.title=`${size}px`;
    document.getElementById('teamBuilderPanel').style.setProperty('--builder-icon-size',`${size}px`);
  };
  try {applyIconSize(localStorage.getItem('pokelator-builder-icon-size'));} catch {applyIconSize(94.5);}
  iconSize.addEventListener('input',()=>{
    applyIconSize(iconSize.value);
    try {localStorage.setItem('pokelator-builder-icon-size',iconSize.value);} catch { /* Works for this session. */ }
  });
  document.getElementById('builderMoveLock').addEventListener('click',()=>lockSuggestedMove());
  document.getElementById('builderDefenseLock').addEventListener('click',lockDefenseSpread);
  document.getElementById('builderAttackLock').addEventListener('click',()=>lockAttackReduction('atk'));
  document.getElementById('builderSpecialAttackLock').addEventListener('click',()=>lockAttackReduction('spa'));
  document.getElementById('teamOffenseTrials').addEventListener('click',event=>{
    const button=event.target.closest('[data-team-move-lock]');
    if(button) lockSuggestedMove(Number(button.dataset.teamMoveLock),true);
  });
  document.addEventListener('change',event=>{
    const input=event.target.closest('input[data-compact-stage]');
    if(!input) return;
    const role=input.dataset.compactStage,value=Number(input.value),selected=state.ourTeam[state.activeOurIndex];
    const limit=role==='builder-offense' ? 6 : 2;
    if(!Number.isInteger(value) || value < -limit || value > limit) return;
    if(role==='battle-opponent-speed') {
      const opponent=state.opponentList[state.activeOpponentIndex];
      if(!opponent) return;
      getPreferences(opponent,'opponent').speedStage=value;
    } else {
      if(!selected) return;
      const field=role==='builder-opponent-speed' ? 'builderOpponentSpeedStage' : role==='builder-opponent-offense' ? 'builderOpponentOffenseStage'
        : role==='builder-offense' ? 'offenseStage' : 'speedStage';
      const entries=role==='builder-offense' && state.builderPanel==='team-offense'
        ? teamOffenseSelected().map(({entry})=>entry) : [selected];
      for(const entry of entries) getPreferences(entry,'our')[field]=value;
    }
    savePreferences();renderDamageRanges();renderSpeedSummary();renderTeamBuilder();
    document.querySelector(`input[data-compact-stage="${role}"]:checked`)?.focus({preventScroll:true});
  });
  document.addEventListener('click',event=>{
    const stance=event.target.closest('[data-stance-side]');
    if(stance){const prefs=getPreferences(getPokemonByName('Aegislash'),stance.dataset.stanceSide);prefs.bladeActive=!prefs.bladeActive;savePreferences();render();return;}
    const button=event.target.closest('[data-mega-side]');if(!button) return;
    const side=button.dataset.megaSide;
    const index=Number(button.closest(side==='our' ? '.team-row' : '.opponent-row').dataset[side==='our' ? 'teamIndex' : 'opponentIndex']);
    const entry=(side==='our' ? state.ourTeam : state.opponentList)[index];
    const prefs=getPreferences(entry,side);
    prefs.megaActive=!prefs.megaActive;
    savePreferences();
    render();
    const row=document.querySelector(side==='our' ? `.team-row[data-team-index="${index}"]` : `.opponent-row[data-opponent-index="${index}"]`);
    (row?.querySelector('[data-mega-side]') || row?.querySelector('[data-field="item"]'))?.focus({preventScroll:true});
  });
  document.addEventListener('pointerover',event=>{
    const target=event.target.closest('.item-hint');
    if(event.pointerType!=='touch' && target && !target.contains(event.relatedTarget)) scheduleItemTooltip(target);
  });
  document.addEventListener('pointerout',event=>{
    const target=event.target.closest('.item-hint');
    if(target && target===itemTooltipTarget && !target.contains(event.relatedTarget)) hideItemTooltip();
  });
  document.addEventListener('focusin',event=>{
    if(event.target.matches('.item-hint:focus-visible')) scheduleItemTooltip(event.target);
  });
  document.addEventListener('focusout',event=>{if(event.target===itemTooltipTarget) hideItemTooltip();});
  document.addEventListener('pointerdown',hideItemTooltip);
  document.addEventListener('keydown',event=>{if(event.key==='Escape') hideItemTooltip();});
  window.addEventListener('resize',hideItemTooltip);
  document.addEventListener('scroll',()=>{
    const target=itemTooltipTarget;
    if(!target?.matches(':hover, :focus-visible')) {
      hideItemTooltip();
      return;
    }
    const tooltip=target.querySelector('.item-tooltip:popover-open');
    if(tooltip) positionItemTooltip(target,tooltip);
  },true);
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-field-option]');
    if(!button) return;
    state[button.dataset.fieldOption]=button.dataset.fieldValue;
    renderFieldOptions();renderOpponentList();renderActiveSummary();renderDamageRanges();renderSpeedSummary();renderTeamBuilder();
  });
  document.getElementById('metaModeToggle').addEventListener('click',()=>{
    state.metaMode=!state.metaMode;saveUISettings();render();
  });
  document.getElementById('balanceOptimizeLock').addEventListener('click',lockBalanceSpread);
  document.getElementById('balanceOptimizeStart').addEventListener('click',startBalanceOptimization);
  document.getElementById('balanceOptimizeStop').addEventListener('click',()=>{stopBalanceOptimization();renderBalanceOptimization();});
  document.getElementById('balanceOptimizePreview').addEventListener('change',event=>{balanceOptimization.enabled=event.target.checked;renderBalanceResults();});
  const defensePoints=document.getElementById('builderDefensePoints');
  const commitDefensePoints=event=>{
    const selected=state.ourTeam[state.activeOurIndex];
    if (!selected) return;
    const value=Number(event.target.value);
    teamDraftInputs.delete(event.target);
    defenseBudgets.set(selected,clamp(Number.isFinite(value) ? Math.floor(value) : 0,0,Defense.freePoints(selected)));
    renderTeamBuilder();
  };
  defensePoints.addEventListener('change',commitDefensePoints);
  defensePoints.addEventListener('input',event=>{
    const selected=state.ourTeam[state.activeOurIndex],value=Number(event.target.value);
    if (selected && event.target.value!=='' && Number.isInteger(value) && value>=0 && value<=Defense.freePoints(selected)) commitDefensePoints(event);
  });
  defensePoints.addEventListener('keydown',event=>{
    if (event.key==='Enter') {event.preventDefault();commitDefensePoints(event);event.target.blur();}
  });
  document.getElementById('builderDefenseTrial').addEventListener('change',event=>{
    defenseTrial.enabled=event.target.checked;renderTeamBuilder();
  });
  document.getElementById('teamOffenseMembers').addEventListener('click',event => {
    const button = event.target.closest('[data-team-offense-member]');
    if (!button) return;
    const entry = state.ourTeam[Number(button.dataset.teamOffenseMember)];
    state.teamOffenseCustomized=true;
    if (state.teamOffenseExcluded.has(entry)) state.teamOffenseExcluded.delete(entry);
    else state.teamOffenseExcluded.add(entry);
    renderTeamLibrary();renderTeam();renderTeamBuilder();
  });
  document.getElementById('teamOffenseTrials').addEventListener('change',event => {
    const index = Number(event.target.dataset.teamMoveTrial);
    const trial = teamMoveTrials.get(index);
    if (!trial?.best) return;
    trial.enabled = event.target.checked;renderTeamBuilder();
  });
  for (const button of document.querySelectorAll('[data-format]')) {
    button.addEventListener('click', () => {
      state.format = button.dataset.format;
      saveUISettings();render();
    });
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-fainted-count]');if(!button) return;
    state[button.dataset.faintedField]=Number(button.dataset.faintedCount);
    renderFaintedOptions();renderDamageRanges();renderTeamBuilder();
  });
  document.getElementById('builderMoveTrial').addEventListener('change', event => {
    moveTrial.enabled = event.target.checked; renderTeamBuilder();
  });
  for (const [stat,prefix] of [['atk','builderAttack'],['spa','builderSpecialAttack']]) {
    document.getElementById(`${prefix}Trial`).addEventListener('change',event=>{
      const selected=state.ourTeam[state.activeOurIndex];
      if (selected) {getAttackTrial(selected,stat).enabled=event.target.checked;renderTeamBuilder();}
    });
    const reduction=document.getElementById(`${prefix}Reduction`);
    const commit=event=>{
      const selected=state.ourTeam[state.activeOurIndex];
      if (!selected) return;
      const value=Number(event.target.value);
      getAttackTrial(selected,stat).points=clamp(Number.isFinite(value) ? Math.floor(value) : 0,0,selected.investment[stat]);
      renderTeamBuilder();
    };
    reduction.addEventListener('change',commit);
    reduction.addEventListener('input',event=>{
      const selected=state.ourTeam[state.activeOurIndex],value=Number(event.target.value);
      if (selected && event.target.value!=='' && Number.isInteger(value) && value>=0 && value<=selected.investment[stat]) commit(event);
    });
    reduction.addEventListener('keydown',event=>{
      if (event.key==='Enter') {event.preventDefault();commit(event);event.target.blur();}
    });
  }
  for (const button of document.querySelectorAll('[data-builder-panel]')) {
    button.addEventListener('click', () => {
      state.builderPanel = button.dataset.builderPanel;
      if (state.builderPanel!=='defense') cancelDefenseSearch();
      saveUISettings();
      builderAnchorKey = '';offenseAnchorKey = '';renderTeam();renderTeamBuilder();
    });
  }
  document.getElementById('builderTopN').addEventListener('change', event => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) state.builderTopN = clamp(Math.floor(value),1,builderRankLimit());
    try { localStorage.setItem(BUILDER_SETTINGS_KEY,JSON.stringify({topN:state.builderTopN})); }
    catch { /* The filter still works for this session if storage is blocked. */ }
    renderTeamBuilder();
  });
  document.getElementById('builderTopN').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
  });
  new ResizeObserver(() => centerBuilderTie()).observe(document.getElementById('builderSpeedTiers'));
  document.getElementById('teamLibrarySelect').addEventListener('change', event => selectLibraryTeam(event.target.value));
  document.getElementById('teamNameInput').addEventListener('change', event => {
    const team = state.teamLibrary.find(team => team.id === state.activeTeamId);
    team.name = event.target.value.trim().slice(0,80) || 'My team'; saveTeamToStorage(); renderTeamLibrary();
  });
  document.getElementById('teamNameInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
  });
  document.getElementById('newTeamButton').addEventListener('click', () => createLibraryTeam());
  document.getElementById('duplicateTeamButton').addEventListener('click', () => createLibraryTeam(true));
  document.getElementById('deleteTeamButton').addEventListener('click', () => {
    if (state.teamLibrary.length <= 1) return;
    saveTeamToStorage();
    const index = state.teamLibrary.findIndex(team => team.id === state.activeTeamId);
    state.lastDeletedTeam = state.teamLibrary.splice(index,1)[0];
    state.activeTeamId = '';
    selectLibraryTeam(state.teamLibrary[Math.min(index,state.teamLibrary.length-1)].id);
    libraryMessage('Team deleted.'); document.getElementById('undoTeamDeleteButton').hidden = false;
  });
  document.getElementById('undoTeamDeleteButton').addEventListener('click', () => {
    if (!state.lastDeletedTeam) return;
    const team = state.lastDeletedTeam; state.lastDeletedTeam = null;
    state.teamLibrary.push(team); selectLibraryTeam(team.id);
    document.getElementById('undoTeamDeleteButton').hidden = true; libraryMessage('Team restored.');
  });
  document.getElementById('exportTeamButton').addEventListener('click', () => exportTeams());
  document.getElementById('exportLibraryButton').addEventListener('click', () => exportTeams(true));
  document.getElementById('importTeamsButton').addEventListener('click', () => document.getElementById('teamImportInput').click());
  document.getElementById('teamImportInput').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { importTeamSnapshots(TeamFiles.parse(await file.text(),sanitizeTeamEntry)); }
    catch (error) { libraryMessage(`Import failed: ${error.message}`); }
    event.target.value = '';
  });
  document.getElementById('copyTeamLinkButton').addEventListener('click', copyTeamLink);
  window.addEventListener('hashchange', importSharedTeam);
  document.getElementById('battleViewButton').addEventListener('click', () => setView('battle'));
  document.getElementById('teamBuilderButton').addEventListener('click', () => setView('builder'));
  document.getElementById('opponentList').addEventListener('click', event => {
    const button = event.target.closest('[data-opponent-item]');
    if (!button) return;
    const index = Number(button.closest('[data-opponent-index]').dataset.opponentIndex);
    const opponent = state.opponentList[index];
    const name = button.dataset.opponentItem;
    const species=savedSpecies(opponent);
    const prefs=getPreferences(opponent,'opponent');
    const option=getItemHints(megaBaseSpecies(species),prefs).find(item=>item.name===name);
    if(!option) return;
    if(option.megaFormId) prefs.megaFormId=prefs.megaFormId===option.megaFormId ? '' : option.megaFormId;
    else prefs.itemChoice=prefs.itemChoice===name ? '' : name;
    savePreferences();
    renderOpponentList();
    renderActiveSummary();renderDamageRanges();renderSpeedSummary();renderTeamBuilder();
    [...document.querySelectorAll(`.opponent-row[data-opponent-index="${index}"] [data-opponent-item]`)]
      .find(item => item.dataset.opponentItem === name)?.focus({preventScroll: true});
  });
  document.getElementById('teamAddForm').addEventListener('submit', event => {
    event.preventDefault();
    addTeamPokemon(document.getElementById('teamPokemonInput').value);
  });
  document.getElementById('abilityAssumptionRow').addEventListener('click', event => {
    const button = event.target.closest('button[data-assumed-ability]');
    if (!button) return;
    const name = button.dataset.assumedAbility;
    const opponent = state.opponentList[state.activeOpponentIndex];
    const species=battleSpecies(opponent,'opponent'),prefs=getOpponentPreferences();
    const choice=appliedOpponentAbility(opponent) === name ? '' : name;
    if(species.selectedMegaFromBase) prefs.megaAbilityChoices[species.calcId]=choice;
    else prefs[opponentAbilityField(species)]=choice;
    savePreferences();
    renderActiveSummary();renderDamageRanges();
    renderSpeedSummary();renderTeamBuilder();
    [...document.querySelectorAll('[data-assumed-ability]')].find(b => b.dataset.assumedAbility === name)?.focus();
  });
  document.getElementById('toggleOpponentsButton').addEventListener('click', () => {
    state.opponentsExpanded = !state.opponentsExpanded;
    renderOpponentList();
  });
  document.querySelectorAll('[data-damage-direction]').forEach(button => {
    button.addEventListener('click', () => {
      state.damageDirection = button.dataset.damageDirection;
      renderFaintedOptions();
      document.querySelectorAll('[data-damage-direction]').forEach(b => {
        b.classList.toggle('active', b === button);
        b.setAttribute('aria-pressed', String(b === button));
      });
      renderDamageRanges();
    });
  });
  const createFilters=input=>new PokemonFilters({catalog:pokemonCatalog,generation:Battle.generation,usage:pokemonUsageReference,dexNumber:pokedexNumber,
    moveMeta:Battle.moveMeta,priorityChoices,priorityRanking,usageData:getUsage,bindPicker:bindUsagePicker,moveMarkup:moveChoiceMarkup,abilityMarkup:abilityChoiceMarkup,
    shouldFloat:()=>Boolean(gridUsagePicker),
    onDismiss:()=>{if(gridUsagePicker) refreshUsagePicker(gridUsagePicker);},
    onApply:()=>{
      if(gridUsagePicker) {
        const picker=gridUsagePicker;
        resetUsagePickerQuery(picker,picker.query);
        return picker.input.getClientRects().length ? picker.input : picker.popup.querySelector('[data-picker-control="edit-filters"]');
      }
      input.value='';
    }});
  teamPokemonFilters=createFilters(document.getElementById('teamPokemonInput'));
  teamPokemonFilters.mount(document.getElementById('teamPokemonInput'));
  bindUsagePicker(document.getElementById('pokemonSearchInput'),{choices:query=>buildSearchResults(query),markup:pokemonChoiceMarkup,choose:item=>addOpponentFromSearch(item.name)});
  bindUsagePicker(document.getElementById('teamPokemonInput'),{pokemonFilters:teamPokemonFilters,choices:buildTeamSearchResults,markup:pokemonChoiceMarkup,choose:item=>addTeamPokemon(item.name,item.savedBuild,item.satisfyingSet)});
  opponentVoice=new OpponentVoice.Controller({button:document.getElementById('opponentVoiceButton'),status:document.getElementById('opponentVoiceStatus'),catalog:pokemonCatalog,rank:species=>pokemonUsageReference(species)?.percent || 0,add:addOpponentsByName,active:()=>state.view==='battle'});
  document.addEventListener('pointerdown',event=>{
    if(activeUsagePicker && !activeUsagePicker.popup.contains(event.target) && event.target!==activeUsagePicker.input) closeUsagePicker({commitDraft:true});
  });
  window.addEventListener('resize',()=>{closeUsagePicker();positionUsagePicker(gridUsagePicker);teamPokemonFilters.positionPanel();});
  document.addEventListener('scroll',event=>{
    if(event.target.closest?.('.usage-choice-popup')) return;
    if(activeUsagePicker) {
      const box=activeUsagePicker.input.getBoundingClientRect();
      if(box.bottom>0 && box.top<innerHeight)positionUsagePicker();else closeUsagePicker();
    }
    positionUsagePicker(gridUsagePicker);
    teamPokemonFilters.positionPanel();
  },true);

  const clearButton = document.getElementById('clearOpponentsButton');
  document.getElementById('resetBattleButton').addEventListener('click',resetBattle);
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      state.opponentList = [];
      state.activeOpponentIndex = 0;
      render();
    });
  }

  for(const role of ['attacker','defender']) {
    document.getElementById(`${role}StageControl`).addEventListener('change',event=>{
      if(!event.target.matches('input[data-stage-role]')) return;
      const outgoing=state.damageDirection==='outgoing',ourSide=(role==='attacker')===outgoing;
      const entry=ourSide ? state.ourTeam[state.activeOurIndex] : state.opponentList[state.activeOpponentIndex];
      if(!entry) return;
      const field=role==='attacker' ? 'offenseStage' : 'defenseStage';
      getPreferences(entry,ourSide ? 'our' : 'opponent')[field]=Number(event.target.value);
      savePreferences();renderDamageRanges();renderTeamBuilder();
      document.querySelector(`#${role}StageControl input:checked`)?.focus({preventScroll:true});
    });
  }

}

function setupItemHighlightEditor() {
  let colorUsageTimer;
  const dialog=document.getElementById('itemColorDialog');
  const rows=document.getElementById('editableColors');
  const options=[['selected','Selected Pokémon items','#70d7ff'],['other','Other Pokémon items','#3e7a91'],...APP_COLOR_OPTIONS];
  const values=key=>key==='selected' || key==='other' ? itemHighlightColors : appColors;
  const apply=()=>{
    document.documentElement.style.setProperty('--selected-item-highlight',itemHighlightColors.selected);
    document.documentElement.style.setProperty('--other-item-highlight',itemHighlightColors.other);
    for(const [key] of APP_COLOR_OPTIONS) document.documentElement.style.setProperty(`--${key}`,appColors[key]);
  };
  rows.innerHTML=options.map(([key,label])=>`<details class="color-editor-row" name="app-color-editor" data-color-key="${key}">
    <summary><span class="color-editor-swatch"></span><span>${label}</span><small></small></summary>
    <detailed-color-picker id="${key}ItemColor"></detailed-color-picker></details>`).join('');
  const sync=(updatePickers=true)=>{
    for(const row of rows.children) {
      const value=values(row.dataset.colorKey)[row.dataset.colorKey];
      row.querySelector('.color-editor-swatch').style.background=value;
      row.querySelector('small').textContent=value;
      if(updatePickers) row.querySelector('detailed-color-picker').value=value;
    }
  };
  for(const row of rows.children) {
    const key=row.dataset.colorKey;
    row.addEventListener('toggle',()=>{
      if(row.open) for(const other of rows.children) if(other!==row) other.open=false;
    });
    row.addEventListener('color-change',event=>{
      values(key)[key]=validHighlightColor(event.detail.value);apply();sync(false);
      clearTimeout(colorUsageTimer);
      colorUsageTimer=setTimeout(()=>window.SiteUsage?.count('color_change'),1000);
    });
  }
  document.getElementById('itemColorsButton').addEventListener('click',()=>{
    if(dialog.open) dialog.close();else dialog.show();
  });
  document.getElementById('closeItemColors').addEventListener('click',()=>dialog.close());
  document.getElementById('resetItemColors').addEventListener('click',()=>{
    Object.assign(itemHighlightColors,lockedItemColors);Object.assign(appColors,lockedAppColors);
    apply();sync();
  });
  document.getElementById('defaultItemColors').addEventListener('click',()=>{
    for(const [key] of options) values(key)[key]=siteColorDefaults[key];
    apply();sync();
  });
  document.getElementById('lockItemColors').addEventListener('click',()=>{
    Object.assign(lockedItemColors,itemHighlightColors);Object.assign(lockedAppColors,appColors);
    saveUISettings();
    window.SiteUsage?.count('color_saved');
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && dialog.open) dialog.close();});
  const pickButton=document.getElementById('pickElementColor');
  const outline=document.createElement('div');outline.className='color-pick-outline';outline.hidden=true;
  document.body.append(outline);
  let picking=false;
  const stopPicking=()=>{
    picking=false;document.documentElement.classList.remove('picking-ui-color');outline.hidden=true;
    pickButton.setAttribute('aria-pressed','false');pickButton.textContent='⌖ Pick element';
  };
  const colorTarget=(element,event)=>{
    if(!(element instanceof Element) || element.closest('#itemColorDialog')) return null;
    const match=(selector,key)=>{const target=element.closest(selector);return target ? {target,key} : null;};
    const item=element.closest('.item-hint[aria-pressed="true"]');
    if(item) return {target:item,key:item.closest('.expanded-team,.item-color-selected') ? 'selected' : 'other'};
    const nav=element.closest('.header-actions .primary-button');
    if(nav) {const box=nav.getBoundingClientRect();return {target:nav,key:event.clientX<box.left+box.width/2 ? 'toolbar-accent' : 'toolbar-button'};}
    // Near a visible border, select the border token rather than its surface.
    const bounds=element.getBoundingClientRect(),style=getComputedStyle(element);
    if(Math.min(event.clientX-bounds.left,bounds.right-event.clientX,event.clientY-bounds.top,bounds.bottom-event.clientY)<3
      && parseFloat(style.borderTopWidth)>0 && style.borderTopStyle!=='none' && style.borderTopColor!=='rgba(0, 0, 0, 0)')
      return {target:element,key:'soft-border'};
    const special=match('.format-toggle .active,.meta-mode[aria-pressed="true"],.field-icon[aria-pressed="true"],.stat-stage-option:has(input:checked),.team-offense-member[aria-pressed="true"]','accent')
      || match('.direction-controls .active,.builder-analysis-tabs .active','accent-strong')
      || match('input:not([type=checkbox]):not([type=radio]),select,textarea,.item-hint','control-bg')
      || match('a,.set-editor summary,.team-library summary,.spread-comparisons summary,.builder-assumptions summary,.ability-assumption','accent');
    if(special) return special;
    // Text matches by its computed token, so inherited muted/positive text works too.
    if(Array.from(element.childNodes).some(node=>node.nodeType===Node.TEXT_NODE && node.textContent.trim())) {
      const probe=document.createElement('span');probe.hidden=true;document.body.append(probe);
      for(const key of ['success','muted','accent','text']) {
        probe.style.color=`var(--${key})`;
        if(getComputedStyle(probe).color===style.color) {probe.remove();return {target:element,key};}
      }
      probe.remove();
    }
    return match('.panel','panel') || {target:document.body,key:event.clientY>innerHeight/2 ? 'bg-strong' : 'bg'};
  };
  pickButton.addEventListener('click',()=>{
    if(picking) {stopPicking();return;}
    picking=true;pickButton.setAttribute('aria-pressed','true');pickButton.textContent='⌖ Click an element · Esc cancels';
    document.documentElement.classList.add('picking-ui-color');
  });
  document.addEventListener('pointermove',event=>{
    if(!picking) return;
    const choice=colorTarget(event.target,event);outline.hidden=!choice;
    if(!choice) return;
    const bounds=choice.target.getBoundingClientRect();
    Object.assign(outline.style,{left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`});
    outline.textContent=options.find(([key])=>key===choice.key)?.[1] || '';
  });
  document.addEventListener('pointerdown',event=>{
    if(picking && !event.target.closest('#itemColorDialog')) event.preventDefault();
  },true);
  document.addEventListener('click',event=>{
    if(!picking || event.target.closest('#itemColorDialog')) return;
    event.preventDefault();event.stopImmediatePropagation();
    const choice=colorTarget(event.target,event);stopPicking();
    if(!choice) return;
    if(!dialog.open) dialog.show();
    for(const row of rows.children) row.open=row.dataset.colorKey===choice.key;
    requestAnimationFrame(()=>rows.querySelector(`[data-color-key="${choice.key}"]`).scrollIntoView({block:'nearest'}));
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && picking) {stopPicking();event.preventDefault();event.stopImmediatePropagation();}
  },true);
  dialog.addEventListener('close',stopPicking);
  const header=dialog.querySelector('.item-color-header');
  let drag=null;
  const place=(x,y)=>{
    const bounds=dialog.getBoundingClientRect();
    dialog.style.left=`${clamp(x,0,Math.max(0,innerWidth-bounds.width))}px`;
    dialog.style.top=`${clamp(y,0,Math.max(0,innerHeight-bounds.height))}px`;
    dialog.style.right=dialog.style.bottom='auto';
  };
  header.addEventListener('pointerdown',event=>{
    if(event.target.closest('button') || event.button!==0) return;
    const bounds=dialog.getBoundingClientRect();drag={x:event.clientX-bounds.left,y:event.clientY-bounds.top};
    header.setPointerCapture(event.pointerId);event.preventDefault();
  });
  header.addEventListener('pointermove',event=>{if(drag) place(event.clientX-drag.x,event.clientY-drag.y);});
  header.addEventListener('pointerup',()=>{drag=null;});
  header.addEventListener('lostpointercapture',()=>{drag=null;});
  window.addEventListener('resize',()=>{
    if(dialog.open && dialog.style.left) {const bounds=dialog.getBoundingClientRect();place(bounds.left,bounds.top);}
  });
  new ResizeObserver(()=>{
    if(dialog.open && dialog.style.left) {const bounds=dialog.getBoundingClientRect();place(bounds.left,bounds.top);}
  }).observe(dialog);
  apply();sync();
}

function initializeApp() {
  // Both views share this picker; keep it outside the hidden Battle sidebar.
  const choicePopup=document.getElementById('searchResults');
  choicePopup.classList.add('usage-choice-popup');choicePopup.setAttribute('popover','manual');
  document.body.append(choicePopup);
  document.getElementById('speciesList').innerHTML = pokerData.map(p => `<option value="${escapeHtml(p.name)}"></option>`).join('');
  repairTeamState();
  initializeTeamLibrary();

  if (!state.opponentList.length) {
    state.opponentList = createDefaultOpponents();
  }

  state.activeOurIndex = clamp(state.activeOurIndex, 0, Math.max(0, state.ourTeam.length - 1));
  state.activeOpponentIndex = clamp(state.activeOpponentIndex, 0, Math.max(0, state.opponentList.length - 1));

  setupItemHighlightEditor();
  bindStaticControls();
  bindReferenceControls();
  bindTeamHistory();
  render();
  setView(state.view);
  importSharedTeam();
}

function getEffectiveStat(entry, stat) {
  const species = battleSpecies(entry,'our');
  entry=battleEntry(entry);
  return stat === 'spe' ? Battle.speed(species, entry,state) : Battle.effectiveStat(species, entry, stat);
}
function statInvestmentBreakdown(entry,species,stat) {
  const base=species.stats[stat];
  const invested=base===1 && stat==='hp' ? 0 : Number(entry.investment[stat] || 0);
  const nature=Battle.effectiveStat(species,entry,stat)-base-invested;
  if(!invested && !nature) return '';
  return `(${base}${invested ? ` + ${invested}` : ''}${nature ? ` ${nature<0 ? '−' : '+'} ${Math.abs(nature)}` : ''})`;
}
function updateStatInvestmentLabels(container,entry) {
  const species=battleSpecies(entry,'our');
  for(const output of container.querySelectorAll('[data-stat-total]')) output.textContent=Battle.effectiveStat(species,entry,output.dataset.statTotal);
  for(const breakdown of container.querySelectorAll('[data-stat-breakdown]')) breakdown.textContent=statInvestmentBreakdown(entry,species,breakdown.dataset.statBreakdown);
}
function getDefenseInvestmentLevels() {
  return [0, 35, 64].map(points => ({points, label: `${points} SP: optimal HP / relevant defense`}));
}
function calculateMoveRange(attacker, defender, moveName, defenseInvestment = null, options = {}) {
  if (attacker.kind === 'opponent') attacker = {...attacker, ability: appliedOpponentAbility(attacker), item: appliedOpponentItem(attacker)};
  if (defender.kind === 'opponent') defender = {...defender, ability: appliedOpponentAbility(defender), item: appliedOpponentItem(defender)};
  return Battle.range(getPokemonByName(attacker.name), attacker, getPokemonByName(defender.name), defender,
    moveName, {assumeHits:true,defenseInvestment, format: state.format, weather: state.weather, terrain: state.terrain,
      attackerStages:statStages(attacker,attacker.kind==='opponent' ? 'opponent' : 'our'),
      defenderStages:statStages(defender,defender.kind==='opponent' ? 'opponent' : 'our'),
      attackerAlliesFainted:attacker.kind === 'opponent' ? state.opponentsFainted : state.alliesFainted,...options});
}
function formatPercent(value) { return `${Math.floor((value + Number.EPSILON) * 10) / 10}%`; }
function incomingThreats(opponent, ours, boostNature = null) {
  const species = battleSpecies(opponent,'opponent');
  const usage = getUsage(species);
  const ourSpecies = battleSpecies(ours,'our');
  const options = {assumeHits:true,format: state.format, weather: state.weather, terrain: state.terrain,
    attackerAlliesFainted:state.opponentsFainted,
    opponentItem: appliedOpponentItem(opponent),
    opponentAbility: appliedOpponentAbility(opponent),
    attackerStages:statStages(opponent,'opponent'),defenderStages:statStages(ours,'our'),
    boostOffenseNature: false};
  const usageRows = new Map((usage?.moves || []).map(row => [calc.toID(row.name), row]));
  const candidates = [...new Set(species.learnset)].map(name => {
    const meta = Battle.moveMeta(name);
    if (!meta) return null;
    const moveOptions = {...options, boostOffenseNature: boostNature ?? natureBoostForMove(opponent, 'offense', meta.offensiveStat)};
    const conditional = ['Counter', 'Mirror Coat', 'Metal Burst', 'Comeuppance', 'Guillotine',
      'Fissure', 'Horn Drill', 'Sheer Cold', 'Bide'].includes(meta.name);
    const comparison = conditional ? {ceiling: {error: 'Requires turn context / OHKO rules', meta}}
      : Battle.incomingScenarios(species, ourSpecies, ours, meta.name, [], moveOptions);
    const reference = usageRows.get(calc.toID(meta.name));
    return {name: meta.name, percent: reference?.percent ?? null, usageRank: reference?.rank,
      range: comparison.ceiling};
  }).filter(Boolean);
  const spreads = [...(usage?.spreads || [])].sort((a,b) => (b.percent ?? -1) - (a.percent ?? -1) || a.rank - b.rank);
  return Battle.selectThreats(candidates).map(row => row.range.error ? {...row, scenarios: []} : {
    ...row, ...Battle.incomingScenarios(species, ourSpecies, ours, row.name, spreads,
      {...options, boostOffenseNature: boostNature ?? natureBoostForMove(opponent, 'offense', row.range.meta.offensiveStat)})});
}
function spreadLabel(investment) {
  return `SP (HP/Atk/Def/SpA/SpD/Spe): ${statOrder.map(stat => investment[stat]).join('/')}`;
}
function natureFrequencyMarkup(opponent,stat) {
  const percent=natureUsage(opponent,stat);
  if(percent===null) return '';
  const label=statLabels[stat] || stat;
  const description=`${percent}% of reported ${state.format} nature usage boosts the opponent’s ${label}. Adds together all natures boosting this stat; separate from stat-spread usage.`;
  return `<span class="nature-frequency" data-nature-stat="${escapeHtml(stat)}" title="${escapeHtml(description)}"><b>${percent}%</b></span>`;
}
function natureRangeMarkup(neutral,boosted,stat,role,opponent) {
  const row=(range,isBoosted)=>{
    const label=isBoosted ? `+${statLabels[stat] || stat}` : 'Neutral';
    const split=range.allocation;
    const description=`Opponent ${isBoosted ? `nature boosts ${statLabels[stat] || stat} by 10%` : 'has no nature boost to the relevant stat'}.${split ? ` Optimal split: HP ${split.hp} / ${statLabels[split.stat]} ${split.defense}.` : ''}${role==='defense' ? ' Other stats remain neutral; our build stays exact.' : ' Uses the same reported investment; our build stays exact.'}`;
    return `<div class="nature-damage-row" data-nature="${isBoosted ? 'boosted' : 'neutral'}" title="${escapeHtml(description)}"><span class="nature-row-label"><span class="nature-stat-name">${label}</span>${isBoosted ? natureFrequencyMarkup(opponent,stat) : ''}</span><strong>${range.error ? escapeHtml(range.error) : `${formatPercent(range.low)}–${formatPercent(range.high)}`}</strong></div>`;
  };
  return `<div class="nature-damage-pair">${row(neutral,false)}${row(boosted,true)}</div>`;
}
function groupIncomingScenarios(scenarios) {
  // Both displayed nature ranges must match; source spreads and weights stay intact.
  const groups=new Map();
  const rangeKey=range=>range?.error ? ['error',range.error] : range ? [formatPercent(range.low),formatPercent(range.high)] : null;
  for(const scenario of scenarios) {
    const key=JSON.stringify([rangeKey(scenario.range),rangeKey(scenario.boostedRange)]);
    if(!groups.has(key)) groups.set(key,{...scenario,percent:null,spreads:[],unreported:0});
    const group=groups.get(key);
    group.spreads.push(scenario);
    if(Number.isFinite(scenario.percent)) group.percent=(group.percent ?? 0)+scenario.percent;
    else group.unreported++;
  }
  const ordered=[...groups.values()].sort((a,b)=>(b.percent ?? -1)-(a.percent ?? -1) || (a.rank ?? Infinity)-(b.rank ?? Infinity));
  const total=ordered.reduce((sum,group)=>sum+(group.percent ?? 0),0);
  const shares=ordered.map((group,index)=>{
    const exact=total>0 ? (group.percent ?? 0)*1000/total : 0;
    return {index,units:Math.floor(exact),remainder:exact-Math.floor(exact)};
  });
  // Largest-remainder rounding keeps the displayed tenths summing to 100%.
  if(total>0) {
    const remaining=1000-shares.reduce((sum,share)=>sum+share.units,0);
    [...shares].sort((a,b)=>b.remainder-a.remainder || a.index-b.index).slice(0,remaining).forEach(share=>share.units++);
  }
  return ordered.map((group,index)=>({...group,reportedPercent:total>0 && group.percent!==null ? shares[index].units/10 : null,sourceCoverage:total}));
}
function incomingScenarioMarkup(row,opponent) {
  if(row.range.error) return `<div class="defense-line"><strong>${escapeHtml(row.range.error)}</strong></div>`;
  const stat=row.range.meta.offensiveStat;
  const spreadRow=scenario=>{
    const usage=scenario.reportedPercent===null ? 'Usage not reported' : `${scenario.reportedPercent}% of reported sets`;
    const allocations=scenario.spreads.map(spread=>`${spread.percent===null ? 'Usage not reported' : `${spread.percent}% of source sets`} · ${spreadLabel(spread.investment)}`).join('\n');
    const basis=`Normalized across reported spreads with known usage (covering ${Number(scenario.sourceCoverage.toFixed(2))}% of source sets).${scenario.unreported ? ' Spreads without usage weights are excluded from the percentage.' : ''}\n${allocations}`;
    return `<div class="defense-line spread-scenario" title="${escapeHtml(basis)}"><span>${usage}</span>
      ${natureRangeMarkup(scenario.range,scenario.boostedRange,stat,'offense',opponent)}</div>`;
  };
  const scenarios=groupIncomingScenarios(row.scenarios);
  const first=scenarios[0],rest=scenarios.slice(1);
  const ceiling=`<div class="defense-line offense-ceiling"><span>Maximum-offense ceiling</span>${natureRangeMarkup(row.ceiling,row.boostedCeiling,stat,'offense',opponent)}</div>`;
  return `<div class="incoming-ranges">${first ? spreadRow(first) : '<p class="status-note">Stat-spread usage unavailable.</p>'}${ceiling}</div>
    ${rest.length ? `<details class="spread-comparisons"><summary>Other Damage Ranges (${rest.length})</summary><div class="spread-list">${rest.map(spreadRow).join('')}</div></details>` : ''}`;
}
function incomingNatureComparisons(opponent,ours) {
  const species=battleSpecies(opponent,'opponent'),ourSpecies=battleSpecies(ours,'our');
  const spreads=[...(getUsage(species)?.spreads || [])].sort((a,b)=>(b.percent ?? -1)-(a.percent ?? -1) || a.rank-b.rank);
  const options={assumeHits:true,format:state.format,weather:state.weather,terrain:state.terrain,attackerAlliesFainted:state.opponentsFainted,
    opponentItem:appliedOpponentItem(opponent),opponentAbility:appliedOpponentAbility(opponent),
    attackerStages:statStages(opponent,'opponent'),defenderStages:statStages(ours,'our'),boostOffenseNature:false};
  // Select threats at their boosted ceiling, then compare the same moves/spreads.
  return incomingThreats(opponent,ours,true).map(boosted=>{
    if(boosted.range.error) return boosted;
    const neutral=Battle.incomingScenarios(species,ourSpecies,ours,boosted.name,spreads,options);
    return {...boosted,...neutral,range:neutral.ceiling,boostedCeiling:boosted.ceiling,
      scenarios:neutral.scenarios.map((scenario,index)=>({...scenario,boostedRange:boosted.scenarios[index].range}))};
  });
}
const fieldIcons={
  none:'<circle cx="12" cy="12" r="8"/><path d="m6 18 12-12"/>',
  Sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  Rain:'<path d="M6 14a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4 4 0 0 1 1 9H6m1 3-1 3m6-3-1 3m6-3-1 3"/>',
  Sand:'<path d="M2 15q6-10 12-2t8-2M2 20q7-8 13-2t7-1M6 6h3m6 1h5M3 10h2"/>',
  Snow:'<path d="M12 2v20M3 7l18 10M3 17 21 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4m15 9-4 1 1 4M3 14l4 1-1 4m15-9-4-1 1-4"/>',
  Electric:'<path d="m13 2-9 12h7l-1 8L21 9h-8z"/>',
  Grassy:'<path d="M12 21V10M12 16C2 16 3 6 3 6s10 1 9 10Zm0-4C12 2 21 3 21 3s1 10-9 9Z"/>',
  Misty:'<path d="M2 7q3-3 6 0t6 0 8 0M2 12q3-3 6 0t6 0 8 0M2 17q3-3 6 0t6 0 8 0"/>',
  Psychic:'<path d="M20 12a8 8 0 1 0-8 8 6 6 0 1 0-6-6 4 4 0 1 0 4-4 2 2 0 0 0 0 4"/>'
};
const fieldEffects={
  weather:{
    '':'No weather effects.',
    Sun:'Fire damage ×1.5; Water damage ×0.5. Activates sun abilities such as Chlorophyll and Solar Power; Solar Beam and Solar Blade skip charging.',
    Rain:'Water damage ×1.5; Fire damage ×0.5. Activates rain abilities such as Swift Swim; Thunder and Hurricane bypass accuracy checks.',
    Sand:'Rock-type Pokémon gain ×1.5 Sp. Def. Damages vulnerable Pokémon each turn; activates abilities such as Sand Rush and Sand Force.',
    Snow:'Ice-type Pokémon gain ×1.5 Defense. Activates abilities such as Slush Rush and permits Aurora Veil.'
  },
  terrain:{
    '':'No terrain effects.',
    Electric:'Grounded attackers’ Electric damage ×1.3. Prevents grounded Pokémon from falling asleep; activates Surge Surfer.',
    Grassy:'Grounded attackers’ Grass damage ×1.3. Heals grounded Pokémon by 1/16 max HP each turn; halves Earthquake, Bulldoze and Magnitude damage against grounded targets.',
    Misty:'Halves Dragon damage against grounded targets and protects them from status conditions and confusion.',
    Psychic:'Grounded attackers’ Psychic damage ×1.3. Protects grounded targets from opposing priority moves; enables enhanced Expanding Force.'
  }
};
function renderFieldOptions() {
  const values={weather:['','Sun','Rain','Sand','Snow'],terrain:['','Electric','Grassy','Misty','Psychic']};
  for(const group of document.querySelectorAll('[data-field-options]')) {
    const field=group.dataset.fieldOptions;
    if(!group.children.length) group.innerHTML=values[field].map(value=>`<button type="button" class="field-icon field-${value.toLowerCase() || 'none'}" data-field-option="${field}" data-field-value="${value}" title="${field==='weather' ? 'Weather' : 'Terrain'}: ${value || 'None'}" aria-label="${field==='weather' ? 'Weather' : 'Terrain'}: ${value || 'None'}"><svg viewBox="0 0 24 24" aria-hidden="true">${fieldIcons[value || 'none']}</svg></button>`).join('');
    for(const button of group.children) {
      const value=button.dataset.fieldValue,label=`${field==='weather' ? 'Weather' : 'Terrain'}: ${value || 'None'}`;
      button.title=`${label}\n${fieldEffects[field][value]}`;
      button.setAttribute('aria-label',`${label}. ${fieldEffects[field][value]}`);
      button.setAttribute('aria-pressed',String(value===state[field]));
    }
  }
}
function renderDamageRanges() {
  const container = document.getElementById('damageRangeSummary');
  renderFieldOptions();
  const ours = state.ourTeam[state.activeOurIndex];
  const theirs = state.opponentList[state.activeOpponentIndex];
  const outgoing = state.damageDirection === 'outgoing';
  renderAbilityAssumption(theirs);
  renderStatStages(ours,theirs);
  container.classList.toggle('incoming', !outgoing);
  if (!ours || !theirs) {
    container.innerHTML = '<div class="empty-state">No matchup selected.</div>';
    document.getElementById('usageReference').innerHTML = '';
    return;
  }
  const species = getPokemonByName(theirs.name);
  const usage = getUsage(species);
  document.getElementById('usageReference').innerHTML = `<a href="https://championsbattledata.com/" target="_blank" rel="noreferrer">Battle data provided by Pokémon Champions Battle Data</a> · ${state.format} · ${rosterSnapshot.generatedAt.slice(0,10)}${usage ? ` · usage for ${escapeHtml(usage.name)}` : ' · usage unavailable'}`;
  const moves = outgoing ? ours.moveSet.map(name => {
    const meta = Battle.moveMeta(name);
    const range = calculateMoveRange(ours, theirs, name, 0,
      {boostDefenseNature:false});
    return {name, range};
  }).sort((a, b) => (b.range.high ?? -1) - (a.range.high ?? -1)
    || (b.range.low ?? -1) - (a.range.low ?? -1)) : incomingNatureComparisons(theirs, ours);
  if(moves.some(row=>!row.range.error) && state.view==='battle') window.SiteUsage?.count('matchup',JSON.stringify([
    ours,theirs,state.damageDirection,state.format,state.weather,state.terrain,state.alliesFainted,state.opponentsFainted,
    getPreferences(ours,'our'),getPreferences(theirs,'opponent')
  ]));
  container.innerHTML = moves.map(row => {
    const moveName = row.name;
    let meta = row.range.meta || Battle.moveMeta(moveName);
    const scenarios = getDefenseInvestmentLevels();
    const values = outgoing ? scenarios.map(({points,label}) => {
      const range = points === 0 ? row.range : calculateMoveRange(ours, theirs, moveName, points,
        {boostDefenseNature:false});
      if (range.meta) meta = range.meta;
      const boosted=calculateMoveRange(ours,theirs,moveName,points,{boostDefenseNature:true});
      return `<div class="defense-line outgoing-spread"><span title="${label}">${points} SP</span>${natureRangeMarkup(range,boosted,meta?.defensiveStat,'defense',theirs)}</div>`;
    }).join('') : incomingScenarioMarkup(row,theirs);
    const frequency = outgoing ? '' : `<div class="move-usage"><span>${row.percent === null ? 'Usage not reported' : `${row.percent}% usage`}</span>
      <span>${row.topDamage ? 'Most damaging' : ''}${row.topDamage && row.topCommon ? ' · ' : ''}${row.topCommon ? 'Top 5 damaging by usage' : ''}</span></div>`;
    return `<div class="move-row" data-move="${escapeHtml(moveName)}"><div class="move-row-top"><div class="move-name">${escapeHtml(moveName)}</div>
      <div class="move-ranges"><span class="range-pill">${meta ? `${meta.type} · ${meta.category}${meta.multihit ? ` · full attack${row.range.hitModel ? ` · ${Number(row.range.hitModel.expected.toFixed(2))} hits avg` : ''}` : ''}${meta.spread && state.format === 'Doubles' ? ' · spread' : ''}` : 'Unknown move'}</span></div></div>
      ${frequency}<div class="investment-stack">${values}</div></div>`;
  }).join('') || '<div class="empty-state">No damaging moves available in this movepool.</div>';
}

Battle.resolveCombatant=(species,entry)=>{
  const side=Array.isArray(entry.moveSet) ? 'our' : 'opponent';
  const effective=battleSpecies({...species,item:entry.item,ability:entry.ability},side);
  if(effective.originalName || effective.selectedMegaFromBase || PokemonForms.isAegislash(species) || PokemonForms.isCastform(species)) {
    return {species:effective,entry:side==='our' ? battleEntry(entry,effective) : entry};
  }
  return {species,entry};
};
initializeApp();
