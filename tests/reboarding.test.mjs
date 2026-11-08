import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDecision, auditSensitivity } from '../src/decision.mjs';
import { optimizeWindows } from '../src/model.mjs';
import { buildDecisionSheet } from '../src/report.mjs';
import { continuationCheck } from '../src/journey.mjs';
import { OUTBOUND_LOOP, RETURN_LOOP } from './reboarding-fixtures.mjs';
const copy=value=>structuredClone(value);
for(const [name,source,expected,margin] of [
  ['outbound',OUTBOUND_LOOP,{beforeVisit:0,afterVisit:10,transfers:40,onBoard:0},35],
  ['return',RETURN_LOOP,{beforeVisit:50,afterVisit:10,transfers:20,onBoard:0},15]
]) test(`${name} loop reboarding is off-board waiting with a required buffer`,()=>{
  const a=auditDecision(source),j=a.best.journeys[0];
  assert.deepEqual(j.waits,expected);assert.equal(j.headroom.transfer,margin);
  assert.equal(Object.values(j.waits).reduce((a,b)=>a+b),j.waitMinutes);
  assert.deepEqual(a.comparison,optimizeWindows(source));
  assert.match(buildDecisionSheet(a),new RegExp(`minimum transfer/reboarding buffer headroom ${margin}`));
});
for(const [buffer,limit,ids,waits,margin] of [
  [0,1,['ab','bp'],[40,0],40], [5,1,['ab','bp'],[40,0],35],
  [40,1,['ab','bp'],[40,0],0], [41,1,['ab','bc','cb','bp'],[0,20],null],
  [5,0,['ab','bc','cb','bp'],[0,20],null]
]) test(`buffer ${buffer}, transfer cap ${limit} preserves chosen witness and classifies waits`,()=>{
 const s=copy(OUTBOUND_LOOP);s.settings.transferMinutes=buffer;s.settings.maxTransfers=limit;
 const a=auditDecision(s),j=a.best.journeys[0];
 assert.deepEqual(a.comparison.best.results[0].journey.outbound.map(c=>c.id),ids);
 assert.deepEqual([j.waits.transfers,j.waits.onBoard],waits);assert.equal(j.headroom.transfer,margin);
 assert.deepEqual(a.best.zeroHeadroom.transfer,margin===0?['o']:[]);
});
test('increased-buffer sensitivity retains coverage while correcting margin',()=>{
 const r=auditSensitivity(OUTBOUND_LOOP).cases.find(c=>c.id==='longer-transfer');
 assert.equal(r.fixed.reachable,1);assert.deepEqual(r.fixedLost,[]);
 assert.equal(r.fixed.journeys[0].waits.transfers,40);assert.equal(r.fixed.journeys[0].headroom.transfer,30);
});
test('normalization handles shuffled input and interleaved other trips',()=>{
 const s=copy(OUTBOUND_LOOP);s.connections.reverse();
 s.connections.push({id:'unrelated',tripId:'other',from:'C',to:'A',departure:496,arrival:506});
 const a=auditDecision(s);assert.deepEqual(a.best.journeys[0].waits,{beforeVisit:0,afterVisit:10,transfers:40,onBoard:0});
 assert.equal(a.best.journeys[0].headroom.transfer,35);
});
test('continuation compares canonical predecessor IDs, not identity or witness adjacency',()=>{
 const a=auditDecision(OUTBOUND_LOOP),same=continuationCheck(a.scenario.connections);
 const [ab,bc,cb,bp]=a.scenario.connections;
 assert.equal(same(copy(ab),copy(bc)),true);assert.equal(same(ab,bp),false);
 assert.equal(same(null,ab),false);assert.equal(same(bp,ab),false);
 assert.equal(same(bc,cb),true);assert.equal(same(cb,bp),true);
});
