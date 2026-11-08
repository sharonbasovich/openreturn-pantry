import test from 'node:test';
import assert from 'node:assert/strict';
import {SAMPLE} from '../src/sample.mjs';
import {validateScenario} from '../src/model.mjs';
import {parseScenarioJson,exportScenarioJson,parseTimetableCsv,connectionsToCsv,MAX_JSON_BYTES,MAX_CSV_BYTES} from '../src/import.mjs';

function maximal(character='x') {
  const label=(prefix,n=80)=>{let out=prefix;while(out.length+character.length<=n)out+=character;return out+'x'.repeat(n-out.length);};
  const stops=Array.from({length:64},(_,i)=>({id:label(`stop${i}:`),name:label(`Name${i}:`,160)}));
  return validateScenario({version:1,title:label('Title',160),serviceDay:'2026-11-09',dataKind:'synthetic',stops,pantryStop:stops[1].id,
    origins:Array.from({length:24},(_,i)=>({id:label(`origin${i}:`),label:label(`Origin${i}:`,160),stopId:stops[0].id,leaveAfter:0,homeBy:2879,maxAwayMinutes:2879})),
    connections:Array.from({length:1200},(_,i)=>({id:label(`leg${i}:`),tripId:label(`trip${i}:`),from:stops[0].id,to:stops[1].id,departure:i,arrival:i+1})),
    settings:{baselineStart:0,earliestStart:0,latestStart:47,stepMinutes:1,openMinutes:120,visitMinutes:15,transferMinutes:5,maxTransfers:3}});
}
for(const [name,char] of [['ASCII','x'],['quoted','"'],['CJK','界'],['controls','\0'],['lone surrogate','\uD800'],['astral','🚌']]) {
  test(`maximum ${name} scenario preserves exact JSON after Blob serialization`,async()=>{
    const scenario=maximal(char),json=exportScenarioJson(scenario);
    assert(Buffer.byteLength(json)<=MAX_JSON_BYTES);
    const text=await new Blob([json],{type:'application/json'}).text();
    assert.deepEqual(parseScenarioJson(text),scenario);
  });
}
for(const [name,char] of [['ASCII','x'],['quoted','"'],['CJK','界'],['astral','🚌']]) {
  test(`maximum ${name} CSV remains within byte cap and preserves exact IDs`,async()=>{
    const scenario=maximal(char),csv=connectionsToCsv(scenario.connections);
    assert(Buffer.byteLength(csv)<=MAX_CSV_BYTES);
    assert.deepEqual(parseTimetableCsv(await new Blob([csv]).text()),scenario.connections);
  });
}
for(const id of [' edge','edge ','line\nbreak','tab\tinside','carriage\rreturn','null\0inside','delete\u007finside','control\u0085inside','lone\uD800','lone\uDC00','=1+1','+1','-1','@SUM(A1)']) {
  test(`unsupported CSV ID ${JSON.stringify(id)} fails without changing exact JSON`,()=>{
    const s=structuredClone(SAMPLE);s.connections[0].id=id;const valid=validateScenario(s),before=structuredClone(valid);
    assert.throws(()=>connectionsToCsv(valid.connections),/scenario JSON/);
    assert.deepEqual(parseScenarioJson(exportScenarioJson(valid)),valid);
    assert.deepEqual(valid,before);
  });
}
test('formula-leading IDs are refused in every CSV ID column without mutation',()=>{
  for(const field of ['id','tripId','from','to']){
    const c=structuredClone(SAMPLE.connections);c[0][field]='=1+1';const before=structuredClone(c);
    assert.throws(()=>connectionsToCsv(c),/formula-leading/);assert.deepEqual(c,before);
  }
  const head='id,trip_id,from_stop_id,to_stop_id,departure,arrival\r\n';
  for(const row of ['=1+1,t,A,P,09:00,09:20','a,+1,A,P,09:00,09:20','a,t,-1,P,09:00,09:20','a,t,A,@A,09:00,09:20'])assert.throws(()=>parseTimetableCsv(head+row),/formula-leading/);
});
test('long IDs fail both CSV directions at the same 80-unit boundary',()=>{
  const c=structuredClone(SAMPLE.connections);c[0].id='x'.repeat(80);assert.deepEqual(parseTimetableCsv(connectionsToCsv(c)),c);
  c[0].id+='x';assert.throws(()=>connectionsToCsv(c),/80 characters/);
  assert.throws(()=>parseTimetableCsv('id,trip_id,from_stop_id,to_stop_id,departure,arrival\n'+`${c[0].id},t,A,P,09:00,09:20`),/80 characters/);
});
test('caps count UTF-8 bytes and reject before CSV parsing',()=>{
  assert.throws(()=>parseScenarioJson(' '.repeat(MAX_JSON_BYTES+1)),/4,000,000 UTF-8 bytes/);
  assert.throws(()=>parseTimetableCsv('界'.repeat(Math.floor(MAX_CSV_BYTES/3)+1)),/2,000,000 UTF-8 bytes/);
  const csv=connectionsToCsv(SAMPLE.connections);const padded=csv+'\n'.repeat(MAX_CSV_BYTES-Buffer.byteLength(csv));
  assert.deepEqual(parseTimetableCsv(padded),SAMPLE.connections);
  assert.throws(()=>parseTimetableCsv('\uFEFF'+padded),/2,000,000 UTF-8 bytes/);
  for(const value of [null,undefined,1,{}])assert.throws(()=>parseTimetableCsv(value),/must be text/);
});
test('invalid records cannot be serialized into unusable CSV',()=>{
  for(const c of [[],[null],[{...SAMPLE.connections[0],departure:1.5}],[{...SAMPLE.connections[0],arrival:2880}],[SAMPLE.connections[0],SAMPLE.connections[0]]])assert.throws(()=>connectionsToCsv(c));
});
