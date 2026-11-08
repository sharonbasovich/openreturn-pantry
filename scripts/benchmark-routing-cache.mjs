// Reproducible Node timing experiment, not a browser responsiveness guarantee.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { optimizeWindows as current } from '../src/model.mjs';
import { optimizeWindows as baseline } from '../evidence/routing-cache/baseline-model.mjs';

const scenario={version:1,title:'Synthetic repeated-origin benchmark',serviceDay:'2026-11-09',dataKind:'synthetic',
  stops:[{id:'a',name:'Origin'},{id:'p',name:'Pantry'}],pantryStop:'p',
  origins:Array.from({length:24},(_,i)=>({id:`o${i}`,stopId:'a',label:`Scenario ${i}`,leaveAfter:0,homeBy:2879,maxAwayMinutes:2879})),
  connections:[],settings:{baselineStart:600,earliestStart:0,latestStart:1410,openMinutes:120,visitMinutes:15,stepMinutes:30,transferMinutes:5,maxTransfers:3}};
for(let i=0;i<600;i++){const d=2*i;scenario.connections.push(
  {id:`out${i}`,tripId:`out${i}`,from:'a',to:'p',departure:d,arrival:d+1},
  {id:`back${i}`,tripId:`back${i}`,from:'p',to:'a',departure:d+2,arrival:d+3});}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const measure=fn=>{const start=performance.now(),result=fn(scenario);return {milliseconds:performance.now()-start,result};};
const measurements=[];
for(let run=0;run<3;run++) {
  // Alternate ordering to reduce simple first-run/order effects. Neither is warmed separately.
  let old,now;
  if(run%2){now=measure(current);old=measure(baseline);}else{old=measure(baseline);now=measure(current);}
  assert.deepEqual(now.result,old.result,'all results, diagnostics and retained witnesses must match');
  measurements.push({run:run+1,baselineMs:old.milliseconds,candidateMs:now.milliseconds,ratio:old.milliseconds/now.milliseconds,outputSha256:hash(now.result)});
}
// Different per-origin constraints limit cache sharing; check, do not promise a gain.
scenario.origins.forEach((o,i)=>{o.leaveAfter=i;o.homeBy=2600+i;o.maxAwayMinutes=2500+i;});
const mixedOld=measure(baseline),mixedNow=measure(current);assert.deepEqual(mixedNow.result,mixedOld.result);
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,
  workload:{connections:1200,origins:24,gridWindows:48,kind:'synthetic'},measurements,
  distinctConstraints:{baselineMs:mixedOld.milliseconds,candidateMs:mixedNow.milliseconds,outputSha256:hash(mixedNow.result)},
  limits:'One Node process on one cloud machine; synthetic cache-friendly case and one distinct-constraint case. Not a native-browser measurement, global speedup, or upper runtime bound.'},null,2));
