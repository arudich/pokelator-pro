import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {onRequest} from '../functions/api/usage.js';

function database() {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../config/usage-schema.sql',import.meta.url),'utf8'));
  return {prepare(sql) {return {bind(...args) {
    return {execute:()=>db.prepare(sql).run(...args),all:async()=>({results:db.prepare(sql).all(...args)})};
  },first:async()=>db.prepare(sql).get()};},batch:async rows=>rows.map(row=>row.execute())};
}
const post=counts=>new Request('https://pokelator.win/api/usage',{method:'POST',
  headers:{Origin:'https://pokelator.win','Content-Type':'application/json'},body:JSON.stringify({counts})});

test('counters are off without a binding and reports always require a secret',async()=>{
  let response=await onRequest({request:new Request('https://pokelator.win/api/usage'),env:{}});
  assert.deepEqual(await response.json(),{enabled:false});
  response=await onRequest({request:new Request('https://pokelator.win/api/usage?report=1'),env:{USAGE_DB:database()}});
  assert.equal(response.status,401);
});
test('atomic aggregate increments and authenticated date ranges',async()=>{
  const env={USAGE_DB:database(),USAGE_REPORT_TOKEN:'test-only'};
  assert.equal((await onRequest({request:post({matchup:3,team_created:1}),env})).status,200);
  assert.equal((await onRequest({request:post({matchup:4}),env})).status,200);
  const day=new Date().toISOString().slice(0,10);
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const request=new Request(`https://pokelator.win/api/usage?report=1&since=${day}&until=${tomorrow}`,{headers:{Authorization:'Bearer test-only'}});
  const result=await (await onRequest({request,env})).json();
  assert.equal(result.firstRecordedDay,day);
  assert.equal(result.rows.find(row=>row.event==='matchup').total,7);
  assert.equal(result.rows.find(row=>row.event==='team_created').total,1);
});
test('foreign origins, unrecognized payloads and inflated counts are rejected',async()=>{
  const env={USAGE_DB:database()};
  for(const counts of [{teamName:1},{visit:1000},{visit:-1},{visit:1.5},[],{}]) {
    assert.equal((await onRequest({request:post(counts),env})).status,400);
  }
  const foreign=new Request(post({visit:1}),{headers:{Origin:'https://elsewhere.test','Content-Type':'application/json'}});
  assert.equal((await onRequest({request:foreign,env})).status,403);
});
