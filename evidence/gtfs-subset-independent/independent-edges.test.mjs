import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFiles,makeTemplate,csv} from './independent-fixture.mjs';
import {createHash} from 'node:crypto';
const source = process.env.REVIEW_SOURCE || new URL('../../',import.meta.url).href;
const {adaptGtfsSubset,GTFS_LIMITS}=await import(`${source}/src/gtfs-subset.mjs`);
const {exportScenarioJson}=await import(`${source}/src/import.mjs`);
function template(){const x=makeTemplate();return {title:x.title,timeZone:'Etc/UTC',timeBasis:'gtfs-service-day-minutes',pantryStop:x.pantryStop,origins:x.origins,settings:x.settings};}
const run=(files,extra={})=>adaptGtfsSubset({...{files,serviceDay:'2026-11-08',routeIds:['R'],template:template()},...extra});
const addCol=(t,h,name,col,fn)=>{h[name].push(col);t[name].forEach((r,i)=>r.push(fn(i)));};

test('inactive in-scope trip is explicitly reported; out-of-scope count exact',()=>{
 const files=makeFiles((t,h)=>{t.calendar.push(['OFF',1,0,0,0,0,0,0,'20261101','20261130']);t.trips.push(['R','OFF','INACTIVE'],['OTHER','S','OUTSIDE']);t.routes.push(['OTHER','AG','Other','Other route',3]);});
 const {receipt,scenario}=run(files);assert.deepEqual(receipt.selection.inactiveScopedTripIds,['INACTIVE']);assert.equal(receipt.selection.outOfScopeTripCount,1);assert.equal(scenario.connections.length,4);
});
test('explicit inactive trip rejects even if another selected trip is active',()=>{
 const files=makeFiles(t=>{t.calendar.push(['OFF',1,0,0,0,0,0,0,'20261101','20261130']);t.trips.push(['R','OFF','INACTIVE']);});
 const x={files,serviceDay:'2026-11-08',tripIds:['BACK','INACTIVE'],template:template()};assert.throws(()=>adaptGtfsSubset(x),/inactive/i);
});
test('each explicit route must have an active trip',()=>{
 const files=makeFiles(t=>{t.routes.push(['EMPTY','AG','Empty','Empty route',3]);});assert.throws(()=>run(files,{routeIds:['R','EMPTY']}),/active/i);
});
test('calendar_dates adds a service that has no calendar row and overrides out-of-range service',()=>{
 for(const newService of [false,true]){const files=makeFiles(t=>{if(newService){t.trips.forEach(r=>r[1]='ADDED');}else{t.calendar[0][8]='20261101';t.calendar[0][9]='20261102';}t.calendar_dates=[[newService?'ADDED':'S','20261108',1]];});assert.equal(run(files).scenario.connections.length,4);}
});
test('parent timezone metadata inherited while schedule minutes remain agency-based',()=>{
 const files=makeFiles((t,h)=>{t.stops.push(['ST','Station',0,0,1]);addCol(t,h,'stops','parent_station',i=>i===1?'ST':'');addCol(t,h,'stops','stop_timezone',i=>i===1?'Asia/Tokyo':i===3?'Europe/London':'');});
 const {scenario,receipt}=run(files);assert.equal(scenario.connections[0].arrival,485);assert.equal(receipt.stops.find(x=>x.stopId==='B').localTimezone,'Europe/London');assert.equal(receipt.stops.find(x=>x.stopId==='B').parentStation,'ST');assert.ok(!scenario.stops.find(x=>x.id==='ST'));
});
test('DST transition is explicitly service-day basis, not a wall-clock conversion',()=>{
 const files=makeFiles(t=>{t.agency[0][3]='America/New_York';t.calendar_dates=[['S','20261101',1]];});
 const {scenario,receipt}=run(files,{serviceDay:'2026-11-01',template:{...template(),timeZone:'America/New_York'}});assert.equal(scenario.connections[0].departure,480);assert.match(receipt.limitations.join(' '),/noon minus 12 hours/);assert.match(receipt.limitations.join(' '),/not necessarily local wall-clock/);
});
test('partial timepoint values, flexible windows, booking IDs reject',()=>{
 for(const col of ['start_pickup_drop_off_window','end_pickup_drop_off_window','pickup_booking_rule_id','drop_off_booking_rule_id','location_id','location_group_id'])assert.throws(()=>run(makeFiles((t,h)=>addCol(t,h,'stop_times',col,i=>i===1?'value':''))));
 assert.throws(()=>run(makeFiles((t,h)=>addCol(t,h,'stop_times','timepoint',i=>i===1?'1':''))));
});
test('empty comma CSV records cannot disappear as blank lines',()=>{
 const files=makeFiles();files['stop_times.txt']+=',,,,\n';assert.throws(()=>run(files),/unknown trip/i);
});
test('model connection and stop capacity are fail-closed, not truncation',()=>{
 const tooManyStops=makeFiles((t,h)=>{for(let i=0;i<65;i++){t.stops.push(['S'+i,'Synthetic '+i,0,0,0]);t.stop_times.push(['LONG',`${String(Math.floor((600+i*2)/60)).padStart(2,'0')}:${String((600+i*2)%60).padStart(2,'0')}:00`,`${String(Math.floor((600+i*2)/60)).padStart(2,'0')}:${String((600+i*2)%60).padStart(2,'0')}:00`,'S'+i,i]);}t.trips.push(['R','S','LONG']);});assert.throws(()=>run(tooManyStops),/64/);
 const tooManyLegs=makeFiles(t=>{for(let i=0;i<1201;i++){const name='T'+i;t.trips.push(['R','S',name]);t.stop_times.push([name,'10:00:00','10:00:00','A',0],[name,'10:01:00','10:01:00','P',1]);}});assert.throws(()=>run(tooManyLegs),/1200/);
});
test('UTF-8 bytes not JS character count enforce file limit',()=>{
 const files=makeFiles();files['shapes.txt']='Ω'.repeat(GTFS_LIMITS.fileBytes/2+1);assert.throws(()=>run(files),/byte limit/);
});
test('row and cell limits reject before model projection',()=>{
 const rows=makeFiles();rows['calendar_dates.txt']='service_id,date,exception_type\n'+'S,20261108,1\n'.repeat(GTFS_LIMITS.rows+1);assert.throws(()=>run(rows),/row limit/);
 const cell=makeFiles(t=>t.stops[0][1]='x'.repeat(GTFS_LIMITS.cellCharacters+1));assert.throws(()=>run(cell),/cell limit/);
});
test('receipt maps every leg to its exact ordered pair and preserves full stop calls',()=>{
 const {scenario,receipt}=run(makeFiles());assert.equal(receipt.connectionMap.length,4);assert.equal(receipt.stopCalls.length,6);
 for(const c of scenario.connections){const m=receipt.connectionMap.find(x=>x.connectionId===c.id),a=receipt.stopCalls.find(x=>x.tripId===m.tripId&&x.stopSequence===m.fromStopSequence),b=receipt.stopCalls.find(x=>x.tripId===m.tripId&&x.stopSequence===m.toStopSequence);assert.equal(a.stopId,c.from);assert.equal(a.departure,c.departure);assert.equal(b.stopId,c.to);assert.equal(b.arrival,c.arrival);}
 const bytes=Buffer.from(exportScenarioJson(scenario)+'\n');assert.equal(receipt.output.sha256,createHash('sha256').update(bytes).digest('hex'));
});

test('numeric duplicate sequence 1 and 01 reject instead of becoming two calls',()=>{const files=makeFiles(t=>{t.stop_times[0][4]='1';t.stop_times[1][4]='01';});assert.throws(()=>run(files),/Duplicate stop_sequence/);});
test('combined feed byte cap applies across allowed files before parsing the final file',()=>{
 const files=makeFiles();for(const name of ['attributions.txt','feed_info.txt','shapes.txt','stops.txt'])files[name]='x'.repeat(GTFS_LIMITS.fileBytes);
 assert.throws(()=>run(files),/Feed byte limit exceeded/);
});
test('template byte cap rejects the whole import',()=>{assert.throws(()=>run(makeFiles(),{template:{...template(),title:'x'.repeat(GTFS_LIMITS.templateBytes)}}),/Template exceeds the byte limit/);});
test('ignored permitted CSV descriptions also reject embedded controls after review hardening',()=>{
 for(const bad of ['ignored\nnewline','ignored\tTAB','ignored\rreturn','ignored\u0000NUL']){const files=makeFiles((t,h)=>addCol(t,h,'stops','stop_desc',i=>i===0?bad:''));assert.throws(()=>run(files),/control characters/);}
});
