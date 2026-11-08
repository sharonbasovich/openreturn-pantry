import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE } from '../src/sample.mjs';
import * as current from '../src/model.mjs';
import * as baseline from '../evidence/routing-cache/baseline-model.mjs';

const clone = value => structuredClone(value);
const same = scenario => {
  const before = clone(scenario);
  assert.deepEqual(current.optimizeWindows(scenario), baseline.optimizeWindows(scenario));
  assert.deepEqual(scenario, before, 'caller input remains unchanged');
};

test('routing cache keeps all duplicate origin identities and complete witnesses', () => {
  const scenario = clone(SAMPLE);
  scenario.origins = Array.from({length:24}, (_,i) => ({...scenario.origins[i%3], id:`copy-${i}`, label:`Copy ${i}`}));
  same(scenario);
  const result = current.optimizeWindows(scenario);
  assert.deepEqual(result.best.results.map(r => r.originId), scenario.origins.map(o => o.id));
  assert.equal(result.best.total, 24);
});

test('same-stop origins keep separate leave, home and away constraints', () => {
  for (const source of SAMPLE.origins) {
    const scenario = clone(SAMPLE);
    scenario.origins = [
      {...source, id:'same'},
      {...source, id:'leave', leaveAfter:Math.min(source.homeBy, source.leaveAfter+33)},
      {...source, id:'home', homeBy:Math.max(source.leaveAfter, source.homeBy-47)},
      {...source, id:'away', maxAwayMinutes:Math.max(1, source.maxAwayMinutes-29)},
      {...source, id:'both', homeBy:Math.max(source.leaveAfter, source.homeBy-37), maxAwayMinutes:Math.max(1,source.maxAwayMinutes-41)},
      {...source, id:'label', label:'Different label only'}
    ];
    same(scenario);
    scenario.origins.reverse();
    same(scenario);
  }
});

test('tuple keys preserve quotes, separators, controls and Unicode in IDs', () => {
  const scenario = clone(SAMPLE);
  const names = ['a,1,2,3', 'a\"],[1,2', 'a|1|2|3', 'a\n1\t2', 'a\u0000x', '雪😀', 'p,0,1'];
  const ids = new Map(scenario.stops.map((s,i) => [s.id, names[i]??`stop-${i}`]));
  scenario.stops.forEach(s => {s.id=ids.get(s.id);});
  scenario.pantryStop=ids.get(scenario.pantryStop);
  scenario.origins.forEach(o => {o.stopId=ids.get(o.stopId);});
  scenario.connections.forEach(c => {c.from=ids.get(c.from);c.to=ids.get(c.to);});
  same(scenario);
});

test('on-site origins, infeasible origins and off-grid baseline stay identical', () => {
  const scenario = clone(SAMPLE);
  scenario.origins.push(
    {id:'onsite',label:'At pantry',stopId:scenario.pantryStop,leaveAfter:600,homeBy:800,maxAwayMinutes:15},
    {id:'onsite-short',label:'Too little time',stopId:scenario.pantryStop,leaveAfter:600,homeBy:800,maxAwayMinutes:14}
  );
  scenario.settings.baselineStart += 1;
  same(scenario);
  for (const start of [scenario.settings.earliestStart, scenario.settings.baselineStart, scenario.settings.latestStart])
    assert.deepEqual(current.evaluateWindow(scenario,start),baseline.evaluateWindow(scenario,start));
});

test('new invocations cannot reuse routes after input or result mutation', () => {
  const scenario = clone(SAMPLE), initial=current.optimizeWindows(scenario);
  initial.best.results.find(r=>r.journey).journey.return[0].arrival=2800;
  same(scenario);
  scenario.settings.transferMinutes=10; same(scenario);
  scenario.settings.maxTransfers=0; same(scenario);
  scenario.connections[0].arrival += 1; same(scenario);
  scenario.origins[0].maxAwayMinutes=1; same(scenario);
});

test('equivalent origins do not share mutable journey path arrays', () => {
  const scenario = clone(SAMPLE);
  scenario.origins=[{...SAMPLE.origins[0],id:'a'},{...SAMPLE.origins[0],id:'b'}];
  const result=current.optimizeWindows(scenario), [a,b]=result.best.results;
  assert(a.journey && b.journey);
  assert.notEqual(a.journey.outbound,b.journey.outbound);
  assert.notEqual(a.journey.return,b.journey.return);
  const before=clone(b);
  a.journey.outbound.pop();a.journey.return.push({id:'caller-added'});
  assert.deepEqual(b,before);
  same(scenario);
});

test('seeded synthetic networks preserve full output and conservative diagnostics', () => {
  let state=0x1478acd;
  const rng=n => {state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
  for(let seed=0;seed<80;seed++) {
    const stops=Array.from({length:5},(_,i)=>({id:`s${i}`,name:`Stop ${i}`}));
    const origins=Array.from({length:24},(_,i)=>{
      const base=i<12?{stopId:'s0',leaveAfter:0,homeBy:240,maxAwayMinutes:180}:
        {stopId:`s${rng(5)}`,leaveAfter:rng(40),homeBy:180+rng(61),maxAwayMinutes:20+rng(200)};
      return {id:`o-${i}`,label:`Origin ${i}`,...base};
    });
    const connections=Array.from({length:45},(_,i)=>{
      const from=rng(5),to=(from+1+rng(4))%5, departure=rng(210);
      return {id:`c${i}`,tripId:`t${i}`,from:`s${from}`,to:`s${to}`,departure,arrival:departure+1+rng(20)};
    });
    same({version:1,title:`Seed ${seed}`,serviceDay:'2026-11-09',dataKind:'synthetic',stops,pantryStop:'s4',origins,connections,
      settings:{baselineStart:41,earliestStart:20,latestStart:160,stepMinutes:20,openMinutes:60,visitMinutes:1+rng(30),transferMinutes:rng(11),maxTransfers:rng(4)}});
  }
});
