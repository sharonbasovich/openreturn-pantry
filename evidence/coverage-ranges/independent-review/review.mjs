// Independent review: enumerate scheduled paths directly, then check every
// integer start. No production route/interval/oracle helper determines expected results.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {analyzeCoverageRanges, optimizeWindows} from '../../../src/model.mjs';
import {SAMPLE} from '../../../src/sample.mjs';
const ids=['a','b','p'];
const leg=(id,from,to,departure,arrival,tripId=id)=>({id,from,to,departure,arrival,tripId});
function fixture(seed){
 let state=seed;const rand=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return(state>>>8)%n;};
 const connections=[];
 for(let t=0;t<4;t++) {let at=rand(3),time=rand(10);for(let k=0;k<3;k++){let next=(at+1+rand(2))%3;let departure=time+rand(5),arrival=departure+1+rand(5);connections.push(leg(`t${t}l${k}`,ids[at],ids[next],departure,arrival,`t${t}`));at=next;time=arrival;}}
 return {version:1,title:'Independent range review',serviceDay:'2026-11-08',dataKind:'synthetic',stops:ids.map(id=>({id,name:id})),pantryStop:'p',origins:ids.map((stopId,i)=>({id:`o${i}`,stopId,label:stopId,leaveAfter:rand(10),homeBy:20+rand(25),maxAwayMinutes:1+rand(40)})),connections:connections.reverse(),settings:{earliestStart:0,latestStart:40,baselineStart:rand(41),openMinutes:5+rand(12),visitMinutes:1+rand(5),stepMinutes:1+rand(10),transferMinutes:rand(9),maxTransfers:rand(4)}};
}
function enumerate(s,from,to,ready){
 const found=[];
 const chains=new Map();for(const c of s.connections){if(!chains.has(c.tripId))chains.set(c.tripId,[]);chains.get(c.tripId).push(c);}
 for(const chain of chains.values())chain.sort((a,b)=>a.departure-b.departure);
 function walk(at,time,path,transfers){
  if(at===to){found.push(path);return;}
  for(const c of s.connections){
   if(c.from!==at||c.departure<time)continue;
   const prior=path.at(-1),chain=chains.get(c.tripId);
   const onboard=prior&&prior.tripId===c.tripId&&chain.indexOf(c)===chain.indexOf(prior)+1;
   const changed=prior&&!onboard;
   if(c.departure<time+(changed?s.settings.transferMinutes:0)||transfers+(changed?1:0)>s.settings.maxTransfers)continue;
   walk(c.to,c.arrival,[...path,c],transfers+(changed?1:0));
  }
 }
 walk(from,ready,[],0);return found;
}
function expected(s){
 const prepared=s.origins.map(o=>({o,out:o.stopId===s.pantryStop?[]:enumerate(s,o.stopId,s.pantryStop,o.leaveAfter),back:o.stopId===s.pantryStop?[]:enumerate(s,s.pantryStop,o.stopId,0)}));
 return Array.from({length:s.settings.latestStart-s.settings.earliestStart+1},(_,i)=>{
  const start=s.settings.earliestStart+i;
  return {start,originIds:prepared.filter(({o,out,back})=>{
   if(o.stopId===s.pantryStop){const pickup=Math.max(start,o.leaveAfter);return pickup+s.settings.visitMinutes<=Math.min(start+s.settings.openMinutes,o.homeBy)&&s.settings.visitMinutes<=o.maxAwayMinutes;}
   return out.some(path=>{const pickupEnd=Math.max(start,path.at(-1).arrival)+s.settings.visitMinutes;if(pickupEnd>start+s.settings.openMinutes)return false;return back.some(ret=>ret[0].departure>=pickupEnd&&ret.at(-1).arrival<=o.homeBy&&ret.at(-1).arrival-path[0].departure<=o.maxAwayMinutes);});
  }).map(({o})=>o.id)};
 });
}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
let minutes=0,cases=0;
function check(s){
 const before=JSON.stringify(s), want=expected(s),audit=analyzeCoverageRanges(freeze(s));
 assert.equal(JSON.stringify(s),before);
 for(const row of want){minutes++;const range=audit.ranges.filter(r=>r.start<=row.start&&r.end>=row.start);assert.equal(range.length,1);assert.deepEqual(range[0].originIds,row.originIds);assert.equal(range[0].reachable,row.originIds.length);for(const origin of audit.originRanges)assert.equal(origin.intervals.some(r=>r.start<=row.start&&r.end>=row.start),row.originIds.includes(origin.originId));}
 assert.equal(audit.ranges[0].start,s.settings.earliestStart);assert.equal(audit.ranges.at(-1).end,s.settings.latestStart);
 for(let i=1;i<audit.ranges.length;i++){assert.equal(audit.ranges[i].start,audit.ranges[i-1].end+1);assert.notDeepEqual(audit.ranges[i].originIds,audit.ranges[i-1].originIds);}
 const ranked=[...want].sort((a,b)=>b.originIds.length-a.originIds.length||Math.abs(a.start-s.settings.baselineStart)-Math.abs(b.start-s.settings.baselineStart)||a.start-b.start);
 assert.equal(audit.best.start,ranked[0].start);assert.deepEqual(audit.best.originIds,ranked[0].originIds);
 const grid=optimizeWindows(s);assert.equal(audit.gridBest.start,grid.best.start);assert.equal(audit.gridBest.reachable,grid.best.reachable);
 const original=JSON.stringify(audit);audit.ranges[0].originIds.push('mutation');assert.equal(JSON.stringify(analyzeCoverageRanges(s)),original);
 cases++;
}
for(let seed=1;seed<=180;seed++)check(fixture(seed));
check(structuredClone(SAMPLE));
// Equality at pickup, return departure, home and max-away; zero transfer;
// onboard continuation versus nonadjacent same-trip reboarding; on-site limits.
for(const transferMinutes of [0,1,5])for(const maxTransfers of [0,1,3])for(const maxAwayMinutes of [14,15,16]){
 const s=fixture(1);s.connections=[leg('one','a','b',0,2,'loop'),leg('two','b','a',2,4,'loop'),leg('three','a','b',4,6,'loop'),leg('four','b','p',6,8,'loop'),leg('back','p','a',10,15)];s.origins=[{id:'a',label:'A',stopId:'a',leaveAfter:0,homeBy:15,maxAwayMinutes},{id:'p',label:'P',stopId:'p',leaveAfter:8,homeBy:10,maxAwayMinutes}];s.settings={...s.settings,earliestStart:0,latestStart:15,baselineStart:7,openMinutes:2,visitMinutes:2,stepMinutes:5,transferMinutes,maxTransfers};check(s);
}
const s=fixture(4);s.connections=[leg('early','a','p',2870,2872),leg('home','p','a',2874,2879)];s.origins=[{id:'a',label:'A',stopId:'a',leaveAfter:2870,homeBy:2879,maxAwayMinutes:9}];s.settings={earliestStart:2860,latestStart:2875,baselineStart:2871,openMinutes:4,visitMinutes:2,stepMinutes:7,transferMinutes:0,maxTransfers:0};check(s);
console.log(`PASS ${cases} scenarios / ${minutes} independently enumerated integer-start coverage sets; ranking, partitions, grid compatibility, deep-frozen inputs, output isolation.`);
for(const path of ['src/model.mjs','scripts/coverage-ranges.mjs'])console.log(createHash('sha256').update(await readFile(new URL('../../../'+path,import.meta.url))).digest('hex'),path);
