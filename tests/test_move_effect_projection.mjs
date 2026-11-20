import assert from 'node:assert/strict';
import {test} from 'node:test';
import projection from '../scripts/move_effect_projection.cjs';

test('random status survives JSON serialization without hardcoding the proc chance',()=>{
  const source={chance:30,onHit(target,source) {const status=this.sample(['psn','par','slp']);target.trySetStatus(status,source);}};
  const output=JSON.parse(JSON.stringify(projection.secondary(source)));
  assert.deepEqual(output,{chance:30,statusChoices:['psn','par','slp']});
  assert.equal(projection.secondary({...source,chance:15}).chance,15);
  assert.deepEqual(projection.secondary({chance:10,status:'brn'}),{chance:10,status:'brn'});
  const conditional={chance:30,onHit(target,source) {if(target.hp>0) {const status=this.sample(['psn','par','slp']);target.trySetStatus(status,source);}}};
  assert.equal(projection.secondary(conditional).statusChoices,undefined);
});
