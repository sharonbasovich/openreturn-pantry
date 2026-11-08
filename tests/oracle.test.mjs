// Historical synthetic corpus, now using the corrected independent witness
// verifier. See evidence/ORACLE_REBOARDING_REVIEW.md for scope and provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenario, evaluateWindow, optimizeWindows } from '../src/model.mjs';
import { oracle, compare, coverage } from './support/exhaustive-oracle.mjs';

function fixture(seed) {
  let state = seed; const rand = n => { state = (Math.imul(state,1664525)+1013904223)>>>0; return (state>>>8)%n; };
  const stops = ['a','b','c','p'].map(id=>({id,name:id}));
  const base = seed%4===0 ? 1430 : 0;
  const connections = Array.from({length:14},(_,i)=>{ const from=rand(4); let to=rand(3); if(to>=from)to++; const departure=base+rand(30); return {id:`c${i}`,tripId:`t${i}`,from:stops[from].id,to:stops[to].id,departure,arrival:departure+1+rand(5)}; });
  return {version:1,title:`Synthetic exhaustive fixture ${seed}`,serviceDay:'2026-11-08',dataKind:'synthetic',stops,pantryStop:'p',origins:stops.map((st,i)=>({id:`o${i}`,stopId:st.id,label:st.name,leaveAfter:base+rand(7),homeBy:base+22+rand(17),maxAwayMinutes:3+rand(36)})),connections,settings:{baselineStart:base+11,openMinutes:8,visitMinutes:1+rand(4),earliestStart:base+5,latestStart:base+25,stepMinutes:5,transferMinutes:rand(5),maxTransfers:rand(4)}};
}
for(let seed=1;seed<=240;seed++) test(`independent exhaustive schedule ${seed}`,()=>compare(fixture(seed)));

// Carefully constructed alternatives exercise cases sparse random schedules may miss.
function crafted() {
  const s=fixture(1); s.connections=[]; s.origins=[{id:'a',stopId:'a',label:'A',leaveAfter:0,homeBy:60,maxAwayMinutes:30}];
  s.settings={baselineStart:20,openMinutes:20,visitMinutes:5,earliestStart:10,latestStart:30,stepMinutes:5,transferMinutes:5,maxTransfers:1};
  return s;
}
function c(id,from,to,departure,arrival,tripId=id){return {id,tripId,from,to,departure,arrival};}
test('later outward departure avoids max-away failure',()=>{const s=crafted(); s.connections=[c('early','a','p',1,5),c('later','a','p',20,24),c('back','p','a',30,35)];compare(s);});
test('same vehicle continuation and new-vehicle buffer',()=>{const s=crafted(); s.connections=[c('one','a','b',10,15,'through'),c('two','b','p',15,20,'through'),c('back','p','a',30,35)]; s.settings.maxTransfers=0;compare(s);s.connections[1].tripId='changed';compare(s);});
test('transfer limit resets after pantry visit',()=>{const s=crafted();s.connections=[c('ab','a','b',5,10),c('bp','b','p',15,20),c('pc','p','c',30,35),c('ca','c','a',40,45)];s.origins[0].maxAwayMinutes=40;compare(s);});
test('exact close, away and home deadlines, then one-minute failures',()=>{const s=crafted();s.settings={...s.settings,earliestStart:20,latestStart:20,baselineStart:20,openMinutes:5};s.connections=[c('go','a','p',15,20),c('back','p','a',25,30)];s.origins[0].homeBy=30;s.origins[0].maxAwayMinutes=15;compare(s);s.origins[0].homeBy=29;compare(s);s.origins[0].homeBy=30;s.origins[0].maxAwayMinutes=14;compare(s);});
test('no return and disconnected origin',()=>{const s=crafted();s.connections=[c('go','a','p',10,20)];compare(s);s.connections=[c('unrelated','b','c',10,20)];compare(s);});

test('reject malformed or contradictory schedules safely',()=>{
  const cases = [
    s=>s.stops.push({...s.stops[0]}),
    s=>s.origins.push({...s.origins[0]}),
    s=>s.connections.push({...s.connections[0]}),
    s=>s.connections[0].arrival=s.connections[0].departure,
    s=>s.connections[0].departure=-1,
    s=>s.connections[0].arrival=2880,
    s=>s.connections[0].from='missing',
    s=>s.settings.maxTransfers=4,
    s=>s.settings.stepMinutes=0,
    s=>s.settings.visitMinutes=s.settings.openMinutes+1,
    s=>s.settings.baselineStart=s.settings.latestStart+1,
    s=>s.settings.latestStart=2879,
    s=>s.serviceDay='2026-02-30',
    s=>s.origins[0].leaveAfter=s.origins[0].homeBy+1,
    s=>s.connections=[c('one','a','b',1,5,'same'),c('two','c','p',6,9,'same')],
    s=>s.connections=[c('one','a','b',1,5,'same'),c('two','b','p',4,9,'same')],
  ];
  for(const mutate of cases){const s=fixture(7);mutate(s);assert.throws(()=>validateScenario(s));assert.throws(()=>evaluateWindow(s,11));assert.throws(()=>optimizeWindows(s));}
  for(const value of [null,[],{},'text',42]) assert.throws(()=>validateScenario(value));
});
test('all result arrays and gained/lost agree with independently checked origins',()=>{
  for(let seed=1;seed<=30;seed++){
    const s=fixture(seed), opt=compare(s);
    const before=s.origins.filter(o=>oracle(s,s.settings.baselineStart,o)).map(o=>o.id);
    const after=s.origins.filter(o=>oracle(s,opt.best.start,o)).map(o=>o.id);
    assert.deepEqual(opt.gained,after.filter(id=>!before.includes(id)));
    assert.deepEqual(opt.lost,before.filter(id=>!after.includes(id)));
  }
});

for(let seed=1;seed<=80;seed++) test(`independent shared-vehicle schedule ${seed}`,()=>{
  const s=fixture(seed);s.connections=[];
  const stopIds=s.stops.map(x=>x.id), offset=seed%4===0?1430:0;
  let n=seed;const rand=k=>{n=(Math.imul(n,1103515245)+12345)>>>0;return(n>>>10)%k;};
  for(let trip=0;trip<4;trip++){
    let from=rand(4),time=offset+rand(12);
    for(let leg=0;leg<3;leg++){
      let to=rand(3);if(to>=from)to++;
      const depart=time+rand(4),arrival=depart+1+rand(5);
      s.connections.push(c(`trip${trip}-leg${leg}`,stopIds[from],stopIds[to],depart,arrival,`trip${trip}`));
      from=to;time=arrival;
    }
  }
  const opt=compare(s);
  assert.deepEqual(opt,optimizeWindows({...s,connections:[...s.connections].reverse()}),'input ordering must not change result');
});
test('oracle coverage includes nontrivial reachable and unreachable transit',()=>{
  assert.ok(coverage.reachableTransit>100);assert.ok(coverage.unreachable>100);
  console.log('Independent oracle coverage:',JSON.stringify(coverage));
});
