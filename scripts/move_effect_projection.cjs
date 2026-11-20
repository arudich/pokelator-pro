// JSON cannot retain Showdown callbacks. Preserve their finite random-status effect.
function secondary(effect) {
  if(!effect) return effect;
  const result={...effect},source=typeof effect.onHit==='function' ? effect.onHit.toString() : '';
  const body=source.slice(source.indexOf('{')+1,source.lastIndexOf('}')).trim();
  const choices=body.match(/^const\s+(\w+)\s*=\s*this\.sample\(\s*\[([^\]]+)\]\s*\);\s*target\.trySetStatus\(\s*\1\s*,\s*source\s*\);\s*$/);
  if(choices) {
    const statuses=[...choices[2].matchAll(/['"]([a-z]+)['"]/g)].map(match=>match[1]);
    if(statuses.length && statuses.every(status=>['psn','tox','par','slp','brn','frz'].includes(status))) result.statusChoices=statuses;
  }
  return result;
}
module.exports={secondary};
