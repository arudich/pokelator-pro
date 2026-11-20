/* Portable, versioned team snapshots. No storage or DOM side effects. */
(() => {
  'use strict';
  const type = 'pokelator-pro-teams';
  const pokemon = entry => ({name: entry.name, item: entry.item, ability: entry.ability,
    nature: entry.nature, investment: entry.investment, moveSet: entry.moveSet});
  const pack = (teams,includeSaved=false) => ({type, version: 1, teams: teams.map(team => ({name: team.name,
    pokemon: team.pokemon.map(pokemon),...(includeSaved ? {savedPokemon:(team.savedPokemon || team.pokemon).map(pokemon)} : {})}))});
  function parse(text, sanitize) {
    const data = JSON.parse(text);
    if (data?.type !== type || data.version !== 1 || !Array.isArray(data.teams) || !data.teams.length) {
      throw new Error('Choose a Pokelator Pro team or team-library file (version 1).');
    }
    return data.teams.map((team, index) => {
      if (!team || !Array.isArray(team.pokemon)) {
        throw new Error(`Team ${index + 1} must contain a Pokémon list.`);
      }
      const parsePokemon = raw => {
        if (!raw || typeof raw.name !== 'string') throw new Error('A Pokémon name is missing.');
        const points = ['hp','atk','def','spa','spd','spe'].map(stat => raw.investment?.[stat] ?? 0);
        if (points.some(n => !Number.isInteger(n) || n < 0 || n > 32) || points.reduce((a,b) => a+b,0) > 66) {
          throw new Error(`Invalid stat investment for ${raw.name}.`);
        }
        if (!Array.isArray(raw.moveSet) || raw.moveSet.length > 4 || raw.moveSet.some(m => typeof m !== 'string')) {
          throw new Error(`Invalid moves for ${raw.name}.`);
        }
        const clean = sanitize(raw);
        if (!clean || clean.moveSet.length !== raw.moveSet.length || raw.moveSet.some((move,i) => clean.moveSet[i] !== move)) {
          throw new Error(`Unsupported Pokémon or moves: ${raw.name}.`);
        }
        if (raw.ability && raw.ability !== clean.ability) throw new Error(`Invalid ability for ${raw.name}.`);
        if (typeof raw.nature === 'string' && raw.nature.toLowerCase() !== clean.nature.name.toLowerCase()) {
          throw new Error(`Invalid nature for ${raw.name}.`);
        }
        if (raw.nature && typeof raw.nature === 'object') {
          const explicit = Object.hasOwn(raw.nature,'plus') || Object.hasOwn(raw.nature,'minus');
          const invalid = explicit ? ['plus','minus'].some(stat => (raw.nature[stat] ?? null) !== (clean.nature[stat] ?? null))
            : typeof raw.nature.name !== 'string' || raw.nature.name.toLowerCase() !== clean.nature.name.toLowerCase();
          if (invalid) throw new Error(`Invalid nature for ${raw.name}.`);
        }
        return clean;
      };
      const entries=team.pokemon.map(parsePokemon);
      if(team.savedPokemon!==undefined && !Array.isArray(team.savedPokemon)) throw new Error('Invalid saved Pokemon archive.');
      const archive=team.savedPokemon ? {savedPokemon:team.savedPokemon.map(parsePokemon)} : {};
      return {...archive,name: String(team.name || 'Imported team').trim().slice(0,80) || 'Imported team', pokemon: entries};
    });
  }
  function encode(teams) {
    const bytes = new TextEncoder().encode(JSON.stringify(pack(teams)));
    return btoa(Array.from(bytes, n => String.fromCharCode(n)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  }
  function decode(token, sanitize) {
    if (!/^[\w-]+$/.test(token) || token.length > 100000) throw new Error('Invalid team link.');
    const binary = atob(token.replaceAll('-','+').replaceAll('_','/'));
    return parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary, c => c.charCodeAt(0))), sanitize);
  }
  window.TeamFiles = {pack, parse, encode, decode};
})();
