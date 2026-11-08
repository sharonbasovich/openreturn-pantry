import assert from 'node:assert/strict';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const candidateRoot = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../../', import.meta.url));
const old = await import(pathToFileURL(join(candidateRoot, 'evidence/routing-cache/baseline-model.mjs')).href);
const candidate = await import(pathToFileURL(join(candidateRoot, 'src/model.mjs')).href);
const leg=(id,from,to,departure,arrival,tripId=id)=>({id,tripId,from,to,departure,arrival});
function fixture(){return {version:1,title:'Independent synthetic cache review',serviceDay:'2026-11-08',dataKind:'synthetic',stops:['A','P','X','A|0|150|150','A",0,150,150','\ud800','__proto__'].map(id=>({id,name:id})),pantryStop:'P',origins:[{id:'base',label:'Synthetic',stopId:'A',leaveAfter:0,homeBy:150,maxAwayMinutes:150}],connections:[leg('a','A','P',20,30),leg('z','A','P',20,30),leg('later','A','P',50,60),leg('back','P','A',70,80),leg('back2','P','A',100,110)],settings:{baselineStart:43,earliestStart:20,latestStart:100,stepMinutes:10,openMinutes:30,visitMinutes:10,transferMinutes:3,maxTransfers:2}}}
let comparisons=0;
function compare(s){const before=structuredClone(s);assert.deepStrictEqual(candidate.validateScenario(s),old.validateScenario(s));assert.deepStrictEqual(candidate.optimizeWindows(s),old.optimizeWindows(s));comparisons++;for(let start=s.settings.earliestStart;start<=s.settings.latestStart;start+=s.settings.stepMinutes){assert.deepStrictEqual(candidate.evaluateWindow(s,start),old.evaluateWindow(s,start));comparisons++;}assert.deepStrictEqual(s,before);}
let s=fixture();
for(const [i,change] of [{},{leaveAfter:21},{homeBy:79},{maxAwayMinutes:59},{homeBy:110,maxAwayMinutes:60},{leaveAfter:51},{maxAwayMinutes:9},{stopId:'P'},{stopId:'P',leaveAfter:48},{stopId:'P',homeBy:49},{stopId:'P',maxAwayMinutes:9}].entries())s.origins.push({...s.origins[0],...change,id:`origin${i}`});
compare(s);s.origins.reverse();s.connections.reverse();compare(s);
for(const id of ['A|0|150|150','A",0,150,150','\ud800','__proto__']){let d=fixture();d.origins.push({...d.origins[0],id,stopId:id});d.connections.push(leg(`${id}out`,id,'P',22,31),leg(`${id}back`,'P',id,70,90));compare(d);}
// Seeded full-output differential checks, with shared stops and mixed constraints.
let seed=0xa4b509;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for(let n=0;n<600;n++){let d=fixture();d.origins=Array.from({length:24},(_,i)=>({id:`o${i}`,label:`synthetic ${i}`,stopId:i%7===0?'P':i%5===0?'X':'A',leaveAfter:rand(30),homeBy:80+rand(80),maxAwayMinutes:1+rand(150)}));d.connections=[];for(let i=0;i<35;i++){const from=rand(3),to=(from+1+rand(2))%3,departure=rand(145);d.connections.push(leg(`c${i}`,['A','X','P'][from],['A','X','P'][to],departure,departure+1+rand(10)));}d.connections.push(leg('chain1','A','X',20,30,'bus'),leg('chain2','X','P',30,40,'bus'));d.settings.transferMinutes=rand(8);d.settings.maxTransfers=rand(4);compare(d);}
// Input, returned result, and successive invocations must not poison future calls.
s=fixture();s.origins.push({...s.origins[0],id:'twin'});const r=candidate.optimizeWindows(s);r.windows[0].results[0].reason='mutated';r.best.results[0].journey?.outbound.push({id:'mutated'});compare(s);
for(const mutate of [d=>d.connections[0].arrival=35,d=>d.origins[0].homeBy=79,d=>d.origins[0].leaveAfter=25,d=>d.origins[0].maxAwayMinutes=20,d=>d.settings.visitMinutes=15,d=>d.settings.transferMinutes=9,d=>d.settings.maxTransfers=0,d=>d.pantryStop='X']){let d=fixture();candidate.optimizeWindows(d);mutate(d);compare(d);}
// Observe public reference topology separately from value equivalence.
s=fixture();s.origins.push({...s.origins[0],id:'twin'});const a=old.evaluateWindow(s,40),b=candidate.evaluateWindow(s,40);const alias={baselineOutboundArrayShared:a.results[0].journey.outbound===a.results[1].journey.outbound,candidateOutboundArrayShared:b.results[0].journey.outbound===b.results[1].journey.outbound,baselineReturnArrayShared:a.results[0].journey.return===a.results[1].journey.return,candidateReturnArrayShared:b.results[0].journey.return===b.results[1].journey.return};
console.log(JSON.stringify({status:'PASS',seed:'0xa4b509',randomScenarios:600,fullOutputComparisons:comparisons,alias},null,2));
