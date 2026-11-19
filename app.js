const STORAGE_KEY = 'pokelator-pro-team';
const PREFERENCES_KEY = 'pokelator-pro-preferences-v1';
const LIBRARY_KEY = 'pokelator-pro-teams-v1';
const BUILDER_SETTINGS_KEY = 'pokelator-pro-builder-v1';
const UI_SETTINGS_KEY = 'pokelator-pro-ui-v1';
const COLOR_DEFAULTS_KEY = 'pokelator-pro-color-defaults-v1';
const APP_COLOR_OPTIONS = [
  ['bg','Page background','#101827'],['bg-strong','Deep background','#e5aa68'],['control-bg','Control background','#0c1320'],
  ['panel','Panels','#172334'],['panel-alt','Secondary panels','#1b2a40'],['panel-soft','Raised surfaces','#233852'],
  ['soft-border','Borders','#2f4565'],['text','Text','#edf3ff'],['muted','Secondary text','#9fb5d0'],
  ['accent','Accent','#6cc3ff'],['accent-strong','Active buttons','#748498'],
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
const pokerData = rosterSnapshot.pokemon;
const ordinaryForms=new Map();
const natureOptions = Battle.natureOptions;
const itemOptions = [...Battle.generation.items].map(item => item.name);
const statOrder = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const statLabels = { hp: 'HP', atk: 'ATK', def: 'DEF', spa: 'SPA', spd: 'SPD', spe: 'SPE' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}
function getPokemonRoster() { return pokerData; }
function getPokemonByName(name) {
  const key = String(name || '').trim().toLowerCase();
  return pokerData.find(p => p.name.toLowerCase() === key || p.id.toLowerCase() === key) || null;
}
function savedSpecies(entry) {
  if(entry?.stats) return entry;
  return pokerData.find(species=>species.id===entry?.id) || getPokemonByName(entry?.name);
}
function battleSpecies(entry,side='opponent') {
  const species=savedSpecies(entry);
  if(!species?.isMega || getPreferences(species,side).megaActive) return species;
  if(ordinaryForms.has(species.id)) return ordinaryForms.get(species.id);
  const engine=Battle.generation.species.get(calc.toID(species.id));
  const base=getPokemonByName(engine.baseSpecies);
  if(!base) return species;
  const form={...base,id:species.id,calcId:base.id,originalName:species.name,megaStoneName:Battle.requiredMegaItem(species)};
  ordinaryForms.set(species.id,form);return form;
}
function ordinaryAbility(species,entry,side) {
  const choice=getPreferences(species,side).baseAbilityChoice;
  if(choice!=='auto') return species.abilities.includes(choice) ? choice : '';
  if(entry.ability!==undefined && (entry.ability==='' || entry.ability==='No Ability' || species.abilities.includes(entry.ability))) return entry.ability;
  const rows=(getUsage(species)?.abilities || []).filter(row=>species.abilities.includes(row.name)).sort((a,b)=>b.percent-a.percent);
  return side==='our' ? rows[0]?.name || species.abilities[0]
    : species.abilities.length===1 ? species.abilities[0] : rows[0]?.percent>=ABILITY_USAGE_THRESHOLD ? rows[0].name : '';
}
function battleEntry(entry,side='our') {
  const species=battleSpecies(entry,side);
  return species?.megaStoneName ? {...entry,ability:ordinaryAbility(species,entry,side),item:species.megaStoneName} : entry;
}
function getPokemonImage(name) {
  const species = getPokemonByName(name);
  return species ? new URL(species.image, 'https://championsbattledata.com/').href : '';
}
function baseStatsMarkup(entry) {
  const species=getPokemonByName(entry.name);
  const labels={hp:'HP',atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe'};
  const values=statOrder.map(stat=>[stat,stat==='hp' && species.stats.hp===1 ? 1 : species.stats[stat]-(stat==='hp' ? 75 : 20)]);
  const description=`${species.name} base stats: ${values.map(([stat,value])=>`${labels[stat]} ${value}`).join(' · ')}. Before investment, nature and stat stages.`;
  return `<div class="base-stat-strip" role="group" aria-label="${escapeHtml(description)}" title="${escapeHtml(description)}">
    ${values.map(([stat,value])=>`<span class="base-stat base-stat-${stat}" data-base-stat="${stat}" data-base-value="${value}" style="--stat-fill:${Math.min(100,value/255*100).toFixed(1)}%"><span class="base-stat-label">${labels[stat]}</span><strong>${value}</strong><i aria-hidden="true"></i></span>`).join('')}
  </div>`;
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
  const defaults=Object.fromEntries(Object.entries(current).map(([key,value])=>[key,validHighlightColor(saved?.[key],value)]));
  try {localStorage.setItem(COLOR_DEFAULTS_KEY,JSON.stringify(defaults));} catch { /* Keep the reference palette in memory. */ }
  return defaults;
}

function loadUISettings() {
  let saved,defaults;
  try {defaults=JSON.parse(localStorage.getItem(COLOR_DEFAULTS_KEY) || 'null');} catch { /* Use built-in fallbacks. */ }
  try { saved = JSON.parse(localStorage.getItem(UI_SETTINGS_KEY) || '{}'); } catch { /* Use defaults. */ }
  return {itemHighlightColors:{selected:validHighlightColor(saved?.itemHighlightColors?.selected,validHighlightColor(defaults?.selected)),other:saved?.colorEditorVersion===2 ? validHighlightColor(saved?.itemHighlightColors?.other,validHighlightColor(defaults?.other,'#3e7a91')) : validHighlightColor(defaults?.other,'#3e7a91')},
    appColors:Object.fromEntries(APP_COLOR_OPTIONS.map(([key,,fallback])=>[key,validHighlightColor((key==='bg-strong' && !saved?.deepBackgroundVersion && saved?.appColors?.[key]==='#0c1320') || (key==='accent-strong' && !saved?.toolbarColorsVersion) || (key==='toolbar-accent' && saved?.toolbarColorsVersion!==2) ? fallback : saved?.appColors?.[key],validHighlightColor(defaults?.[key],fallback))])),
    format:saved?.format === 'Singles' ? 'Singles' : 'Doubles',
    metaMode:saved?.metaMode!==false,
    view:saved?.view === 'builder' ? 'builder' : 'battle',
    builderPanel:['offense','team-offense','defense','balance'].includes(saved?.builderPanel) ? saved.builderPanel : 'speed'};
}
function saveUISettings() {
  try { localStorage.setItem(UI_SETTINGS_KEY,JSON.stringify({format:state.format,metaMode:state.metaMode,view:state.view,builderPanel:state.builderPanel,itemHighlightColors:lockedItemColors,appColors:lockedAppColors,colorEditorVersion:2,deepBackgroundVersion:1,toolbarColorsVersion:2})); }
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
  return pokerData.map(species=>battleSpecies(species,'opponent')).filter(species => (includeBaseMatches && species.stats.spe === selected.stats.spe) ||
    (Number.isInteger(species.usage?.[state.format]?.rank) && species.usage[state.format].rank <= state.builderTopN));
}

function natureChoice(raw, field, legacyField) {
  const value = raw?.[field];
  if (value === true || value === false || value === 'auto') return value;
  // Existing saved flags are retained as overrides; the UI can restore usage defaults.
  return typeof raw?.[legacyField] === 'boolean' ? raw[legacyField] : 'auto';
}
function sanitizePreferences(raw = {}) {
  return {megaActive:raw?.megaActive!==false,baseAbilityChoice:typeof raw?.baseAbilityChoice==='string' ? raw.baseAbilityChoice : 'auto',offenseStage:Number.isInteger(raw?.offenseStage) ? clamp(raw.offenseStage,-6,6) : 0,
    defenseStage:Number.isInteger(raw?.defenseStage) ? clamp(raw.defenseStage,-6,6) : 0,
    defenseNatureChoice: natureChoice(raw, 'defenseNatureChoice', 'boostDefenseNature'),
    offenseNatureChoice: natureChoice(raw, 'offenseNatureChoice', 'boostOffenseNature'),
    itemChoice: raw?.scarfHighlighted===true ? 'Choice Scarf' : typeof raw?.itemChoice === 'string' ? raw.itemChoice : '',
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
  const key = `${side}:${entry.id}`;
  if (!state.preferences[key]) state.preferences[key] = sanitizePreferences(side === 'our' ? entry : {});
  return state.preferences[key];
}
function statStages(entry,side) {
  const prefs=getPreferences(entry,side);
  return {offense:prefs.offenseStage,defense:prefs.defenseStage};
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
  const moveNames = role === 'defense' ? ours?.moveSet || [] : getPokemonByName(opponent?.name)?.learnset || [];
  const relevant = [...new Set(moveNames.map(Battle.moveMeta).filter(move => move && move.category !== 'Status')
    .map(move => role === 'defense' ? move.defensiveStat : move.offensiveStat))];
  const stats = relevant.length ? relevant : role === 'defense' ? ['def', 'spd'] : ['atk', 'spa'];
  const enabled = stats.map(stat => natureBoostForMove(opponent, role, stat));
  return {checked: enabled.some(Boolean), mixed: enabled.some(Boolean) && !enabled.every(Boolean),
    stats, choice: getPreferences(opponent, 'opponent')[`${role}NatureChoice`]};
}
function renderNatureFlags(opponent) {
  for (const [role, id] of [['defense','boostNatureToggle'], ['offense','boostOffenseNatureToggle']]) {
    const flag = natureFlagState(opponent, role);
    const input = document.getElementById(id);
    input.checked = flag.checked;
    input.indeterminate = flag.mixed;
    const usage = flag.stats.map(stat => {
      const percent = natureUsage(opponent, stat);
      return `${statLabels[stat]} ${percent === null ? 'not reported' : `${percent}%`}`;
    }).join(' · ');
    const mode = flag.choice === 'auto' ? `Auto ≥${NATURE_USAGE_THRESHOLD}%` : `Manual ${flag.choice ? 'on' : 'off'}`;
    const basis = document.getElementById(`${role}NatureUsage`);
    basis.textContent = `${mode} · ${usage}`;
    input.title = `${mode}. Reported nature boost shares: ${usage}.${flag.mixed ? ' Boost applies only to matching stats that reach the threshold.' : ''}`;
  }
  const prefs = getPreferences(opponent, 'opponent');
  document.getElementById('natureUsageDefaultsButton').hidden = !opponent ||
    (prefs.defenseNatureChoice === 'auto' && prefs.offenseNatureChoice === 'auto');
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
function appliedOpponentAbility(opponent) {
  const prefs=getPreferences(opponent,'opponent');
  const choice=battleSpecies(opponent,'opponent')?.megaStoneName ? prefs.baseAbilityChoice : prefs.abilityChoice;
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
function getItemHints(species) {
  // Parent-species usage cannot establish an item frequency for an evolved Mega form.
  if (species.isMega) return [];
  const usage = getUsage(species);
  const hints = (usage?.items || []).filter(row => row.percent >= 5 && itemHintMetadata(row.name))
    .map(row => ({...itemHintMetadata(row.name), percent: row.percent, reference: usage.name}));
  // A manual selection stays visible across formats even if it is no longer common.
  const selected = getPreferences(species,'opponent').itemChoice;
  if (selected && itemHintMetadata(selected) && !hints.some(item => item.name === selected)) {
    const reference = usage?.items?.find(item => item.name === selected);
    hints.push({...itemHintMetadata(selected), percent: reference?.percent ?? null,
      reference: usage?.name || species.name});
  }
  return hints;
}
function appliedOpponentItem(opponent) {
  const species = opponent && getPokemonByName(opponent.name);
  if (!species || species.isMega) return '';
  const selected = getPreferences(opponent, 'opponent').itemChoice;
  const item = window.ITEM_HINTS[calc.toID(selected)];
  return item && Battle.generation.items.get(calc.toID(item.name)) ? item.name : '';
}
function buildItemHints(entry) {
  const species = getPokemonByName(entry.name);
  if(species?.isMega) return `<div class="item-hints">${megaStoneMarkup(entry,'opponent')}</div>`;
  const hints = getItemHints(species);
  if (!hints.length) return '';
  const active = getPreferences(entry,'opponent').itemChoice;
  return `<div class="item-hints" aria-label="Opponent item choices">${hints.map(item => {
    const enabled = item.name === active;
    const frequency = item.percent === null ? 'Usage not reported' : `${item.percent}% ${state.format} usage`;
    const description = `${item.name} · ${frequency} (${item.reference}). ${item.description} ${item.referenceOnly ? (enabled ? 'Highlighted for reference. Click to clear.' : 'Click to highlight for reference.') : enabled ? 'Active for damage calculations. Click to deactivate.' : 'Not applied to damage. Click to activate.'}`;
    return `<button class="item-hint" type="button" data-opponent-item="${escapeHtml(item.name)}" aria-pressed="${enabled}"
      aria-label="${escapeHtml(description)}">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" />
      <span role="tooltip" class="item-tooltip" popover="manual">${escapeHtml(description)}</span></button>`;
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
  const options = [`<option value="" ${!selectedValue ? 'selected' : ''}>—</option>`];
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
  const species = getPokemonByName(entry.name);
  entry.item = species.isMega ? Battle.requiredMegaItem(species) : String(value).trim();
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
  return {name: pokemon.name, id: pokemon.id, types: pokemon.types, form: pokemon.form,
    item: pokemon.isMega ? Battle.requiredMegaItem(pokemon) : typeof rawEntry.item === 'string' ? rawEntry.item : '',
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
  document.getElementById('teamNameInput').focus(); document.getElementById('teamNameInput').select();
}
function libraryMessage(message) {
  const status = document.getElementById('libraryStatus');
  status.textContent = message; status.hidden = false;
}
function importTeamSnapshots(teams) {
  saveTeamToStorage();
  const added = teams.map(team => {
    const record = {id:teamId(), name:uniqueTeamName(team.name), pokemon:structuredClone(team.pokemon), updatedAt:new Date().toISOString()};
    state.teamLibrary.push(record); return record;
  });
  selectLibraryTeam(added[0].id);
  document.getElementById('teamLibraryPanel').open = true;
  libraryMessage(`Imported ${added.length} ${added.length === 1 ? 'team' : 'teams'}.`);
}
function exportTeams(all = false) {
  saveTeamToStorage();
  const active = state.teamLibrary.find(team => team.id === state.activeTeamId);
  const blob = new Blob([JSON.stringify(TeamFiles.pack(all ? state.teamLibrary : [active]),null,2)],{type:'application/json'});
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
    sanitizeTeamEntry({ name: 'Charizard', item: 'Life Orb', nature: 'Timid', investment: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 }, moveSet: ['Heat Wave', 'Air Slash', 'Solar Beam', 'Protect'] }),
    sanitizeTeamEntry({ name: 'Garchomp', item: 'Life Orb', nature: 'Jolly', investment: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 }, moveSet: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] })
  ];
}

function createDefaultOpponents() { return [sanitizeOpponentEntry({name: 'Kingambit'})]; }

function popularTeamBuild(species) {
  const usage=getUsage(species);
  const byPopularity=(a,b)=>(b.percent ?? -1)-(a.percent ?? -1) || (a.rank ?? Infinity)-(b.rank ?? Infinity);
  const spread=[...(usage?.spreads || [])].filter(row=>row.investment
    && statOrder.every(stat=>Number.isInteger(row.investment[stat]) && row.investment[stat]>=0 && row.investment[stat]<=MAX_STAT_POINTS)
    && statOrder.reduce((sum,stat)=>sum+row.investment[stat],0)<=MAX_TEAM_POINTS).sort(byPopularity)[0];
  const nature=[...(usage?.natures || [])].filter(row=>Battle.generation.natures.get(calc.toID(row.name))).sort(byPopularity)[0];
  const offense=species.stats.atk>=species.stats.spa ? 'atk' : 'spa';
  const fallback=defaultInvestment();fallback[offense]=32;
  if(species.stats.spe<=80) {fallback.hp=32;fallback[offense==='atk' ? 'spd' : 'def']=2;}
  else {fallback.spe=32;fallback.hp=2;}
  return {investment:spread ? {...spread.investment} : fallback,
    nature:nature?.name || (offense==='atk' ? 'Adamant' : 'Modest')};
}

function addTeamPokemon(name,savedBuild=null) {
  const status = document.getElementById('teamAddStatus');
  const species = getPokemonByName(name);
  if (!species) {
    status.textContent = 'Choose a Pokémon from the list.';
    status.hidden = false;
    return false;
  }
  state.ourTeam.push(sanitizeTeamEntry(savedBuild ? {...structuredClone(savedBuild),name:species.name} : {name:species.name,...popularTeamBuild(species)}));
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
  document.activeElement?.blur?.();
  const destination=index+step;
  if(!Number.isInteger(index) || ![-1,1].includes(step) || index<0 || index>=state.ourTeam.length || destination<0 || destination>=state.ourTeam.length) return;
  const selected=state.ourTeam[state.activeOurIndex],member=state.ourTeam.splice(index,1)[0];
  state.ourTeam.splice(destination,0,member);
  state.activeOurIndex=state.ourTeam.indexOf(selected);
  if(!state.teamOffenseCustomized) resetTeamOffenseSelection();
  saveTeamToStorage();render();
  document.querySelector(`[data-move-team-index="${destination}"][data-team-step="${step}"]`)?.focus();
}
function teamOrderControls(entry,index) {
  return [-1,1].map(step=>`<button type="button" class="control-btn team-order-button" data-move-team-index="${index}" data-team-step="${step}"
    ${index+step<0 || index+step>=state.ourTeam.length ? 'disabled' : ''}
    title="Move ${escapeHtml(entry.name)} ${step<0 ? 'earlier' : 'later'} in default order"
    aria-label="Move ${escapeHtml(entry.name)} ${step<0 ? 'earlier' : 'later'} in team order">${step<0 ? '↑' : '↓'}</button>`).join('');
}

function pokemonUsageReference(species) {
  const data=window.META_USAGE?.formats[state.format]?.species || {};
  const exact=calc.toID(species.id),reference=calc.toID(getUsage(species)?.name || '');
  const shared={mausholdfour:'maushold',toxtricitylowkey:'toxtricity'}[exact]
    || (exact.startsWith('vivillon') ? 'vivillon' : null);
  return data[exact] || (shared && data[shared]) || (!species.isMega && data[reference]) || null;
}
function buildSearchResults(query) {
  const clean=query.trim().toLowerCase();
  if(!clean) return [];
  return pokerData.filter(p=>p.name.toLowerCase().includes(clean) || p.id.toLowerCase().includes(clean))
    .sort((a,b)=>(pokemonUsageReference(b)?.percent ?? -1)-(pokemonUsageReference(a)?.percent ?? -1)
      || (getUsage(a)?.rank ?? Infinity)-(getUsage(b)?.rank ?? Infinity) || a.name.localeCompare(b.name));
}
function buildTeamSearchResults(query) {
  const regular=buildSearchResults(query),matches=new Set(regular.map(species=>species.id));
  if(!matches.size) return regular;
  const saved=state.teamLibrary.flatMap(team=>(team.savedPokemon || team.pokemon).filter(entry=>matches.has(entry.id)).map(entry=>({
    ...getPokemonByName(entry.name),savedBuild:structuredClone(entry),sourceTeamId:team.id,sourceTeamName:team.name
  }))).sort((a,b)=>(b.sourceTeamId===state.activeTeamId)-(a.sourceTeamId===state.activeTeamId)
    || a.sourceTeamName.localeCompare(b.sourceTeamName) || a.name.localeCompare(b.name));
  return [...regular,...saved];
}
function pokemonChoiceMarkup(species) {
  if(species.savedBuild) {
    const build=species.savedBuild;
    return `<img class="search-item-image" src="${getPokemonImage(species.name)}" alt="" />
      <div class="choice-copy"><div class="choice-heading"><strong>${escapeHtml(species.name)}</strong><small>Saved build</small></div>
      <div class="saved-build-team">${escapeHtml(species.sourceTeamName)}</div>
      <div class="search-item-sub">${escapeHtml(build.nature.name)}${build.item ? ` · ${escapeHtml(build.item)}` : ''} · ${escapeHtml(build.ability)}</div>
      <div class="search-item-sub">${statOrder.filter(stat=>build.investment[stat]).map(stat=>`${statLabels[stat]} ${build.investment[stat]}`).join(' · ') || 'No stat investment'}</div>
      <div class="search-item-sub">${build.moveSet.map(escapeHtml).join(' · ')}</div></div>`;
  }
  const usage=pokemonUsageReference(species);
  const shared=usage && calc.toID(usage.name)!==calc.toID(species.id);
  return `<img class="search-item-image" src="${getPokemonImage(species.name)}" alt="" />
    <div class="choice-copy"><div class="choice-heading"><strong>${escapeHtml(species.name)}</strong><small>${usage ? `${usage.percent.toFixed(2)}%${shared ? ' shared' : ''}` : 'Usage unavailable'}</small></div>
    <div class="search-item-sub">${species.types.join(' / ')}</div>${baseStatsMarkup(species)}</div>`;
}
function buildMoveChoices(species,query='') {
  const clean=query.trim().toLowerCase();
  const usage=new Map((getUsage(species)?.moves || []).map(row=>[calc.toID(row.name),row.percent]));
  return species.learnset.map(name=>({...Battle.moveMeta(name),name,percent:usage.get(calc.toID(name)) ?? null}))
    .filter(move=>!clean || move.name.toLowerCase().includes(clean) || move.type?.toLowerCase().includes(clean))
    .sort((a,b)=>(b.percent ?? -1)-(a.percent ?? -1) || a.name.localeCompare(b.name));
}
function moveChoiceMarkup(move) {
  return `<div class="choice-copy"><div class="choice-heading"><strong>${escapeHtml(move.name)}</strong><small>${move.percent===null ? 'Usage unavailable' : `${move.percent}%`}</small></div>
    <div class="search-item-sub">${escapeHtml(move.type || 'Unknown')} · ${escapeHtml(move.category || '')}${move.power ? ` · ${move.power} power` : ''}</div></div>`;
}
let activeUsagePicker=null;
function closeUsagePicker() {
  if(!activeUsagePicker) return;
  const {input,popup}=activeUsagePicker;
  if(popup.matches(':popover-open')) popup.hidePopover();
  popup.innerHTML='';input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');activeUsagePicker=null;
}
function bindUsagePicker(input,{choices,markup,choose,kind='pokemon',hint=''}) {
  input.removeAttribute('list');input.autocomplete='off';input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','searchResults');
  const open=(query)=>{
    closeUsagePicker();
    const popup=document.getElementById('searchResults');popup.className='search-results usage-choice-popup';popup.setAttribute('popover','manual');popup.setAttribute('role','listbox');
    const items=choices(query),exact=items.findIndex(item=>item.name.toLowerCase()===query.trim().toLowerCase());
    activeUsagePicker={input,popup,items,cursor:Math.max(0,exact),query,markup,choose,kind,hint};
    updateUsagePicker();
  };
  input.addEventListener('focus',()=>open(kind==='move' ? '' : input.value));
  input.addEventListener('input',()=>open(input.value));
  input.addEventListener('blur',()=>{if(activeUsagePicker?.input===input) closeUsagePicker();});
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape') {
      if(kind==='pokemon') {input.value='';if(input.id==='pokemonSearchInput') state.searchQuery='';}
      closeUsagePicker();event.preventDefault();event.stopImmediatePropagation();return;
    }
    if(event.key==='ArrowDown' || event.key==='ArrowUp') {
      event.preventDefault();event.stopImmediatePropagation();
      if(activeUsagePicker?.input!==input) {open(input.value);return;}
      const picker=activeUsagePicker;
      if(picker.items.length) picker.cursor=(picker.cursor+(event.key==='ArrowDown' ? 1 : -1)+picker.items.length)%picker.items.length;
      updateUsagePicker();document.getElementById(`usage-choice-${picker.cursor}`)?.scrollIntoView({block:'nearest'});
    } else if(event.key==='Enter' && activeUsagePicker?.input===input && activeUsagePicker.items.length) {
      event.preventDefault();event.stopImmediatePropagation();
      const picker=activeUsagePicker,item=picker.items[picker.cursor];closeUsagePicker();choose(item);
    }
  });
}
function updateUsagePicker() {
  const picker=activeUsagePicker;if(!picker) return;
  const {input,popup,items,cursor,kind}=picker;
  if(input.id==='pokemonSearchInput') {state.searchQuery=picker.query;state.searchResults=items;state.searchCursor=cursor;}
  const snapshot=window.META_USAGE?.formats[state.format];
  popup.innerHTML=`<div class="choice-source">${escapeHtml(picker.hint || `${state.format} · ${snapshot?.month || ''} Showdown usage`)}</div>`
    +(items.length ? items.map((item,index)=>`${item.savedBuild && !items[index-1]?.savedBuild ? '<div class="choice-source saved-build-divider">Saved builds · per team</div>' : ''}<div role="option" aria-selected="${index===cursor}" id="usage-choice-${index}" data-choice-index="${index}" class="${kind==='pokemon' ? 'search-item' : 'move-choice'} usage-choice ${index===cursor ? 'active' : ''}">${picker.markup(item)}</div>`).join('') : '<div class="empty-state">No matching choices.</div>');
  for(const row of popup.querySelectorAll('[data-choice-index]')) {
    row.addEventListener('pointerdown',event=>event.preventDefault());
    row.addEventListener('click',()=>{const item=items[Number(row.dataset.choiceIndex)];closeUsagePicker();picker.choose(item);});
  }
  input.setAttribute('aria-expanded','true');
  if(items.length) input.setAttribute('aria-activedescendant',`usage-choice-${cursor}`);
  if(!popup.matches(':popover-open')) popup.showPopover();
  const box=input.getBoundingClientRect();
  const width=Math.min(Math.max(box.width,340),innerWidth-16);
  popup.style.width=`${width}px`;popup.style.left=`${clamp(box.left,8,Math.max(8,innerWidth-width-8))}px`;
  const below=innerHeight-box.bottom-8,above=box.top-8;
  const down=below>=Math.min(280,above);
  popup.style.maxHeight=`${Math.max(70,Math.min(380,down ? below : above))}px`;
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

function buildSetEditor(entry, index, side) {
  const species = getPokemonByName(entry.name);
  const activeSpecies=side==='our' ? battleSpecies(entry,'our') : species;
  const activeAbility=side==='our' ? battleEntry(entry).ability : entry.ability;
  const attr = `data-set-side="${side}" data-set-index="${index}"`;
  return `<details class="set-editor"><summary>Edit ${side === 'our' ? 'Pokémon & moves' : 'opponent set'}</summary>
    <label class="field-label">Pokémon<input type="text" list="speciesList" value="${escapeHtml(entry.name)}" ${attr} data-set-field="name" /></label>
    <label class="field-label">Ability<select ${attr} data-set-field="ability">${activeSpecies.abilities.map(a => `<option ${a === activeAbility ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select></label>

    ${Array.from({length: 4}, (_, i) => `<label class="field-label">Move ${i + 1}<input type="text" value="${escapeHtml(entry.moveSet[i] || '')}" ${attr} data-set-field="move-${i}" /></label>`).join('')}
  </details>`;
}
function bindSetEditors(container) {
  container.querySelectorAll('[data-set-field]').forEach(input => {
    const species=getPokemonByName((input.dataset.setSide==='our' ? state.ourTeam : state.opponentList)[Number(input.dataset.setIndex)].name);
    if(input.dataset.setField==='name' || input.dataset.setField.startsWith('move-')) {
      const isMove=input.dataset.setField.startsWith('move-');
      bindUsagePicker(input,{kind:isMove ? 'move' : 'pokemon',choices:query=>isMove ? buildMoveChoices(species,query) : input.dataset.setSide==='our' ? buildTeamSearchResults(query) : buildSearchResults(query),
        markup:isMove ? moveChoiceMarkup : pokemonChoiceMarkup,
        hint:isMove ? `${state.format} move usage · ${getUsage(species)?.name || species.name} · Champions Battle Data` : '',
        choose:item=>{
          if(item.savedBuild && input.dataset.setSide==='our') {
            const index=Number(input.dataset.setIndex),previous=state.ourTeam[index];
            saveTeamToStorage();state.ourTeam[index]=sanitizeTeamEntry(structuredClone(item.savedBuild));
            if(state.teamOffenseExcluded.has(previous)) state.teamOffenseExcluded.add(state.ourTeam[index]);
            saveTeamToStorage();render();
            document.querySelector('.expanded-team .set-editor').open=true;
          } else {input.value=item.name;input.dispatchEvent(new Event('change',{bubbles:true}));}
        }});
    }
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    });
    input.addEventListener('change', () => {
      const {setSide: side, setIndex: index, setField: field} = input.dataset;
      const team = side === 'our' ? state.ourTeam : state.opponentList;
      const entry = team[Number(index)];
      if (field === 'name') {
        const species = getPokemonByName(input.value);
        if (!species) { input.value = entry.name; return; }
        team[index] = sanitizeTeamEntry({...entry, name: species.name, ability: species.abilities[0],
          item: getPokemonByName(entry.name).isMega && !species.isMega ? '' : entry.item,
          moveSet: species.moves, damageMultiplier: 1});
        if(side==='our' && state.teamOffenseExcluded.has(entry)) state.teamOffenseExcluded.add(team[index]);
      } else if(field==='ability' && side==='our' && battleSpecies(entry,'our').megaStoneName) {
        getPreferences(entry,'our').baseAbilityChoice=input.value;savePreferences();
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
  const container = document.getElementById('ourTeamList');
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
      if (!isSelected) {
        return `<div class="team-row compact-team" data-team-index="${actualIndex}">
          <img class="team-avatar" src="${getPokemonImage(entry.name)}" alt="${entry.name}" />
          <div class="compact-row-copy">${pokemonListHeading(entry,actualIndex,false,true)}
            <div class="opponent-card-details">${baseStatsMarkup(entry)}</div></div>
        </div>`;
      }

      const total = getTotalInvestment(entry);
      const megaItem = Battle.requiredMegaItem(getPokemonByName(entry.name));
      const plusValue = entry.nature?.plus || '';
      const minusValue = entry.nature?.minus || '';
      const statFields = statOrder.map((stat) => `
        <div class="input-block">
          <label for="team-${actualIndex}-${stat}">${statLabels[stat]}</label>
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
          <img class="team-avatar" src="${getPokemonImage(entry.name)}" alt="${entry.name}" />
          <div class="team-main">
            <div class="team-top-row">
              <div>
                <div class="pokemon-name">${entry.name}</div>
                <div class="pokemon-type">${entry.types.join(' / ')}</div>
              </div>
              <div class="team-member-actions">${knownItemMarkup(entry)}<span class="column-tag">${actualIndex + 1}</span>
                ${teamOrderControls(entry,actualIndex)}
                <button type="button" class="control-btn delete" data-remove-team-index="${actualIndex}"
                  aria-label="Remove ${escapeHtml(entry.name)} from team">×</button></div>
            </div>
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
                  list="itemList-${actualIndex}"
                  value="${escapeHtml(entry.item)}"
                  data-team-index="${actualIndex}"
                  data-field="item"
                />
                <datalist id="itemList-${actualIndex}">
                  ${itemOptions.map((item) => `<option value="${item}"></option>`).join('')}
                </datalist>
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
            <div class="selected-base-stats"><span>Base stats</span>${baseStatsMarkup(entry)}</div>
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
      const interactive = event.target.closest('input, select, label, details, summary, button');
      if (interactive) return;
      const teamIndex = Number.parseInt(row.getAttribute('data-team-index'), 10);
      if (!Number.isNaN(teamIndex)) {
        state.activeOurIndex = teamIndex;
        render();
      }
    });
  });

  container.querySelectorAll('input[data-stat]').forEach((input) => {
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

function addOpponentFromSearch(name) {
  const match = getPokemonByName(name);
  if (!match) return;

  const entry = sanitizeOpponentEntry({name: match.name});

  state.opponentList.unshift(entry);
  state.activeOpponentIndex = 0;
  state.searchQuery = '';
  state.searchCursor = 0;

  const input = document.getElementById('pokemonSearchInput');
  if (input) input.value = '';

  render();
}

function resetBattle() {
  state.weather='';state.terrain='';state.alliesFainted=0;state.opponentsFainted=0;
  state.preferences=Object.fromEntries(Object.keys(state.preferences).map(key=>[key,sanitizePreferences()]));
  // These legacy mirrors must agree with preferences when a team is reloaded.
  for(const member of state.ourTeam) member.damageMultiplier=1;
  for(const team of state.teamLibrary) for(const member of team.pokemon) member.damageMultiplier=1;
  cancelBalanceSearch();stopBalanceOptimization(true);cancelDefenseSearch();cancelOffenseThresholdSearch();
  savePreferences();saveTeamToStorage();render();
}

function knownItemMarkup(entry) {
  if(savedSpecies(entry)?.isMega) return megaStoneMarkup(entry,'our');
  if(!entry.item) return '';
  const image=window.ITEM_SPRITES?.[entry.item],hint=window.ITEM_HINTS[calc.toID(entry.item)];
  const label=`${entry.item}${hint ? `. ${hint.description}` : ''}`;
  return `<span class="item-hint known-item" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(entry.item)}" />` : `<small>${escapeHtml(entry.item)}</small>`}</span>`;
}
function megaStoneMarkup(entry,side) {
  const species=savedSpecies(entry),stone=Battle.requiredMegaItem(species),active=getPreferences(species,side).megaActive;
  const image=window.ITEM_SPRITES[stone],effective=battleSpecies(species,side);
  const label=`${stone}\n${active ? species.name : effective.name} active. Click to ${active ? 'use the ordinary form' : 'Mega Evolve'}. The stone remains held.`;
  return `<button type="button" class="item-hint mega-stone" data-mega-side="${side}" data-mega-id="${species.id}" aria-pressed="${active}" aria-label="${escapeHtml(label)}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(stone)}" />` : escapeHtml(stone)}<span role="tooltip" class="item-tooltip" popover="manual">${escapeHtml(label)}</span></button>`;
}
function pokemonListHeading(entry,index,remove=false,ours=false) {
  return `<div class="opponent-name-block"><div class="opponent-name-line">
    <div class="pokemon-identity"><div class="pokemon-name" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</div><div class="pokemon-type">${entry.types.join(' / ')}</div></div>
    ${ours ? knownItemMarkup(entry) : buildItemHints(entry)}<span class="column-tag">${index+1}</span>${ours ? teamOrderControls(entry,index) : ''}
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
    .map((entry, index) => {
      const actualIndex = state.opponentList.indexOf(entry);
      return `<div class="opponent-row compact${actualIndex === state.activeOpponentIndex ? ' item-color-selected' : ''}" data-opponent-index="${actualIndex}">
        <img class="team-avatar" src="${getPokemonImage(entry.name)}" alt="${entry.name}" />
        <div class="compact-row-copy">${pokemonListHeading(entry,actualIndex,true)}
          <div class="opponent-card-details">${baseStatsMarkup(entry)}</div></div>
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

function buildActiveSummaryMarkup(entry) {
  if (!entry) {
    return '<div class="empty-state">No selection</div>';
  }

  const side=entry.kind==='opponent' ? 'opponent' : 'our',species=battleSpecies(entry,side);
  entry={...battleEntry(entry,side),name:species.name,types:species.types};
  const opponentItem = side==='opponent' ? appliedOpponentItem(entry) : '';
  return `
    <img src="${getPokemonImage(entry.name)}" alt="${entry.name}" />
    <div class="summary-meta">
      <div class="summary-name">${entry.name}</div>
      <div class="summary-types">${entry.types.join(' / ')}</div>
      <div class="summary-item">${entry.kind === 'opponent' ? (opponentItem ? `${escapeHtml(opponentItem)} selected` : 'No assumed moves, investment or item') : `${escapeHtml(entry.item)} • ${escapeHtml(entry.nature.name)}`}</div>
    </div>
  `;
}

function renderActiveSummary() {
  const ourEntry = state.ourTeam[state.activeOurIndex] || state.ourTeam[0];
  const opponentEntry = state.opponentList[state.activeOpponentIndex] || state.opponentList[0];

  document.getElementById('ourActiveSummary').innerHTML = buildActiveSummaryMarkup(ourEntry);
  document.getElementById('ourActiveBaseStats').innerHTML=ourEntry ? baseStatsMarkup(battleSpecies(ourEntry,'our')) : '';
  document.querySelector('.our-active-heading .base-stat-caption').hidden=!ourEntry;
  document.getElementById('opponentActiveSummary').innerHTML = buildActiveSummaryMarkup(opponentEntry);
  document.getElementById('opponentActiveBaseStats').innerHTML=opponentEntry ? baseStatsMarkup(battleSpecies(opponentEntry,'opponent')) : '';
  document.querySelector('.opponent-active-heading .base-stat-caption').hidden=!opponentEntry;
}

function renderSpeedSummary() {
  const container = document.getElementById('speedSummary');
  if (!container) return;

  const ourEntry = state.ourTeam[state.activeOurIndex] || state.ourTeam[0];
  const opponentEntry = state.opponentList[state.activeOpponentIndex] || state.opponentList[0];

  if (!ourEntry || !opponentEntry) {
    container.innerHTML = '<div class="empty-state">No matchup selected.</div>';
    return;
  }

  const species = battleSpecies(opponentEntry,'opponent');
  const ability=appliedOpponentAbility(opponentEntry);
  const field=Battle.speedField(state,battleEntry(ourEntry).ability,ability);
  const targetSpeed = Battle.speed(getPokemonByName(ourEntry.name),ourEntry,field);
  // These are independent opponent scenarios; our exact build remains fixed.
  const scenarios = [
    {label: 'Normal', item: ''},
    {label: 'Choice Scarf', item: 'Choice Scarf'},
    {label: 'Tailwind', item: '', tailwind: true}
  ];
  container.innerHTML = scenarios.map(scenario => {
    if ((species.isMega || species.megaStoneName) && scenario.item === 'Choice Scarf') {
      return '<div class="speed-scenario"><dt>Choice Scarf</dt><dd class="speed-unavailable">Unavailable · Mega Stone required</dd></div>';
    }
    const tier = Battle.speedTier(species, {...opponentEntry,ability,item: scenario.item}, targetSpeed,
      {...field,tailwind: !!scenario.tailwind});
    const detail=`Opponent relative to our exact build (Speed ${targetSpeed}). Weather: ${field.weather || 'None'}; Terrain: ${field.terrain || 'None'}. Opponent ability: ${ability || 'not assumed'}.`;
    return `<div class="speed-scenario" title="${escapeHtml(detail)}"><dt>${scenario.label}</dt><dd><strong class="speed-tier">${tier.label}</strong></dd></div>`;
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
  const job={species:defenseSpecies(getPokemonByName(ours.name),'our'),ours:battleEntry(ours),stats,
    options:{format:state.format,attackerAlliesFainted:state.alliesFainted,attackerStages:statStages(ours,'our')},
    targets:builderOffenseProfiles(ours).map(profile=>({id:profile.scenarioId,species:defenseSpecies(profile.species),
      spreads:getUsage(profile.species)?.spreads || [],
      options:{weather:profile.weather,terrain:profile.terrain,defenderAbility:profile.ability,defenderItem:appliedOpponentItem(profile.species),defenderStages:statStages(profile.species,'opponent')},
      boosts:{def:natureBoostForMove(profile.species,'defense','def'),spd:natureBoostForMove(profile.species,'defense','spd')}}))};
  const key=JSON.stringify(job);
  if(key!==offenseThresholdTrial.key) {cancelOffenseThresholdSearch();offenseThresholdTrial={key,worker:null,finished:false,thresholds:null};}
  const trial=offenseThresholdTrial;
  if(!trial.worker && !trial.finished) {
    const worker=new Worker('stat-threshold-worker.js?v=20261118-equal-two-hit-points');trial.worker=worker;
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
    const exact=calc.toID(species.id),reference=calc.toID(getUsage(species)?.name || '');
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
  const attackerStages=statStages(ours,'our');
  const signature = JSON.stringify([{...ours,moveSet:[]},state.format,state.weather,state.terrain,state.alliesFainted,attackerStages,species.calcId || species.id]);
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
        if (!cached.moves.has(name)) cached.moves.set(name,Offense.analyze(species,{...ours,moveSet:[name]},defender,usage?.spreads || [],{
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
  document.getElementById('builderMoveTrialText').textContent = moveTrial.best
    ? `Try ${moveTrial.best.to} over ${moveTrial.best.from}`
    : moveTrial.finished ? 'No move swap improves this offense score.' : 'Finding best move swap…';
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
    input.max=String(selected.investment[stat]);input.value=String(trial.points);
    input.disabled=!selected.investment[stat];
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
  document.getElementById('builderSelectedSummary').innerHTML=`<strong>${escapeHtml(battleSpecies(selected,'our').name)}</strong><span>ATK ${getEffectiveStat(preview,'atk')} · SPA ${getEffectiveStat(preview,'spa')}</span>`;
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
      const coverage = Math.min(100,member.coverage).toFixed(1);
      const detail = member.error || member.detail || `${member.attacker ? `${member.attacker} · ` : ''}${member.move}${member.meta.multihit ? ' (one hit)' : ''}${member.extraTurns ? ' · +1 turn to break Disguise' : ''}${member.firstHitAbility ? ` · ${member.firstHitAbility} halves the first attack; follow-up attacks use normal damage` : ''}${member.repeatedUse ? ' · Repeated use includes cumulative offensive stat changes' : ''} · ${member.count} reported spreads cover ${coverage}% of sets (${member.reference}).`;
      const changed=member.baselineKind;
      const better=changed && (state.builderPanel === 'balance'
        ? Balance.groups.findIndex(group=>group.kind===member.kind)<Balance.groups.findIndex(group=>group.kind===changed) : state.builderPanel === 'defense'
        ? Offense.points(member)<Offense.points({kind:changed}) : Offense.points(member)>Offense.points({kind:changed}));
      const scenario=member.scenario;
      const assumption=scenario ? `${scenario.value}${scenario.field==='terrain' ? ' Terrain' : ''} ${scenario.active ? `assumed active (${scenario.ability})` : `not assumed (${scenario.ability})`} · Weather: ${scenario.weather || 'None'} · Terrain: ${scenario.terrain || 'None'} · ` : '';
      const thresholds=(member.statThresholds || []).map(threshold=>{
        const label={atk:'Atk',spa:'SpA',defense:'Def SP'}[threshold.stat];
        const delta=threshold.low===threshold.high ? `${threshold.high}` : `${threshold.low}–${threshold.high}`;
        const text=threshold.pending ? `${label} …` : threshold.error ? `${label} ?` : threshold.high ? `−${delta} ${label}` : `${label} —`;
        const explanation=threshold.pending ? `${label}: calculating a shared stat-removal path.` : threshold.error ? `${label}: threshold unavailable.`
          : threshold.high ? `${label}: ${threshold.low===threshold.high ? threshold.high : `${threshold.low}–${threshold.high}`} additional points removed changes this tier to ${names[threshold.kind]}. ${threshold.stat==='defense' ? 'Along a shared locally optimal HP/Def/SpD removal path.' : 'Approximate six-point bracket, holding the other preview stats and moves fixed.'}`
          : `${label}: no tier change within ${threshold.limit} remaining removable points on the shared path.`;
        return {text,explanation,stat:threshold.stat};
      });
      const showChance=state.builderPanel!=='balance',chance=showChance ? Offense.tierProbability(member) : null;
      const chanceText=chance===null ? '—' : chance>0 && chance<0.001 ? '<0.1%' : `${(100*chance).toFixed(1).replace(/\.0$/,'')}%`;
      const hits=Offense.tierHits(member.kind),koTarget=state.builderPanel==='defense' ? 'opponent KOing us' : 'KOing the opponent';
      const chanceDetail=showChance ? chance===null ? 'KO probability unavailable for this matchup.'
        : `${chanceText} chance of ${koTarget} ${hits===Infinity ? 'eventually (4+ tier or better)' : `within ${hits} hit${hits===1 ? '' : 's'}`}, weighted by reported builds and damage rolls${state.builderPanel==='defense' ? ' and estimated strongest-move availability' : ''}. Excludes accuracy and between-hit healing.` : '';
      const description = `${assumption}${member.species.name} · ${state.format} usage #${member.rank} · ${names[member.kind]}${showChance ? ` · ${chanceDetail}` : ''}${changed ? ` · Preview: ${names[changed]} → ${names[member.kind]}` : ''}${thresholds.length ? ` · ${thresholds.map(t=>t.explanation).join(' ')}` : ''} · ${detail}`;
      const hasModeled=member.samples>(member.unknown || 0);
      const winText=hasModeled ? `${(100*member.wins/member.samples).toFixed(1).replace(/\.0$/,'')}%` : '—';
      const winBadge=state.builderPanel==='balance' ? `<span class="balance-win-badge" aria-label="Estimated win percentage">${winText}</span>` : '';
      const chanceBadge=showChance ? `<span class="ko-chance-badge" title="${escapeHtml(chanceDetail)}" aria-label="${escapeHtml(chanceDetail)}">${chanceText}</span>` : '';
      return `<span class="tier-pokemon${showChance ? ' has-ko-chance' : ''}${scenario?.active ? ` field-assumed field-${scenario.value.toLowerCase()}` : ''}${changed ? ` tier-changed ${better ? 'tier-improved' : 'tier-worsened'}` : ''}" data-scenario-id="${escapeHtml(member.scenarioId || member.species.id)}" data-scenario-weight="${member.weight ?? 1}" ${scenario ? `data-field-active="${scenario.active}"` : ''} ${changed ? `data-baseline-tier="${changed}"` : ''} data-offense-species="${escapeHtml(member.species.id)}" ${state.builderPanel === 'defense' ? `data-defense-species="${escapeHtml(member.species.id)}"` : state.builderPanel === 'balance' ? `data-balance-species="${escapeHtml(member.species.id)}"` : ''} title="${escapeHtml(description)}">
        <img src="${getPokemonImage(member.species.name)}" alt="${escapeHtml(description)}" loading="lazy" />${winBadge}${chanceBadge}${thresholds.length ? `<span class="stat-thresholds">${thresholds.map(t=>`<span class="stat-threshold-badge" data-stat-threshold="${t.stat}">${escapeHtml(t.text)}</span>`).join('')}</span>` : ''}</span>`;
    }).join('');
    return `<section class="builder-tier-group" data-offense-group="${group.kind}"><h3>${group.kind === 'guaranteed-ohko' ? 'Nearly Guaranteed OHKO<sup class="ko-caveat" tabindex="0" title="Based on reported statistical usage spreads, not the maximum possible bulk. Unreported builds may survive." aria-label="Based on usage spreads, not maximum possible bulk">?</sup>' : group.label}${state.builderPanel==='balance' ? '' : `<small class="tier-point-value">${Offense.points(group)} points</small>`}<span class="offense-tier-count">${members.length}</span></h3><div class="tier-icon-cloud">${icons}</div></section>`;
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
      return {...Offense.best(moves.map(name => profiles[index][targetIndex].evaluate(name))),attacker:entry.name};
    });
    return {scenarioId:profile.scenarioId,scenario:profile.scenario,weight:profile.weight,species:profile.species,reference:profile.reference,rank:profile.rank,...Offense.best(results)};
  });
}
function renderTeamMoveTrials() {
  document.getElementById('teamOffenseTrials').innerHTML = teamOffenseSelected().map(({entry,index}) => {
    const trial = teamMoveTrials.get(index);
    const text = trial?.best ? `Try <b>${escapeHtml(trial.best.to)}</b> <span class="swap-over">over ${escapeHtml(trial.best.from)}</span>`
      : trial?.finished ? 'No move swap improves team coverage.' : 'Finding best move swap…';
    return `<label class="team-move-trial ${trial?.enabled ? 'preview-active' : ''}"><input type="checkbox" data-team-move-trial="${index}" ${trial?.enabled ? 'checked' : ''} ${trial?.best && trial.finished ? '' : 'disabled'} />
      <strong>${escapeHtml(entry.name)}</strong><span class="swap-description">${text}</span>${trial?.best ? `<small>+${trial.best.gain.toFixed(1)} points</small>` : ''}</label>`;
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
      <img src="${getPokemonImage(battleSpecies(entry,'our').name)}" alt="" />${escapeHtml(battleSpecies(entry,'our').name)}</button>`).join('');
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
  budgetInput.max=String(free);budgetInput.value=String(points);budgetInput.hidden=!free;budgetInput.disabled=!free;
  document.getElementById('builderDefenseTrialSuffix').hidden=!free;
  input.checked=trial.enabled;input.disabled=!points || !trial.finished || !trial.best;
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
  const roster=builderRoster(getPokemonByName(selected.name),false),weights=statDistributionWeights(roster);
  const job={species:defenseSpecies(getPokemonByName(selected.name),'our'),ours:battleEntry(selected),
    options:{format:state.format,weather:state.weather,terrain:state.terrain,attackerAlliesFainted:state.opponentsFainted},
    targets:roster.flatMap(species=>Battle.fieldScenarios(species,appliedOpponentAbility(species),state).map(condition=>{
      const usage=getUsage(species),prefs=getPreferences(species,'opponent');
      return {scenarioId:condition.scenarioId,scenario:condition.scenario,weight:condition.weight*(weights.get(species.id) ?? 1),species:defenseSpecies(species),usage:{name:usage?.name,rank:usage?.rank,moves:usage?.moves || [],spreads:usage?.spreads || []},
        options:{weather:condition.weather,terrain:condition.terrain,attackerAbility:condition.ability,attackerItem:appliedOpponentItem(species),
          attackerStages:statStages(species,'opponent'),defenderStages:statStages(selected,'our')},
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
      const worker=trial.worker || new Worker('defense-worker.js?v=20261118-equal-two-hit-points');
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
  document.getElementById('builderSelectedSummary').innerHTML=`<strong>${escapeHtml(battleSpecies(selected,'our').name)}</strong><span>HP ${getEffectiveStat({...selected,investment},'hp')} · Def ${getEffectiveStat({...selected,investment},'def')} · Sp. Def ${getEffectiveStat({...selected,investment},'spd')}</span>`;
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
  const opt=balanceOptimization,worker=new Worker('balance-opt-worker.js?v=20261118-mega-toggle');
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
    document.getElementById('builderSelectedSummary').innerHTML=`<strong>${escapeHtml(battleSpecies(selected,'our').name)}</strong><span>${statOrder.map(stat=>`${statLabels[stat]} ${getEffectiveStat(build,stat)}`).join(' · ')}</span>`;
  }
  renderOffenseRows(rows,`balance:${state.activeTeamId}:${state.activeOurIndex}:${state.format}:${state.builderTopN}`,'',Balance.groups);
  const status=document.getElementById('builderBalanceStatus');
  status.textContent=balanceTrial.error || (balanceTrial.finished ? '256 usage-sampled duels per matchup · hover for assumptions' : `Simulating 1v1s… ${balanceTrial.rows.length}/${balanceTrial.total} matchups`);
  if(!balanceTrial.rows.length) document.getElementById('builderOffenseTiers').innerHTML=`<div class="empty-state">${escapeHtml(balanceTrial.error || 'Simulating full-HP matchups…')}</div>`;
  document.getElementById('builderOffenseTiers').setAttribute('aria-label','Estimated 1v1 matchup outcomes');
}
function renderBuilderBalance(selected) {
  const roster=builderRoster(getPokemonByName(selected.name),false),weights=statDistributionWeights(roster);
  const job={species:defenseSpecies(getPokemonByName(selected.name),'our'),ours:battleEntry(selected),
    targets:roster.flatMap(species=>Battle.fieldScenarios(species,appliedOpponentAbility(species),state).map(condition=>{
      const usage=getUsage(species) || {},prefs=getPreferences(species,'opponent');
      const abilities=species.abilities.length===1 ? [{name:species.abilities[0],percent:100}]
        : (species.megaStoneName ? prefs.baseAbilityChoice : prefs.abilityChoice)!=='auto' || condition.scenario?.active ? [{name:condition.ability,percent:100}]
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
      const worker=new Worker('balance-worker.js?v=20261118-mega-toggle');trial.worker=worker;
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
  document.getElementById('builderSelectedSummary').innerHTML=`<strong>${escapeHtml(battleSpecies(selected,'our').name)}</strong><span>${statOrder.map(stat=>`${statLabels[stat]} ${getEffectiveStat(selected,stat)}`).join(' · ')}</span>`;
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
  document.getElementById('builderOffenseFields').hidden = !damage;
  document.getElementById('offenseFaintedInput').closest('.fainted-control').hidden = defense;
  document.getElementById('defenseFaintedInput').closest('.fainted-control').hidden = !defense && !balance;
  renderFieldOptions();
  renderFaintedOptions();
  document.getElementById('builderPanelTitle').textContent = balance ? 'Balance' : defense ? 'Defense' : teamOffense ? 'Team Offense' : offense ? 'Offense' : 'Speed tiers';
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
    summary.innerHTML = `<strong>${escapeHtml(battleSpecies(selected,'our').name)}</strong><span>ATK ${getEffectiveStat(selected,'atk')} · SPA ${getEffectiveStat(selected,'spa')}</span>`;
    renderBuilderOffense(selected);return;
  }
  const data = Battle.builderSpeedGroups(builderRoster(species),species,battleEntry(selected),{...state,opponentAbility:appliedOpponentAbility});
  summary.innerHTML = `<strong>${escapeHtml(battleSpecies(selected,'our').name)}</strong><span>Speed <b>${data.target}</b> · ${selected.investment.spe} SP · ${escapeHtml(selected.nature.name)}</span>`;
  const icon = member => {
    const rank = member.species.usage?.[state.format]?.rank;
    let description = `${member.species.name} · Base Speed ${member.baseSpeed} · ${member.tie ? 'Same base Speed. ' : ''}${member.tier.label}${rank ? ` · ${state.format} usage #${rank}` : ''} · Weather: ${member.weather || 'None'}; Terrain: ${member.terrain || 'None'} · Opponent ability: ${member.ability || 'not assumed'}`;
    const showBadge=member.baseSpeed<data.baseSpeed && !(member.tier.kind==='always-slower' && member.outspeedPoints===0);
    const investmentTip=showBadge && member.outspeedPoints!==null
      ? `${member.outspeedPoints>32 ? 'With a Speed-boosting nature · ' : ''}Invest ${member.outspeedPoints} more to always be faster` : '';
    if(investmentTip) description+=` · ${investmentTip}`;
    const speedRequirement=member.outspeedPoints===null ? 'Cannot always outspeed even with 32 Speed SP and a Speed-boosting nature'
      : `${member.outspeedPoints} neutral-nature-equivalent Speed points to always outspeed${member.outspeedPoints>32 ? '; requires a Speed-boosting nature' : ''}`;
    const badge=showBadge ? `<span class="speed-investment-badge" title="${escapeHtml(speedRequirement)}; our item and ability versus 32 Speed SP and a Speed-boosting nature, no opponent item, in this field.${investmentTip ? ` ${investmentTip}` : ''}">${member.outspeedPoints===null ? '—' : member.outspeedPoints}</span>` : '';

    return `<span class="tier-pokemon" data-tier-species="${escapeHtml(member.species.id)}" data-required-points="${member.tier.points ?? ''}" title="${escapeHtml(description)}">
      <img src="${getPokemonImage(member.species.name)}" alt="${escapeHtml(description)}" loading="lazy" />${badge}</span>`;
  };
  const cloud = members => members.length ? `<div class="tier-icon-cloud">${members.map(icon).join('')}</div>` : '';
  const tie = members => `<section id="builderSpeedTie" class="builder-speed-tie" aria-label="Speed Tie, matching base Speed"><h3>Speed Tie <small>Base ${data.baseSpeed}</small></h3>${cloud(members)}</section>`;
  list.innerHTML = data.groups.filter(group => group.members.length).map(group => {
    const ties = group.members.filter(member => member.tie);
    const body = ties.length ? cloud(group.members.filter(member => member.baseSpeed > data.baseSpeed)) + tie(ties)
      + cloud(group.members.filter(member => member.baseSpeed < data.baseSpeed)) : cloud(group.members);
    return `<section class="builder-tier-group" data-speed-group="${group.kind}"><h3>${group.label}</h3>${body}</section>`;
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
}

let activeItemTooltip=null;
function hideItemTooltip() {
  if(activeItemTooltip?.matches(':popover-open')) activeItemTooltip.hidePopover();
  activeItemTooltip=null;
}
function showItemTooltip(button) {
  const tooltip=button.querySelector('.item-tooltip');
  if(!tooltip) return;
  hideItemTooltip();activeItemTooltip=tooltip;
  tooltip.style.left='0px';tooltip.style.top='0px';tooltip.showPopover();
  const anchor=button.getBoundingClientRect(),box=tooltip.getBoundingClientRect();
  tooltip.style.left=`${Math.max(8,Math.min(anchor.left,innerWidth-box.width-8))}px`;
  const top=anchor.bottom+6+box.height<=innerHeight-8 ? anchor.bottom+6 : anchor.top-box.height-6;
  tooltip.style.top=`${Math.max(8,Math.min(top,innerHeight-box.height-8))}px`;
}
function bindStaticControls() {
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-mega-side]');if(!button) return;
    const species=getPokemonByName(button.dataset.megaId),prefs=getPreferences(species,button.dataset.megaSide);
    prefs.megaActive=!prefs.megaActive;savePreferences();render();
  });
  document.addEventListener('pointerover',event=>{
    const button=event.target.closest('button.item-hint');
    if(button && !button.contains(event.relatedTarget)) showItemTooltip(button);
  });
  document.addEventListener('pointerout',event=>{
    const button=event.target.closest('button.item-hint');
    if(button && !button.contains(event.relatedTarget)) hideItemTooltip();
  });
  document.addEventListener('focusin',event=>{
    if(event.target.matches('button.item-hint:focus-visible')) showItemTooltip(event.target);
  });
  document.addEventListener('focusout',event=>{if(event.target.matches('button.item-hint')) hideItemTooltip();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape') hideItemTooltip();});
  window.addEventListener('resize',hideItemTooltip);
  document.addEventListener('scroll',()=>{
    const button=activeItemTooltip?.closest('button');
    if(button && (button.matches(':hover') || button.matches(':focus-visible'))) showItemTooltip(button);
    else hideItemTooltip();
  },true);
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-field-option]');
    if(!button) return;
    state[button.dataset.fieldOption]=button.dataset.fieldValue;
    renderFieldOptions();renderOpponentList();renderDamageRanges();renderSpeedSummary();renderTeamBuilder();
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
    if (!getItemHints(getPokemonByName(opponent.name)).some(item => item.name === name)) return;
    const prefs=getPreferences(opponent,'opponent');
    prefs.itemChoice = prefs.itemChoice === name ? '' : name;
    savePreferences();
    renderOpponentList();
    renderActiveSummary();renderDamageRanges();
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
    const field=battleSpecies(opponent,'opponent').megaStoneName ? 'baseAbilityChoice' : 'abilityChoice';
    getOpponentPreferences()[field] = appliedOpponentAbility(opponent) === name ? '' : name;
    savePreferences();
    renderDamageRanges();
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
  bindUsagePicker(document.getElementById('pokemonSearchInput'),{choices:buildSearchResults,markup:pokemonChoiceMarkup,choose:item=>addOpponentFromSearch(item.name)});
  bindUsagePicker(document.getElementById('teamPokemonInput'),{choices:buildTeamSearchResults,markup:pokemonChoiceMarkup,choose:item=>addTeamPokemon(item.name,item.savedBuild)});
  document.addEventListener('pointerdown',event=>{
    if(activeUsagePicker && !activeUsagePicker.popup.contains(event.target) && event.target!==activeUsagePicker.input) closeUsagePicker();
  });
  window.addEventListener('resize',closeUsagePicker);
  document.addEventListener('scroll',event=>{if(activeUsagePicker && !activeUsagePicker.popup.contains(event.target)) closeUsagePicker();},true);

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
  for (const [id, field] of [['boostNatureToggle', 'defenseNatureChoice'], ['boostOffenseNatureToggle', 'offenseNatureChoice']]) {
    document.getElementById(id).addEventListener('change', event => {
      getOpponentPreferences()[field] = event.target.checked;
      savePreferences();
      renderDamageRanges();
    });
  }
  document.getElementById('natureUsageDefaultsButton').addEventListener('click', () => {
    const prefs = getOpponentPreferences();
    prefs.defenseNatureChoice = prefs.offenseNatureChoice = 'auto';
    savePreferences();
    renderDamageRanges();
  });
}

function setupItemHighlightEditor() {
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
  choicePopup.setAttribute('popover','manual');
  document.body.append(choicePopup);
  document.getElementById('speciesList').innerHTML = pokerData.map(p => `<option value="${escapeHtml(p.name)}"></option>`).join('');
  document.getElementById('rosterStatus').textContent = `${pokerData.length} species/forms · roster snapshot ${rosterSnapshot.generatedAt.slice(0, 10)}`;
  repairTeamState();
  initializeTeamLibrary();

  if (!state.opponentList.length) {
    state.opponentList = createDefaultOpponents();
  }

  state.activeOurIndex = clamp(state.activeOurIndex, 0, Math.max(0, state.ourTeam.length - 1));
  state.activeOpponentIndex = clamp(state.activeOpponentIndex, 0, Math.max(0, state.opponentList.length - 1));

  setupItemHighlightEditor();
  bindStaticControls();
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
function getDefenseInvestmentLevels() {
  return [0, 35, 64].map(points => ({points, label: `${points} SP: optimal HP / relevant defense`}));
}
function calculateMoveRange(attacker, defender, moveName, defenseInvestment = null, options = {}) {
  if (attacker.kind === 'opponent') attacker = {...attacker, ability: appliedOpponentAbility(attacker), item: appliedOpponentItem(attacker)};
  if (defender.kind === 'opponent') defender = {...defender, ability: appliedOpponentAbility(defender), item: appliedOpponentItem(defender)};
  return Battle.range(getPokemonByName(attacker.name), attacker, getPokemonByName(defender.name), defender,
    moveName, {defenseInvestment, format: state.format, weather: state.weather, terrain: state.terrain,
      attackerStages:statStages(attacker,attacker.kind==='opponent' ? 'opponent' : 'our'),
      defenderStages:statStages(defender,defender.kind==='opponent' ? 'opponent' : 'our'),
      attackerAlliesFainted:attacker.kind === 'opponent' ? state.opponentsFainted : state.alliesFainted,...options});
}
function formatPercent(value) { return `${Math.floor((value + Number.EPSILON) * 10) / 10}%`; }
function incomingThreats(opponent, ours) {
  const species = battleSpecies(opponent,'opponent');
  const usage = getUsage(species);
  const ourSpecies = battleSpecies(ours,'our');
  const options = {format: state.format, weather: state.weather, terrain: state.terrain,
    attackerAlliesFainted:state.opponentsFainted,
    opponentItem: appliedOpponentItem(opponent),
    opponentAbility: appliedOpponentAbility(opponent),
    attackerStages:statStages(opponent,'opponent'),defenderStages:statStages(ours,'our'),
    boostOffenseNature: false};
  const usageRows = new Map((usage?.moves || []).map(row => [calc.toID(row.name), row]));
  const candidates = [...new Set(species.learnset)].map(name => {
    const meta = Battle.moveMeta(name);
    if (!meta) return null;
    const moveOptions = {...options, boostOffenseNature: natureBoostForMove(opponent, 'offense', meta.offensiveStat)};
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
      {...options, boostOffenseNature: natureBoostForMove(opponent, 'offense', row.range.meta.offensiveStat)})});
}
function spreadLabel(investment) {
  return `SP (HP/Atk/Def/SpA/SpD/Spe): ${statOrder.map(stat => investment[stat]).join('/')}`;
}
function incomingScenarioMarkup(row) {
  const damage = range => range.error ? escapeHtml(range.error)
    : `${formatPercent(range.low)}–${formatPercent(range.high)}`;
  if (row.range.error) return `<div class="defense-line"><strong>${damage(row.range)}</strong></div>`;
  const spreadRow = scenario => `<div class="defense-line spread-scenario">
    <span>${scenario.percent === null ? 'Spread usage not reported' : `${scenario.percent}% of sets`} · reported spread #${scenario.rank}</span>
    <strong>${damage(scenario.range)}</strong><small>${spreadLabel(scenario.investment)}</small></div>`;
  const first = row.scenarios[0];
  const rest = row.scenarios.slice(1);
  const ceiling = `<div class="defense-line offense-ceiling"><span>Maximum-offense ceiling</span>
    <strong>${damage(row.ceiling)}</strong><small>${spreadLabel(row.ceilingInvestment)}</small></div>`;
  return `<div class="incoming-ranges">${first ? spreadRow(first) : '<p class="status-note">Stat-spread usage unavailable.</p>'}${ceiling}</div>
    ${rest.length ? `<details class="spread-comparisons"><summary>Other reported spreads (${rest.length})</summary>
      <div class="spread-list">${rest.map(spreadRow).join('')}</div></details>` : ''}`;
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
  renderNatureFlags(theirs);
  document.getElementById('boostNatureToggle').disabled = !outgoing || !theirs || !ours;
  document.getElementById('boostOffenseNatureToggle').disabled = outgoing || !theirs || !ours;
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
      {boostDefenseNature: natureBoostForMove(theirs, 'defense', meta?.defensiveStat)});
    return {name, range};
  }).sort((a, b) => (b.range.high ?? -1) - (a.range.high ?? -1)
    || (b.range.low ?? -1) - (a.range.low ?? -1)) : incomingThreats(theirs, ours);
  container.innerHTML = moves.map(row => {
    const moveName = row.name;
    let meta = row.range.meta || Battle.moveMeta(moveName);
    const scenarios = getDefenseInvestmentLevels();
    const values = outgoing ? scenarios.map(({points,label}) => {
      const range = points === 0 ? row.range : calculateMoveRange(ours, theirs, moveName, points,
        {boostDefenseNature: natureBoostForMove(theirs, 'defense', meta?.defensiveStat)});
      if (range.meta) meta = range.meta;
      const allocation = range.allocation;
      const detail = allocation ? `HP ${allocation.hp} / ${statLabels[allocation.stat]} ${allocation.defense}` : '';
      return `<div class="defense-line"><span title="${label}">${outgoing ? `${points} SP` : label}</span>
        <strong>${range.error ? escapeHtml(range.error) : `${formatPercent(range.low)}–${formatPercent(range.high)}`}</strong>
        ${detail ? `<small class="allocation">${detail}</small>` : ''}</div>`;
    }).join('') : incomingScenarioMarkup(row);
    const frequency = outgoing ? '' : `<div class="move-usage"><span>${row.percent === null ? 'Usage not reported' : `${row.percent}% usage`}</span>
      <span>${row.topDamage ? 'Most damaging' : ''}${row.topDamage && row.topCommon ? ' · ' : ''}${row.topCommon ? 'Top 5 damaging by usage' : ''}</span></div>`;
    return `<div class="move-row" data-move="${escapeHtml(moveName)}"><div class="move-row-top"><div class="move-name">${escapeHtml(moveName)}</div>
      <div class="move-ranges"><span class="range-pill">${meta ? `${meta.type} · ${meta.category}${meta.multihit ? ' · one hit' : ''}${meta.spread && state.format === 'Doubles' ? ' · spread' : ''}` : 'Unknown move'}</span></div></div>
      ${frequency}<div class="investment-stack">${values}</div></div>`;
  }).join('') || '<div class="empty-state">No damaging moves available in this movepool.</div>';
}

Battle.resolveCombatant=(species,entry)=>{
  const side=Array.isArray(entry.moveSet) ? 'our' : 'opponent';
  const effective=battleSpecies(species,side);
  return effective?.megaStoneName ? {species:effective,entry:battleEntry({...entry,id:species.id,name:species.name},side)} : {species,entry};
};
initializeApp();
