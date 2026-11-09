import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeFiles,makeTemplate,csv} from './independent-fixture.mjs';
const source = process.env.REVIEW_SOURCE || new URL('../../',import.meta.url).href;
const {adaptGtfsSubset} = await import(`${source}/src/gtfs-subset.mjs`);
const {evaluateWindow,validateScenario} = await import(`${source}/src/model.mjs`);
const template = () => {const x=makeTemplate();return {title:x.title,timeZone:'Etc/UTC',timeBasis:'gtfs-service-day-minutes',pantryStop:x.pantryStop,origins:x.origins,settings:x.settings};};
const run=(files=makeFiles(),options={})=>adaptGtfsSubset(Object.fromEntries(Object.entries({files,serviceDay:'2026-11-08',routeIds:['R'],template:template(),...options}).filter(([,v])=>v!==undefined)));
const reject=(mutate,pattern)=>assert.throws(()=>run(makeFiles(mutate)),pattern);
const changeCol=(tables,heads,table,col,values)=>{heads[table].push(col);tables[table].forEach((r,i)=>r.push(typeof values==='function'?values(i):values));};

test('hand-calculated adjacent loop chain, preserved dwell, exact IDs, and fresh template settings',()=>{
 const {scenario}=run();
 assert.equal(scenario.serviceDay,'2026-11-08');assert.equal(scenario.dataKind,'user-supplied');
 assert.deepEqual(validateScenario(scenario),scenario);
 assert.deepEqual(scenario.connections.map(({tripId,from,to,departure,arrival})=>({tripId,from,to,departure,arrival})),[
 {tripId:'LOOP',from:'A',to:'B',departure:480,arrival:485},
 {tripId:'LOOP',from:'B',to:'A',departure:488,arrival:493},
 {tripId:'LOOP',from:'A',to:'P',departure:494,arrival:499},
 {tripId:'BACK',from:'P',to:'A',departure:520,arrival:530},
 ]);
 const result=evaluateWindow(scenario,500).results[0];
 assert.equal(result.reachable,true);assert.equal(result.journey.depart,494);assert.equal(result.journey.arrive,530);assert.equal(result.journey.awayMinutes,36);
 const fromB=structuredClone(scenario);fromB.origins[0].stopId='B';fromB.connections.push({id:'review-back-to-B',tripId:'BACK',from:'A',to:'B',departure:531,arrival:540});
 const b=evaluateWindow(fromB,500).results[0];assert.equal(b.reachable,true);assert.equal(b.journey.depart,488);assert.equal(b.journey.outbound.length,2);assert.equal(b.journey.outbound[0].arrival,493);assert.equal(b.journey.outbound[1].departure,494);
});
test('template and files are not mutated; deterministic for identical inputs and property order',()=>{
 const files=makeFiles(), t=template(), before=JSON.stringify({files,t});
 const a=run(files,{template:t}),b=run(Object.fromEntries(Object.entries(files).reverse()),{template:t});
 assert.deepEqual(a,b);assert.equal(JSON.stringify({files,t}),before);
});
test('sequence ordering uses numeric values, not CSV row order',()=>{
 const normal=run().scenario;
 const changed=run(makeFiles(t=>t.stop_times.reverse())).scenario;
 assert.deepEqual(changed,normal);
});
test('whole-minute after-midnight service remains on selected service date',()=>{
 const files=makeFiles(t=>{for(const r of t.stop_times)for(const c of [1,2])r[c]=r[c].replace('08:','26:');});
 const {scenario}=run(files);assert.equal(scenario.connections[0].departure,1560);assert.equal(scenario.serviceDay,'2026-11-08');
});
test('calendar start and end dates inclusive; explicit additions can activate a weekday',()=>{
 const files=makeFiles(t=>{t.calendar[0][8]='20261108';t.calendar[0][9]='20261108';});assert.equal(run(files).scenario.connections.length,4);
 const addition=makeFiles(t=>{t.calendar[0][7]=0;t.calendar_dates=[['S','20261108',1]];});assert.equal(run(addition).scenario.connections.length,4);
});
test('calendar_dates-only explicit addition works; removal wins and never becomes all-days service',()=>{
 const add=makeFiles(t=>{delete t.calendar;t.calendar_dates=[['S','20261108',1]];});assert.equal(run(add).scenario.connections.length,4);
 reject(t=>{t.calendar_dates=[['S','20261108',2]];});
 reject(t=>{delete t.calendar;t.calendar_dates=[['S','20261109',1]];});
 reject(t=>{delete t.calendar;});
});
test('duplicate service/date exceptions rejected even if duplicate values match',()=>reject(t=>{t.calendar_dates=[['S','20261108',1],['S','20261108',1]];}));
test('undefined selected service ID never silently dropped',()=>reject(t=>{t.trips[0][1]='UNDEFINED';}));
test('invalid dates and calendar row ranges rejected',()=>{
 assert.throws(()=>run(makeFiles(),{serviceDay:'2026-02-30'}));
 reject(t=>t.calendar[0][8]='20260230');reject(t=>t.calendar[0][8]='20261201');reject(t=>t.calendar[0][7]=2);
});
test('explicit unknown and mixed-known scope must not silently shrink',()=>{
 assert.throws(()=>run(makeFiles(),{routeIds:['R','missing']}));
 assert.throws(()=>run(makeFiles(),{routeIds:undefined,tripIds:['LOOP','missing']}));
 assert.throws(()=>run(makeFiles(),{routeIds:[]}));
 assert.throws(()=>run(makeFiles(),{tripIds:['LOOP']}));
 assert.throws(()=>run(makeFiles(),{routeIds:undefined}));
});
test('selected one trip preserves full chain, not only template endpoints',()=>{
 const {scenario}=run(makeFiles(),{routeIds:undefined,tripIds:['LOOP']});assert.equal(scenario.connections.length,3);assert.ok(scenario.stops.some(s=>s.id==='B'));
});
test('nonzero seconds, missing exact times, approximate timepoints and overflow reject',()=>{
 reject(t=>t.stop_times[1][1]='08:05:01');reject(t=>t.stop_times[1][2]='');
 reject((t,h)=>changeCol(t,h,'stop_times','timepoint',i=>i===1?0:1));reject(t=>t.stop_times[5][1]='48:00:00');
});
test('decreasing times, duplicate sequence, same-stop leg, and zero running time reject',()=>{
 reject(t=>t.stop_times[1][2]='08:04:00');reject(t=>t.stop_times[1][4]=0);
 reject(t=>t.stop_times[1][3]='A');reject(t=>t.stop_times[1][1]='08:00:00');
});
test('omitted/empty and explicit ordinary pickup/dropoff accepted',()=>{
 const {scenario}=run(makeFiles((t,h)=>{changeCol(t,h,'stop_times','pickup_type',i=>i%2?'':0);changeCol(t,h,'stop_times','drop_off_type',i=>i%2?0:'');}));assert.equal(scenario.connections.length,4);
});
for(const col of ['pickup_type','drop_off_type']) for(const value of ['1','2','3','9'])test(`unsupported ${col}=${value} rejects selected full trip`,()=>reject((t,h)=>changeCol(t,h,'stop_times',col,i=>i===1?value:0)));
for(const col of ['continuous_pickup','continuous_drop_off']) {
 test(`${col}: blank stop values inherit unsupported route value`,()=>reject((t,h)=>{changeCol(t,h,'routes',col,0);changeCol(t,h,'stop_times',col,'');}));
 test(`${col}: explicit no-continuous-stop override can safely neutralize route default`,()=>{
  const result=run(makeFiles((t,h)=>{changeCol(t,h,'routes',col,0);changeCol(t,h,'stop_times',col,1);}));assert.equal(result.scenario.connections.length,4);
 });
 test(`${col}: stop-level nondefault rejects even with ordinary route`,()=>reject((t,h)=>{changeCol(t,h,'routes',col,1);changeCol(t,h,'stop_times',col,i=>i===1?0:1);}));
}
test('selected blocks, headways, linked transfers and stop transfer prohibitions reject',()=>{
 reject((t,h)=>changeCol(t,h,'trips','block_id','vehicle-block'));
 for(const exact of [0,1]){const files=makeFiles();files['frequencies.txt']=csv(['trip_id','start_time','end_time','headway_secs','exact_times'],[['LOOP','08:00:00','12:00:00',600,exact]]);assert.throws(()=>run(files));}
 for(const type of [3,4,5]){const files=makeFiles();files['transfers.txt']=csv(['from_stop_id','to_stop_id','from_trip_id','to_trip_id','transfer_type'],[['P','P','LOOP','BACK',type]]);assert.throws(()=>run(files));}
});
test('stop locations are exact identifiers and no parent station matching is invented',()=>{
 reject(t=>t.stop_times[1][3]='MISSING');reject(t=>t.stops[1][4]=1);
 assert.throws(()=>run(makeFiles(),{template:{...template(),pantryStop:'MISSING'}}));
});
test('template timezone mismatch rejects and service-day time basis is mandatory',()=>{
 assert.throws(()=>run(makeFiles(),{template:{...template(),timeZone:'Asia/Tokyo'}}));
 assert.throws(()=>run(makeFiles(),{template:{...template(),timeBasis:'wall-clock'}}));
});
test('CSV quoted comma, quote and Unicode survive, with prototype-like trip IDs',()=>{
 const files=makeFiles(t=>{t.stops[0][1]='Alpha, "here" Ω';for(const r of t.trips)r[2]=r[2]==='LOOP'?'__proto__':'constructor';for(const r of t.stop_times)r[0]=r[0]==='LOOP'?'__proto__':'constructor';});
 const s=run(files).scenario;assert.equal(s.stops.find(x=>x.id==='A').name,'Alpha, "here" Ω');assert.ok(s.connections.some(x=>x.tripId==='__proto__'));
});
test('UTF-8 BOM and CRLF accepted without changing IDs',()=>{
 const normal=run().scenario;const files=Object.fromEntries(Object.entries(makeFiles()).map(([k,v])=>[k,'\ufeff'+v.replaceAll('\n','\r\n')]));assert.deepEqual(run(files).scenario,normal);
});
test('duplicate headers, missing row fields, extra row fields, malformed quoting and control fields reject',()=>{
 for(const csvText of ['stop_id,stop_id,stop_name\nA,A,Alpha\n','stop_id,stop_name\nA\n','stop_id,stop_name\nA,Alpha,extra\n','stop_id,stop_name\nA,"unterminated\n','stop_id,stop_name\nA,"bad\nname"\n','stop_id,stop_name\nA,bad\tname\n']){
 const files=makeFiles();files['stops.txt']=csvText;assert.throws(()=>run(files));}
});
test('unknown core field and unsupported feed file rejected instead of ignored',()=>{
 reject((t,h)=>changeCol(t,h,'stop_times','future_permission_rule','blocked'));
 const files=makeFiles();files['unsupported.txt']='arbitrary\nvalue\n';assert.throws(()=>run(files));
});
test('UTF-16 invalid surrogates not silently normalized at the module boundary',()=>{
 const files=makeFiles();files['stops.txt']=files['stops.txt'].replace('Alpha','Alpha\ud800');assert.throws(()=>run(files));
});
