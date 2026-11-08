// This oracle was written before inspecting src/model.mjs. It enumerates chronological
// connection sequences and every integer pickup minute; it does not use label-setting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenario, evaluateWindow, optimizeWindows } from '../src/model.mjs';

function paths(s, from, to, ready, cap, prefix = [], changes = 0) {
  if (from === to) return [prefix];
  const prior = prefix.at(-1), found = [];
  for (const c of s.connections) {
    if (c.from !== from || prefix.some(x => x.id === c.id)) continue;
    const changed = prior && prior.tripId !== c.tripId;
    if (c.departure < ready + (changed ? s.settings.transferMinutes : 0)) continue;
    const nextChanges = changes + (changed ? 1 : 0);
    if (nextChanges > cap) continue;
    found.push(...paths(s, c.to, to, c.arrival, cap, [...prefix, c], nextChanges));
  }
  return found;
}
function oracle(s, start, origin) {
  const { openMinutes, visitMinutes, maxTransfers } = s.settings;
  if (origin.stopId === s.pantryStop) {
    const pickupStart = Math.max(start, origin.leaveAfter);
    return pickupStart + visitMinutes <= Math.min(start + openMinutes, origin.homeBy) && visitMinutes <= origin.maxAwayMinutes ? { away: visitMinutes, home: pickupStart + visitMinutes } : null;
  }
  const choices = [];
  for (const outbound of paths(s, origin.stopId, s.pantryStop, origin.leaveAfter, maxTransfers)) {
    for (let pickupStart = Math.max(start, outbound.at(-1).arrival); pickupStart + visitMinutes <= start + openMinutes; pickupStart++) {
      const end = pickupStart + visitMinutes;
      for (const back of paths(s, s.pantryStop, origin.stopId, end, maxTransfers)) {
        const home = back.at(-1).arrival, away = home - outbound[0].departure;
        if (home <= origin.homeBy && away <= origin.maxAwayMinutes) choices.push({away, home});
      }
    }
  }
  return choices.sort((a,b) => a.away-b.away || a.home-b.home)[0] ?? null;
}
// Derive failure stages from all enumerated paths, independently of retained labels.
function oracleFailure(s,start,o) {
  if(o.stopId===s.pantryStop) return 'The pickup cannot fit the opening window, availability and maximum time away.';
  const outward=paths(s,o.stopId,s.pantryStop,o.leaveAfter,s.settings.maxTransfers)
    .filter(p=>p.at(-1).arrival<=o.homeBy && p.at(-1).arrival-p[0].departure<=o.maxAwayMinutes);
  if(!outward.length) return 'No outbound journey reaches the pantry within the supplied availability, maximum time away and transfer limit.';
  const pickups=[];
  for(const p of outward) {
    for(let t=Math.max(start,p.at(-1).arrival);t+s.settings.visitMinutes<=start+s.settings.openMinutes;t++) {
      const end=t+s.settings.visitMinutes;
      if(end<=o.homeBy && end-p[0].departure<=o.maxAwayMinutes) pickups.push(end);
    }
  }
  if(!pickups.length) return 'Outbound travel exists, but no pickup fits both the opening window and the supplied time limits.';
  const returns=pickups.flatMap(t=>paths(s,s.pantryStop,o.stopId,t,s.settings.maxTransfers)).filter(p=>p.at(-1).arrival<=o.homeBy);
  if(!returns.length) return 'Pickup fits, but no scheduled return reaches the origin by its home deadline within the transfer limit.';
  return 'Scheduled returns exist, but none completes a round trip within the maximum time away.';
}
function verifyWitness(s, start, origin, row, expected) {
  assert.equal(row.reachable, !!expected, `origin ${origin.id}, start ${start}`);
  if (!expected) { assert.equal(row.journey, null); assert.equal(row.reason,oracleFailure(s,start,origin)); return; }
  const j = row.journey;
  assert.ok(j);
  function verifyLeg(legs, from, to, ready) {
    let at = from, time = ready, prior = null, changes = 0;
    for (const c of legs) {
      assert.deepEqual(c, s.connections.find(x => x.id === c.id));
      assert.equal(c.from, at);
      const changed = prior !== null && prior.tripId !== c.tripId;
      changes += changed ? 1 : 0;
      assert.ok(c.departure >= time + (changed ? s.settings.transferMinutes : 0));
      assert.ok(c.arrival > c.departure);
      at = c.to; time = c.arrival; prior = c;
    }
    assert.equal(at, to);
    assert.ok(changes <= s.settings.maxTransfers);
    return time;
  }
  const outwardArrival = verifyLeg(j.outbound, origin.stopId, s.pantryStop, origin.leaveAfter);
  assert.ok(j.pickupStart >= Math.max(start, outwardArrival));
  assert.equal(j.pickupEnd-j.pickupStart, s.settings.visitMinutes);
  assert.ok(j.pickupEnd <= start+s.settings.openMinutes);
  const home = verifyLeg(j.return, s.pantryStop, origin.stopId, j.pickupEnd);
  assert.equal(j.depart, j.outbound[0]?.departure ?? j.pickupStart);
  assert.equal(j.arrive, home);
  assert.ok(j.depart >= origin.leaveAfter && home <= origin.homeBy);
  assert.equal(j.awayMinutes, home-j.depart);
  assert.ok(j.awayMinutes <= origin.maxAwayMinutes);
  assert.equal(j.awayMinutes, expected.away, 'must minimize away time');
  assert.equal(j.arrive, expected.home, 'equal-away tie must return earlier');
  const travel = [...j.outbound,...j.return].reduce((n,c)=>n+c.arrival-c.departure,0);
  assert.equal(j.waitMinutes, j.awayMinutes-travel-s.settings.visitMinutes);
}
const coverage = { windows: 0, origins: 0, reachableTransit: 0, unreachable: 0 };
function compare(s) {
  validateScenario(s);
  const expectedWindows = [];
  const check = start => {
    const actual = evaluateWindow(s,start); coverage.windows++;
    assert.equal(actual.start,start); assert.equal(actual.end,start+s.settings.openMinutes);
    assert.equal(actual.total,s.origins.length); assert.equal(actual.results.length,s.origins.length);
    let count = 0;
    for (const o of s.origins) {
      const expected = oracle(s,start,o); count += expected ? 1 : 0;
      coverage.origins++; if(expected && o.stopId!==s.pantryStop)coverage.reachableTransit++; if(!expected)coverage.unreachable++;
      const rows = actual.results.filter(x=>x.originId===o.id); assert.equal(rows.length,1);
      verifyWitness(s,start,o,rows[0],expected);
    }
    assert.equal(actual.reachable,count); return actual;
  };
  for(let t=s.settings.earliestStart;t<=s.settings.latestStart;t+=s.settings.stepMinutes) expectedWindows.push(check(t));
  const baseline = check(s.settings.baselineStart);
  const opt = optimizeWindows(s);
  const best = [...expectedWindows].sort((a,b)=>b.reachable-a.reachable || Math.abs(a.start-baseline.start)-Math.abs(b.start-baseline.start) || a.start-b.start)[0];
  assert.equal(opt.best.start,best.start); assert.equal(opt.best.reachable,best.reachable);
  assert.equal(opt.baseline.start,baseline.start); assert.equal(opt.baseline.reachable,baseline.reachable);
  assert.deepEqual(opt.windows.map(w=>w.start),expectedWindows.map(w=>w.start));
  return opt;
}
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
