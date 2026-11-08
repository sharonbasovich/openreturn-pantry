import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWindow } from '../src/model.mjs';
import { paths, oracle, verifyWitness, compare, coverage, continuesOnBoard } from './support/exhaustive-oracle.mjs';

// Literal synthetic vehicle: h -> x -> z -> x -> p, followed by a bus home.
// At x one may ride the loop or alight and later reboard, but reboarding is a
// transfer even though the same vehicle returns. No production helper supplies
// the expected leg IDs, riding time, or waiting totals below.
function loop({ buffer = 5, cap = 1, offset = 0 } = {}) {
  const legs = [['hx','h','x',0,2,'loop'],['xz','x','z',3,5,'loop'],
    ['zx','z','x',6,8,'loop'],['xp','x','p',10,12,'loop'],['ph','p','h',15,17,'return']];
  return {version:1,title:'Synthetic reboarding oracle',serviceDay:'2026-11-08',dataKind:'synthetic',
    stops:['h','x','z','p'].map(id=>({id,name:id})),pantryStop:'p',
    origins:[{id:'origin',stopId:'h',label:'Origin',leaveAfter:offset,homeBy:offset+20,maxAwayMinutes:20}],
    connections:legs.map(([id,from,to,departure,arrival,tripId])=>({id,from,to,departure:departure+offset,arrival:arrival+offset,tripId})),
    settings:{baselineStart:12+offset,earliestStart:12+offset,latestStart:12+offset,stepMinutes:1,
      openMinutes:3,visitMinutes:2,transferMinutes:buffer,maxTransfers:cap}};
}
const ids = path => path.map(c=>c.id);
const check = s => {const row=evaluateWindow(s,s.settings.baselineStart).results[0];
  verifyWitness(s,s.settings.baselineStart,s.origins[0],row,oracle(s,s.settings.baselineStart,s.origins[0]));return row.journey;};
function shortcutRow(s) {
  const legs = Object.fromEntries(s.connections.map(c=>[c.id,c]));
  return {originId:'origin',reachable:true,reason:'Fabricated invalid witness for a negative control',
    journey:{outbound:[legs.hx,legs.xp],pickupStart:s.settings.baselineStart,pickupEnd:s.settings.baselineStart+2,
      return:[legs.ph],depart:legs.hx.departure,arrive:legs.ph.arrival,awayMinutes:17,waitMinutes:9}};
}

for (const [buffer,cap,expected,wait] of [[0,0,['hx','xz','zx','xp'],5],
  [5,0,['hx','xz','zx','xp'],5],[9,1,['hx','xz','zx','xp'],5],
  [8,1,['hx','xp'],9],[5,1,['hx','xp'],9]]) {
  test(`literal loop buffer ${buffer}, cap ${cap}: valid exact witness`,()=>{
    const s=loop({buffer,cap}),j=check(s);
    assert.deepEqual(ids(j.outbound),expected);assert.deepEqual(ids(j.return),['ph']);
    assert.equal(j.waitMinutes,wait);assert.equal(j.awayMinutes,17);assert.equal(j.arrive,17);
    const choices=paths(s,'h','p',0,cap).map(ids);
    assert.equal(choices.some(p=>p.join(',')==='hx,xp'),cap>=1&&buffer<=8);
    compare(s);
  });
}
for(const [name,buffer,cap] of [['missing transfer allowance',0,0],['insufficient buffer',9,1]]) {
  test(`oracle must reject fabricated shortcut with ${name}`,()=>{
    const s=loop({buffer,cap}), row=shortcutRow(s), expected=oracle(s,12,s.origins[0]);
    // Scalar feasibility/away/home still match. Only the witness contract detects
    // this defect, so this is intentionally not merely another result comparison.
    assert.deepEqual(expected,{away:17,home:17});
    assert.throws(()=>verifyWitness(s,12,s.origins[0],row,expected),assert.AssertionError);
  });
}
test('full timetable determines adjacency, including omitted intervening legs and shuffled input',()=>{
  const s=loop(),[hx,xz,zx,xp]=s.connections;
  assert.equal(continuesOnBoard(s,hx,xz),true);assert.equal(continuesOnBoard(s,zx,xp),true);
  assert.equal(continuesOnBoard(s,hx,xp),false);assert.equal(continuesOnBoard(s,hx,hx),false);
  s.connections.reverse();assert.equal(continuesOnBoard(s,hx,xz),true);assert.equal(continuesOnBoard(s,hx,xp),false);
  compare(s);
});
test('return loop resets vehicle state at pickup but requires reboarding allowance within return',()=>{
  const s=loop({cap:0});
  s.connections=s.connections.map(c=>({...c,from:c.from==='h'?'p':c.from==='p'?'h':c.from,
    to:c.to==='h'?'p':c.to==='p'?'h':c.to,departure:c.departure+10,arrival:c.arrival+10}));
  s.connections=s.connections.filter(c=>c.id!=='ph');
  s.connections.unshift({id:'out',tripId:'separate',from:'h',to:'p',departure:0,arrival:2});
  s.settings={...s.settings,baselineStart:3,earliestStart:3,latestStart:3};
  s.origins[0].homeBy=25;s.origins[0].maxAwayMinutes=25;
  const j=check(s);assert.deepEqual(ids(j.return),['hx','xz','zx','xp']);assert.equal(j.waitMinutes,10);
  s.settings.maxTransfers=1;const k=check(s);assert.deepEqual(ids(k.return),['hx','xp']);assert.equal(k.waitMinutes,14);
  compare(s);
});

test('pickup resets first boarding for adjacent legs of the same vehicle with a 99-minute transfer buffer',()=>{
  const s=loop({buffer:99,cap:0});
  s.connections=[{id:'go',tripId:'through',from:'h',to:'p',departure:0,arrival:2},
    {id:'back',tripId:'through',from:'p',to:'h',departure:3,arrival:5}];
  s.settings={...s.settings,baselineStart:2,earliestStart:2,latestStart:2,openMinutes:1,visitMinutes:1};
  const j=check(s);assert.deepEqual(ids(j.outbound),['go']);assert.deepEqual(ids(j.return),['back']);
  assert.equal(j.pickupEnd,3);assert.equal(j.waitMinutes,0);assert.equal(j.awayMinutes,5);
});

function generated(seed) {
  let state=seed;const rand=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return(state>>>5)%n;};
  const s=loop({offset:seed%5===0?1430:0}),base=seed%5===0?1430:0;
  s.settings={...s.settings,baselineStart:base+13,earliestStart:base+8,latestStart:base+20,stepMinutes:6,
    openMinutes:7,visitMinutes:1+rand(3),transferMinutes:rand(9),maxTransfers:rand(4)};
  s.connections=[];const stopIds=['h','x','z','p'];
  // Two independent continuous five-leg runs permit repeated stops and skipped
  // same-vehicle segments. Durations stay positive, guaranteeing finite paths.
  for(let t=0;t<2;t++) {let at=rand(4),time=base+rand(4);
    for(let k=0;k<5;k++){let next=rand(3);if(next>=at)next++;
      const departure=time+rand(3),arrival=departure+1+rand(3);
      s.connections.push({id:`t${t}c${k}`,tripId:`t${t}`,from:stopIds[at],to:stopIds[next],departure,arrival});at=next;time=arrival;}}
  // A separate late return boosts meaningful transit coverage without forcing
  // all scenarios feasible. An on-site origin exercises zero-leg visits.
  s.connections.push({id:'late',tripId:'late',from:'p',to:'h',departure:base+25,arrival:base+28});
  s.origins=stopIds.map((stopId,i)=>({id:`o${i}`,stopId,label:stopId,leaveAfter:base+rand(5),homeBy:base+24+rand(8),maxAwayMinutes:8+rand(24)}));
  return s;
}
for(let seed=1;seed<=120;seed++)test(`exhaustive looping schedule ${seed}`,()=>{
  const s=generated(seed),r=compare(s);
  const reversed={...s,connections:[...s.connections].reverse()};
  assert.deepEqual(r,compare(reversed),'input ordering must preserve all witnesses and diagnostics');
  if(seed===120){assert.ok(coverage.windows>900);assert.ok(coverage.origins>3500);
    console.log('Looping oracle coverage:',JSON.stringify(coverage));}
});
