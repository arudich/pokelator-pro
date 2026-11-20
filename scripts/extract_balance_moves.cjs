/* Build-time only; Node is unnecessary for the deployed website. */
const fs=require('node:fs');
const path=require('node:path');
const {Dex}=require(path.resolve(process.argv[2], 'build/index.js'));
const metadata=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const fields=['name','accuracy','priority','boosts','drain','heal','multihit','recoil','secondary','secondaries','self','selfdestruct','status','volatileStatus','flags','pp'];
const moves={};
for(const move of [...Dex.moves.all()].sort((a,b)=>a.id.localeCompare(b.id))) {
  moves[move.id]=Object.fromEntries(fields.filter(key=>move[key]!==undefined).map(key=>[key,move[key]]));
}
if(!moves.overheat || !moves.expandingforce || !moves.lastrespects) throw new Error('Incomplete move metadata');
fs.writeFileSync(process.argv[4], '/* Move effects from @pkmn/dex (Pokemon Showdown), MIT; pinned source/hash below. */\nwindow.BALANCE_MOVES = '+JSON.stringify({...metadata,moves})+';\n');
