/* Build-time only; Node is unnecessary for the deployed website. */
const fs=require('node:fs');
const path=require('node:path');
const projection=require('./move_effect_projection.cjs');
const {Dex}=require(path.resolve(process.argv[2], 'build/index.js'));
const overrides=require(path.resolve(process.argv[5])).Moves;
const typeOverrides=Object.fromEntries(Object.entries(overrides).filter(([,move])=>typeof move.type==='string').map(([id,move])=>[id,move.type]));
const dex=Dex.mod('champions',{Scripts:{inherit:'gen9'},Moves:overrides});
const metadata=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const fields=['name','type','shortDesc','target','accuracy','priority','boosts','drain','heal','multihit','multiaccuracy','recoil','secondary','secondaries','self','selfdestruct','status','volatileStatus','flags','pp'];
const moves={};
for(const move of [...dex.moves.all()].sort((a,b)=>a.id.localeCompare(b.id))) {
  moves[move.id]=Object.fromEntries(fields.filter(key=>move[key]!==undefined).map(key=>[key,move[key]]));
  if(move.secondary) moves[move.id].secondary=projection.secondary(move.secondary);
  if(move.secondaries) moves[move.id].secondaries=move.secondaries.map(projection.secondary);
}
if(!moves.direclaw?.secondary?.statusChoices) throw new Error('Dire Claw status callback changed; review its declarative projection');
if(!moves.overheat || !moves.expandingforce || !moves.lastrespects) throw new Error('Incomplete move metadata');
fs.writeFileSync(process.argv[4], '/* Move effects from @pkmn/dex (Pokemon Showdown), MIT; pinned source/hash below. */\nwindow.BALANCE_MOVES = '+JSON.stringify({...metadata,moves})+';\n');
fs.writeFileSync(path.join(path.dirname(process.argv[4]),'move-types.js'),'// Champions type overrides from the same pinned source as balance-moves.js.\nwindow.CHAMPIONS_MOVE_TYPES = '+JSON.stringify(typeOverrides)+';\n');
