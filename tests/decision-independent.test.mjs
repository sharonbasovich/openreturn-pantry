import assert from 'node:assert/strict';
import {auditDecision,auditSensitivity} from '../src/decision.mjs';
import {buildDecisionSheet} from '../src/report.mjs';
import {evaluateWindow,optimizeWindows} from '../src/model.mjs';
import {SAMPLE} from '../src/sample.mjs';

// Independent synthetic fixtures only. No browser or real-feed acceptance claim.
import test from 'node:test';
test('independent decision arithmetic and sensitivity across 62 synthetic scenarios', t => {
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const ids=w=>w.results.filter(r=>r.reachable).map(r=>r.originId);
const diff=(a,b)=>a.filter(id=>!b.includes(id));
function verify(s){
 const snapshot=JSON.stringify(s),a=auditDecision(s),v=auditSensitivity(s),old=ids(a.comparison.best);
 eq(JSON.stringify(s),snapshot);
 for(const w of [a.baseline,...a.windows]){
 const raw=evaluateWindow(s,w.start);
 eq(w.reachable,raw.reachable);
 for(const summary of w.journeys){
 const j=raw.results.find(r=>r.originId===summary.originId).journey,o=s.origins.find(o=>o.id===summary.originId);
 const riding=[...j.outbound,...j.return].reduce((n,c)=>n+c.arrival-c.departure,0);
 eq(summary.ridingMinutes,riding);eq(summary.waitMinutes,j.arrive-j.depart-riding-s.settings.visitMinutes);
 eq(Object.values(summary.waits).reduce((a,b)=>a+b,0),summary.waitMinutes);
 eq(summary.headroom.away,o.maxAwayMinutes-(j.arrive-j.depart));eq(summary.headroom.home,o.homeBy-j.arrive);eq(summary.headroom.closing,w.end-j.pickupEnd);
 eq(summary.headroom.returnDeparture,j.return.length?j.return[0].departure-j.pickupEnd:null);
 let transfer=[],dwell=0,tw=0;for(const path of [j.outbound,j.return])for(let i=1;i<path.length;i++){const gap=path[i].departure-path[i-1].arrival;if(path[i].tripId===path[i-1].tripId)dwell+=gap;else{tw+=gap;transfer.push(gap-s.settings.transferMinutes);}}
 eq(summary.headroom.transfer,transfer.length?Math.min(...transfer):null);eq(summary.waits.onBoard,dwell);eq(summary.waits.transfers,tw);
 }
 }
 for(let i=0;i<3;i++){
 const c=v.cases[i],changed=structuredClone(s);changed.settings.visitMinutes+=i===1?0:15;changed.settings.transferMinutes+=i===0?0:5;
 let oracle;try{oracle=optimizeWindows(changed);}catch{eq(c.status,'not-applicable');continue;}
 eq(c.status,'evaluated');const fixed=evaluateWindow(changed,a.best.start),fi=ids(fixed),bi=ids(oracle.best),ci=ids(oracle.baseline);
 eq(c.fixed.reachable,fixed.reachable);eq(c.reoptimized.start,oracle.best.start);eq(c.fixedLost,diff(old,fi));eq(c.fixedGained,diff(fi,old));eq(c.reoptimizedLost,diff(old,bi));eq(c.reoptimizedGained,diff(bi,old));eq(c.versusChangedCurrentLost,diff(ci,bi));eq(c.versusChangedCurrentGained,diff(bi,ci));eq(c.reoptimizedNet,bi.length-ci.length);
 }
 eq(JSON.stringify(s),snapshot);return a;
}
// Deterministic variations exercise different windows, invalid variants, and ties.
for(let n=0;n<60;n++) {const s=structuredClone(SAMPLE);s.settings.baselineStart=540+n%16;s.settings.visitMinutes=[1,15,30,110,120][n%5];s.settings.transferMinutes=[0,5,6,10,2879][n%5];for(let i=0;i<s.origins.length;i++){s.origins[i].maxAwayMinutes=50+(n*13+i*17)%181;s.origins[i].homeBy=750+(n*7+i*3)%180;}verify(s);}
// Fully explicit witness: outbound dwell + transfer, opening wait, return wait + transfer.
const leg=(id,tripId,from,to,departure,arrival)=>({id,tripId,from,to,departure,arrival});
const s={version:1,title:'Synthetic independent fixture',serviceDay:'2026-11-12',dataKind:'synthetic',stops:['A','B','C','P'].map(id=>({id,name:id})),pantryStop:'P',origins:[{id:'a',label:'<img src=x onerror=alert(1)>',stopId:'A',leaveAfter:0,homeBy:115,maxAwayMinutes:105}],connections:[leg('1','t','A','B',10,20),leg('2','t','B','C',23,30),leg('3','u','C','P',35,45),leg('4','v','P','C',80,90),leg('5','w','C','A',95,115)],settings:{baselineStart:60,earliestStart:60,latestStart:60,openMinutes:15,visitMinutes:15,stepMinutes:15,transferMinutes:5,maxTransfers:2}};
const a=verify(s),j=a.best.journeys[0];eq(j.waits,{beforeVisit:15,afterVisit:5,transfers:10,onBoard:3});eq(j.waitMinutes,33);eq(j.headroom,{away:0,home:0,closing:0,returnDeparture:5,transfer:0});assert(buildDecisionSheet(a).includes(s.origins[0].label));checks++;
const local=structuredClone(s);local.origins[0].stopId='P';local.origins[0].leaveAfter=60;local.origins[0].homeBy=75;local.origins[0].maxAwayMinutes=15;const l=verify(local);eq(l.best.journeys[0].headroom,{away:0,home:0,closing:0,returnDeparture:null,transfer:null});
t.diagnostic(`${checks} independent assertions across 62 synthetic scenarios`);
});
