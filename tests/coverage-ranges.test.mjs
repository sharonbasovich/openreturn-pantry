import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { analyzeCoverageRanges, evaluateWindow, optimizeWindows } from '../src/model.mjs';
import { SAMPLE } from '../src/sample.mjs';
import { oracle } from './support/exhaustive-oracle.mjs';
import { OUTBOUND_LOOP, RETURN_LOOP } from './reboarding-fixtures.mjs';

const clone=value=>structuredClone(value);
function narrow(){return {version:1,title:'A narrow range missed by the grid',serviceDay:'2026-11-08',dataKind:'synthetic',stops:[{id:'a',name:'A'},{id:'p',name:'Pantry'}],pantryStop:'p',origins:[{id:'a',stopId:'a',label:'A',leaveAfter:0,homeBy:30,maxAwayMinutes:30}],connections:[{id:'go',tripId:'go',from:'a',to:'p',departure:8,arrival:11},{id:'back',tripId:'back',from:'p',to:'a',departure:13,arrival:16}],settings:{baselineStart:0,earliestStart:0,latestStart:20,stepMinutes:10,openMinutes:2,visitMinutes:2,transferMinutes:5,maxTransfers:0}};}
function verify(scenario,useOracle=false){
  const before=JSON.stringify(scenario),audit=analyzeCoverageRanges(scenario),normal=optimizeWindows(scenario);
  assert.equal(JSON.stringify(scenario),before);
  assert.equal(audit.ranges[0].start,scenario.settings.earliestStart);
  assert.equal(audit.ranges.at(-1).end,scenario.settings.latestStart);
  for(let i=1;i<audit.ranges.length;i++)assert.equal(audit.ranges[i-1].end+1,audit.ranges[i].start);
  const all=[];
  for(let start=scenario.settings.earliestStart;start<=scenario.settings.latestStart;start++){
    const expected=useOracle?scenario.origins.filter(origin=>oracle(scenario,start,origin)).map(origin=>origin.id):evaluateWindow(scenario,start).results.filter(result=>result.reachable).map(result=>result.originId);
    const interval=audit.ranges.find(range=>range.start<=start&&start<=range.end);
    assert.deepEqual(interval.originIds,expected,`${scenario.title} at ${start}`);
    assert.equal(interval.reachable,expected.length);
    all.push({start,reachable:expected.length,originIds:expected});
  }
  const rank=(a,b)=>b.reachable-a.reachable||Math.abs(a.start-scenario.settings.baselineStart)-Math.abs(b.start-scenario.settings.baselineStart)||a.start-b.start;
  assert.equal(audit.best.start,[...all].sort(rank)[0].start);
  assert.equal(audit.best.reachable,[...all].sort(rank)[0].reachable);
  assert.equal(audit.gridBest.start,normal.best.start);
  assert.equal(audit.gridBest.reachable,normal.best.reachable);
  assert.equal(audit.baseline.reachable,normal.baseline.reachable);
  assert.deepEqual(audit.grid.map(window=>[window.start,window.reachable]),normal.windows.map(window=>[window.start,window.reachable]));
  const maximum=Math.max(...all.map(row=>row.reachable));
  assert.deepEqual(all.filter(row=>row.reachable===maximum).map(row=>row.start),audit.bestRanges.flatMap(range=>Array.from({length:range.end-range.start+1},(_,i)=>range.start+i)));
  return audit;
}
test('a one-minute feasible opening between grid starts is found with exact boundaries',()=>{
  const audit=verify(narrow(),true);
  assert.deepEqual(audit.originRanges,[{originId:'a',intervals:[{start:11,end:11}]}]);
  assert.equal(audit.gridBest.reachable,0);assert.equal(audit.best.reachable,1);assert.equal(audit.best.start,11);
  assert.equal(audit.gridMissesHigherCoverage,true);assert.deepEqual(audit.gainedVersusGrid,['a']);
});
test('built-in sample matches every minute and finds the earliest equally good opening',()=>{
  const audit=verify(SAMPLE);assert.equal(audit.best.start,620);assert.equal(audit.gridBest.start,630);assert.equal(audit.best.reachable,5);
  assert.equal(audit.gridMissesHigherCoverage,false);assert.deepEqual(audit.lostVersusCurrent,['maple']);
});
test('onsite, zero-coverage and off-grid current ties keep exact inclusive ranges',()=>{
  const scenario=narrow();scenario.origins[0].stopId='p';scenario.origins[0].leaveAfter=5;scenario.origins[0].homeBy=9;
  scenario.settings.openMinutes=4;scenario.settings.baselineStart=6;
  let audit=verify(scenario,true);assert.deepEqual(audit.originRanges[0].intervals,[{start:3,end:7}]);assert.equal(audit.best.start,6);
  scenario.origins[0].maxAwayMinutes=1;audit=verify(scenario,true);assert.deepEqual(audit.ranges,[{start:0,end:20,reachable:0,originIds:[]}]);assert.equal(audit.best.start,6);
});
test('same-count ranges retain distinct covered origin IDs',()=>{
  const scenario=narrow();scenario.origins=[{...scenario.origins[0],id:'first',stopId:'p',leaveAfter:2,homeBy:4},{...scenario.origins[0],id:'second',stopId:'p',leaveAfter:4,homeBy:6}];
  const audit=verify(scenario,true);assert.deepEqual(audit.bestRanges.map(range=>range.originIds),[['first'],['second']]);
});
test('multiple departures union disjoint feasible ranges without swallowing gaps',()=>{
  const scenario=narrow();scenario.origins[0].maxAwayMinutes=8;
  scenario.connections.push({id:'go2',tripId:'go2',from:'a',to:'p',departure:17,arrival:18},{id:'back2',tripId:'back2',from:'p',to:'a',departure:20,arrival:22});
  const audit=verify(scenario,true);assert.deepEqual(audit.originRanges[0].intervals,[{start:11,end:11},{start:18,end:18}]);
});
test('no return and one-minute deadline failures are not counted',()=>{
  for(const mutate of [s=>s.connections.pop(),s=>s.origins[0].homeBy=15,s=>s.origins[0].maxAwayMinutes=7,s=>s.origins[0].leaveAfter=9]){const s=narrow();mutate(s);assert.equal(verify(s,true).best.reachable,0);}
});
test('same-vehicle reboarding and skipped loops use the unchanged route semantics',()=>{
  for(const source of [OUTBOUND_LOOP,RETURN_LOOP])for(const transfers of [0,1,2])for(const buffer of [0,5,16]){
    const scenario=clone(source);scenario.settings={...scenario.settings,maxTransfers:transfers,transferMinutes:buffer,earliestStart:scenario.settings.baselineStart-12,latestStart:scenario.settings.baselineStart+12,stepMinutes:7};verify(scenario,true);
  }
});
test('next-day boundaries and minute 2879 are inclusive without wraparound',()=>{
  for(const offset of [1430,2857]){const s=narrow();for(const c of s.connections){c.departure+=offset;c.arrival+=offset;}for(const key of ['leaveAfter','homeBy'])s.origins[0][key]+=offset;
    s.origins[0].homeBy=Math.min(2879,s.origins[0].homeBy);for(const key of ['baselineStart','earliestStart','latestStart'])s.settings[key]+=offset;verify(s,true);}
});
test('input and sibling result arrays are isolated',()=>{
  const scenario=narrow(),first=analyzeCoverageRanges(scenario);first.best.originIds.push('foreign');first.bestRanges[0].originIds.push('foreign');first.originRanges[0].intervals[0].start=999;
  assert.deepEqual(first.gridBest.originIds,[]);assert.deepEqual(first.ranges.find(row=>row.reachable).originIds,['a']);assert.equal(analyzeCoverageRanges(scenario).best.start,11);
});
function random(seed){let value=seed;const rand=n=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return(value>>>8)%n;};const s=narrow();s.title=`Coverage corpus ${seed}`;s.stops=['a','b','c','p'].map(id=>({id,name:id}));s.connections=Array.from({length:16},(_,i)=>{const from=rand(4);let to=rand(3);if(to>=from)to++;const departure=rand(29);return{id:`c${i}`,tripId:`t${i}`,from:s.stops[from].id,to:s.stops[to].id,departure,arrival:departure+1+rand(5)};});s.origins=s.stops.map(stop=>({id:stop.id,stopId:stop.id,label:stop.name,leaveAfter:rand(8),homeBy:22+rand(12),maxAwayMinutes:1+rand(33)}));s.settings={baselineStart:11,earliestStart:0,latestStart:25,stepMinutes:7,openMinutes:8,visitMinutes:1+rand(6),transferMinutes:rand(6),maxTransfers:rand(4)};return s;}
for(let seed=1;seed<=60;seed++)test(`all-minute exhaustive origin coverage ${seed}`,()=>verify(random(seed),true));
test('rejects invalid scenario rather than reporting a partial range',()=>{for(const mutate of [s=>s.settings.stepMinutes=0,s=>s.settings.latestStart=2879,s=>s.origins[0].stopId='unknown']){const s=narrow();mutate(s);assert.throws(()=>analyzeCoverageRanges(s));}});
test('CLI emits a bounded transparent report and rejects invalid arguments',()=>{
  const script=new URL('../scripts/coverage-ranges.mjs',import.meta.url);
  const text=execFileSync(process.execPath,[script.pathname],{encoding:'utf8'});assert.match(text,/Best integer-minute opening 10:20–12:20: 5\/7/);assert.match(text,/not continuous time/);assert.match(text,/No operator validation/);
  const result=spawnSync(process.execPath,[script.pathname,'--nope'],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/Usage:/);
});
