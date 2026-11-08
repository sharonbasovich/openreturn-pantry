import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenario, evaluateWindow, optimizeWindows, formatTime } from '../src/model.mjs';
function fixture() {
  return {version:1,title:'Synthetic test',serviceDay:'2026-11-08',dataKind:'synthetic',stops:[{id:'A',name:'Home'},{id:'X',name:'Transfer'},{id:'P',name:'Pantry'}],pantryStop:'P',origins:[{id:'a',stopId:'A',label:'A household',leaveAfter:0,homeBy:300,maxAwayMinutes:300}],connections:[{id:'out',tripId:'out',from:'A',to:'P',departure:90,arrival:100},{id:'back',tripId:'back',from:'P',to:'A',departure:120,arrival:130}],settings:{baselineStart:100,openMinutes:20,visitMinutes:10,earliestStart:80,latestStart:120,stepMinutes:10,transferMinutes:5,maxTransfers:1}};
}
const leg=(id,from,to,departure,arrival,tripId=id)=>({id,tripId,from,to,departure,arrival});
const result=(s,start=100)=>evaluateWindow(s,start).results[0];
test('complete round trip and wait accounting',()=>{
 const r=result(fixture()); assert.equal(r.reachable,true); assert.deepEqual([r.journey.depart,r.journey.pickupStart,r.journey.pickupEnd,r.journey.arrive,r.journey.awayMinutes,r.journey.waitMinutes],[90,100,110,130,40,10]);
});
test('pickup must fit close, equality allowed',()=>{
 const s=fixture(); assert.equal(result(s,90).reachable,true); assert.equal(result(s,89).reachable,false);
});
test('waiting for opening is part of time away',()=>{
 const s=fixture(); s.connections[1].departure=140; s.connections[1].arrival=150;
 const j=result(s,120).journey; assert.equal(j.pickupStart,120); assert.equal(j.waitMinutes,30);
});
test('one-way travel never counts',()=>{const s=fixture();s.connections.pop();assert.equal(result(s).reachable,false);});
test('availability and total away constraints include all waits',()=>{
 for(const change of [s=>s.origins[0].leaveAfter=91,s=>s.origins[0].homeBy=129,s=>s.origins[0].maxAwayMinutes=39]) {const s=fixture();change(s);assert.equal(result(s).reachable,false);}
 const s=fixture();s.origins[0].maxAwayMinutes=40;assert.equal(result(s).reachable,true);
});
test('later outbound departure can rescue maximum away',()=>{
 const s=fixture();s.origins[0].maxAwayMinutes=40;
 s.connections=[leg('early','A','P',20,30),leg('late','A','P',90,105),leg('back','P','A',120,130)];
 assert.equal(result(s).journey.outbound[0].id,'late');
});
test('missed transfer buffer blocks different vehicles',()=>{
 const s=fixture();s.connections=[leg('a','A','X',80,90),leg('b','X','P',94,100),s.connections[1]];
 assert.equal(result(s).reachable,false);s.connections[1].departure=95;assert.equal(result(s).reachable,true);
});
test('same vehicle continuity needs neither buffer nor transfer',()=>{
 const s=fixture();s.settings.maxTransfers=0;s.connections=[leg('a','A','X',80,90,'bus'),leg('b','X','P',90,100,'bus'),s.connections[1]];
 assert.equal(result(s).reachable,true);s.connections[1].tripId='other';assert.equal(result(s).reachable,false);
});
test('earlier arrival on a different vehicle does not dominate same-vehicle continuation',()=>{
 const s=fixture();s.settings.maxTransfers=0;s.connections=[leg('fast','A','X',80,85),leg('a','A','X',80,90,'bus'),leg('b','X','P',90,100,'bus'),s.connections[1]];
 assert.equal(result(s).journey.outbound[0].id,'a');
});
test('transfer cap is applied separately to both travel directions',()=>{
 const s=fixture();s.connections=[leg('a','A','X',80,90),leg('b','X','P',95,100),leg('c','P','X',110,120),leg('d','X','A',125,135)];
 assert.equal(result(s).reachable,true);s.settings.maxTransfers=0;assert.equal(result(s).reachable,false);
});
test('return respects pickup duration and does not inherit onboard state',()=>{
 const s=fixture();s.connections=[leg('out','A','P',90,100,'loop'),leg('back','P','A',105,115,'loop')];assert.equal(result(s).reachable,false);
});
test('next day times remain service-day minutes',()=>{
 const s=fixture(); for(const c of s.connections){c.departure+=1440;c.arrival+=1440;}s.origins[0].homeBy+=1440;
 for(const k of ['baselineStart','earliestStart','latestStart'])s.settings[k]+=1440;
 assert.equal(result(s,1540).journey.arrive,1570);assert.equal(formatTime(1570),'02:10 +1d');assert.equal(formatTime(0),'00:00');assert.equal(formatTime(2879),'23:59 +1d');assert.throws(()=>formatTime(2880));
});
test('pantry origins have zero travel and bounded occupancy',()=>{
 const s=fixture();s.origins[0].stopId='P';s.origins[0].leaveAfter=105;
 assert.deepEqual(result(s).journey,{outbound:[],pickupStart:105,pickupEnd:115,return:[],depart:105,arrive:115,awayMinutes:10,waitMinutes:0});
 s.origins[0].maxAwayMinutes=9;assert.equal(result(s).reachable,false);
});
test('exact permitted grid and off-grid baseline ties',()=>{
 const s=fixture();s.connections.pop();s.settings.baselineStart=95;
 const r=optimizeWindows(s);assert.deepEqual(r.windows.map(w=>w.start),[80,90,100,110,120]);assert.equal(r.baseline.start,95);assert.equal(r.best.start,90);
});
test('counts gained and lost origin IDs, not merely net gain',()=>{
 const s=fixture();s.origins.push({...s.origins[0],id:'b',stopId:'X',label:'B',homeBy:105});
 s.connections.push(leg('xb','X','P',70,80),leg('bx','P','X',100,105));s.settings.baselineStart=80;
 const r=optimizeWindows(s);assert.equal(r.best.start,90);assert.deepEqual(r.gained,['a']);assert.deepEqual(r.lost,[]);
 s.origins[1].homeBy=95;s.connections.at(-1).departure=90;s.connections.at(-1).arrival=95;
 // Equal total coverage keeps the baseline; no misleading net improvement.
 const tied=optimizeWindows(s);assert.equal(tied.best.start,80);assert.deepEqual(tied.gained,[]);assert.deepEqual(tied.lost,[]);
});
test('deterministic IDs and immutable normalized input',()=>{
 const s=fixture();s.connections.push({...s.connections[0],id:'aaa',tripId:'aaa'});s.extra={bad:true};s.settings.extra=99;
 const before=JSON.stringify(s),norm=validateScenario(s);assert.equal(norm.extra,undefined);assert.equal(norm.settings.extra,undefined);
 assert.equal(result(s).journey.outbound[0].id,'aaa');s.connections.reverse();assert.equal(result(s).journey.outbound[0].id,'aaa');s.connections.reverse();
 optimizeWindows(s);assert.equal(JSON.stringify(s),before);norm.stops[0].name='changed';assert.equal(s.stops[0].name,'Home');
});
test('invalid dates, identities, times and disconnected vehicle chains rejected',()=>{
 const changes=[s=>s.serviceDay='2026-02-30',s=>s.version=2,s=>s.dataKind='real',s=>s.stops[1].id='A',s=>s.origins.push({...s.origins[0]}),s=>s.connections.push({...s.connections[0]}),s=>s.pantryStop='unknown',s=>s.connections[0].arrival=90,s=>s.connections[0].departure=1.5,s=>s.connections[0].from='unknown',s=>s.settings.maxTransfers=4,s=>s.settings.stepMinutes=0,s=>s.settings.visitMinutes=21,s=>s.settings.baselineStart=0,s=>s.connections.push(leg('bad','X','A',150,160,'out')),s=>s.connections.push(leg('bad','P','X',95,110,'out'))];
 for(const change of changes){const s=fixture();change(s);assert.throws(()=>validateScenario(s));}
});
test('limits reject oversized input and out-of-range evaluation',()=>{
 for(const [key,n] of [['stops',65],['origins',25],['connections',1201]]) {const s=fixture();s[key]=Array.from({length:n},(_,i)=>({...s[key][0],id:String(i)}));assert.throws(()=>validateScenario(s),new RegExp(key));}
 const s=fixture();s.settings.earliestStart=0;s.settings.latestStart=48;s.settings.baselineStart=0;s.settings.stepMinutes=1;assert.throws(()=>validateScenario(s),/48/);s.settings.latestStart=47;assert.equal(optimizeWindows(s).windows.length,48);
 assert.throws(()=>evaluateWindow(fixture(),79));assert.throws(()=>evaluateWindow(fixture(),100.5));
});
test('reports displacement even when total coverage improves',()=>{
 const s=fixture();s.origins=[{...s.origins[0],id:'old',stopId:'X'},{...s.origins[0],id:'new1'},{...s.origins[0],id:'new2'}];
 s.connections.push(leg('old-out','X','P',70,80),leg('old-back','P','X',90,95));s.settings.baselineStart=80;
 const r=optimizeWindows(s);assert.equal(r.best.start,90);assert.deepEqual(r.gained,['new1','new2']);assert.deepEqual(r.lost,['old']);
});
// Independent exhaustive route enumeration, intentionally without the engine's
// event-label dominance logic. Tiny deterministic schedules make this bounded.
function brute(s,start) {
 const o=s.origins[0],p=s.pantryStop,k=s.settings;
 const prev=new Map(),last=new Map();
 for(const c of [...s.connections].sort((a,b)=>a.departure-b.departure)){prev.set(c.id,last.get(c.tripId)?.id);last.set(c.tripId,c);}
 function paths(from,to,ready) {
  const found=[];
  function walk(stop,time,path,transfers) {
   if(path.length && stop===to) found.push(path);
   for(const c of s.connections) {
    if(c.from!==stop || c.departure<time || c.arrival>o.homeBy)continue;
    const previous=path.at(-1),same=previous && prev.get(c.id)===previous.id;
    const used=transfers+(previous&&!same?1:0);
    if(used>k.maxTransfers || (previous&&!same&&c.departure<time+k.transferMinutes))continue;
    walk(c.to,c.arrival,[...path,c],used);
   }
  }
  walk(from,ready,[],0);return found;
 }
 let minAway=Infinity;
 for(const outward of paths(o.stopId,p,o.leaveAfter)) {
  const depart=outward[0].departure,pickupEnd=Math.max(start,outward.at(-1).arrival)+k.visitMinutes;
  if(pickupEnd>start+k.openMinutes)continue;
  for(const back of paths(p,o.stopId,pickupEnd)) {
   const away=back.at(-1).arrival-depart;
   if(away<=o.maxAwayMinutes)minAway=Math.min(minAway,away);
  }
 }
 return minAway;
}
test('500 seeded tiny timetables match exhaustive round-trip enumeration',()=>{
 let seed=20261108;
 const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let sample=0;sample<500;sample++) {
  const s=fixture();s.origins[0].leaveAfter=rand(10);s.origins[0].homeBy=60;s.origins[0].maxAwayMinutes=10+rand(50);
  s.settings={baselineStart:25,openMinutes:20,visitMinutes:1+rand(10),earliestStart:20,latestStart:30,stepMinutes:5,transferMinutes:rand(6),maxTransfers:rand(4)};
  const stops=['A','X','P'];s.connections=[];
  for(let i=0;i<9;i++){const from=rand(3),to=(from+1+rand(2))%3,dep=rand(55);s.connections.push(leg(`c${i}`,stops[from],stops[to],dep,dep+1+rand(5)));}
  // Sometimes add a vehicle continuation that leaves no transfer buffer.
  if(sample%2===0){s.connections.push(leg('chain1','A','X',10,15,'chain'),leg('chain2','X','P',15,20,'chain'));}
  for(const start of [20,25,30]) {
   const expected=brute(s,start),actual=evaluateWindow(s,start).results[0];
   assert.equal(actual.reachable,Number.isFinite(expected),`sample ${sample}, start ${start}`);
   if(actual.reachable){assert.equal(actual.journey.awayMinutes,expected,`optimal away sample ${sample}`);assert.ok(actual.journey.waitMinutes>=0);}
  }
 }
});

test('earliest outward retention precedes shortlex complete-journey ties',()=>{
 const s=fixture();s.connections=[leg('direct','A','P',90,100),leg('chain1','A','X',90,92,'chain'),leg('chain2','X','P',92,95,'chain'),leg('back','P','A',120,130)];
 const j=result(s).journey;
 // Both outward choices yield the same pickup and home arrival. The engine
 // retains earliest outward arrival, not globally fewest legs for that tie.
 assert.deepEqual(j.outbound.map(c=>c.id),['chain1','chain2']);
 assert.equal(j.awayMinutes,40);assert.equal(j.arrive,130);
});

test('unreachable reasons distinguish proven routing stages',()=>{
 const outbound=fixture();outbound.connections.shift();
 assert.match(result(outbound).reason,/No outbound journey/);
 const pickup=fixture();assert.match(result(pickup,80).reason,/no pickup fits/);
 const noReturn=fixture();noReturn.connections.pop();
 assert.match(result(noReturn).reason,/no scheduled return.*home deadline/);
 const lateReturn=fixture();lateReturn.origins[0].homeBy=125;
 assert.match(result(lateReturn).reason,/no scheduled return.*home deadline/);
 const tooLong=fixture();tooLong.origins[0].maxAwayMinutes=39;
 assert.match(result(tooLong).reason,/Scheduled returns exist.*maximum time away/);
 const pantry=fixture();pantry.origins[0].stopId='P';pantry.origins[0].maxAwayMinutes=9;
 assert.match(result(pantry).reason,/pickup cannot fit/);
});
test('stage diagnostics consider every departure and mixed failure causes',()=>{
 const s=fixture();s.origins[0].maxAwayMinutes=40;
 s.connections=[leg('early','A','P',80,90),leg('late','A','P',100,110),leg('back','P','A',115,130)];
 // Early pickup has an over-budget return. Later pickup misses that return.
 // Do not claim no scheduled return merely because the last option misses it.
 assert.equal(result(s).reachable,false);
 assert.match(result(s).reason,/Scheduled returns exist.*maximum time away/);
 s.connections.push(leg('rescue','P','A',120,135));
 assert.equal(result(s).reachable,true);
 assert.match(result(s).reason,/Complete scheduled round trip/);
 const noPickup=fixture();noPickup.connections=[leg('tooEarly','A','P',0,10),leg('tooLate','A','P',115,125)];
 noPickup.origins[0].maxAwayMinutes=40;
 assert.match(result(noPickup).reason,/no pickup fits/);
});
