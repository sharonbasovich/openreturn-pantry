import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,writeFile,mkdir,rm,symlink,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {adaptGtfsSubset,GTFS_LIMITS} from '../src/gtfs-subset.mjs';
import {validateScenario,optimizeWindows} from '../src/model.mjs';
import {exportScenarioJson,parseScenarioJson} from '../src/import.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=join(root,'tests/fixtures/gtfs-synthetic');
const original=Object.fromEntries(await Promise.all((await readdir(join(fixture,'feed'))).map(async name=>[name,await readFile(join(fixture,'feed',name),'utf8')])));
const template=JSON.parse(await readFile(join(fixture,'template.json'),'utf8'));
const input=()=>({files:{...original},serviceDay:'2026-11-12',routeIds:['R'],template:structuredClone(template)});
const digest=s=>createHash('sha256').update(s).digest('hex');
const change=(i,file,a,b)=>{assert.ok(i.files[file].includes(a),`missing mutation target ${a}`);i.files[file]=i.files[file].replace(a,b);};
const addColumn=(i,file,column,value)=>{
  const [head,...rows]=i.files[file].trimEnd().split('\n');
  i.files[file]=[head+','+column,...rows.map((row,n)=>row+','+(typeof value==='function'?value(row,n):value))].join('\n')+'\n';
};
function reject(name,mutate,pattern) {
  test(name,()=>{const i=input();mutate(i);assert.throws(()=>adaptGtfsSubset(i),pattern);});
}

test('synthetic full adjacent chain, sequence order, repeated stop, dwell and 24+ minutes',()=>{
  const {scenario:s,receipt:r}=adaptGtfsSubset(input());
  assert.deepEqual(s.connections.map(c=>[c.id,c.tripId,c.from,c.to,c.departure,c.arrival]),[
    ['gtfs-leg-1','loop','A','X',1420,1430],['gtfs-leg-2','loop','X','A',1432,1440],
    ['gtfs-leg-3','loop','A','P',1442,1450],['gtfs-leg-4','return','P','A',1480,1495]
  ]);
  assert.deepEqual(r.connectionMap.map(c=>[c.fromStopSequence,c.toStopSequence]),[[0,10],[10,30],[30,40],[5,20]]);
  assert.equal(r.stopCalls.filter(c=>c.tripId==='loop'&&c.stopId==='A').length,2);
  assert.equal(r.stopCalls.find(c=>c.stopId==='X').departure-r.stopCalls.find(c=>c.stopId==='X').arrival,2);
  assert.equal(s.dataKind,'user-supplied');assert.equal(s.serviceDay,'2026-11-12');
  assert.deepEqual(s.stops.map(s=>s.id),['A','P','X']);
  assert.deepEqual(r.selection.selectedTripIds,['loop','return']);
  assert.deepEqual(r.selection.inactiveScopedTripIds,['removed']);
  assert.equal(r.services.find(s=>s.serviceId==='EXTRA').exception,'added');
  assert.equal(r.services.find(s=>s.serviceId==='REMOVED').exception,'removed');
});

test('validates through unchanged model and JSON importer; hashes the exact exported scenario bytes',()=>{
  const {scenario,receipt}=adaptGtfsSubset(input());
  assert.deepEqual(validateScenario(scenario),scenario);
  const text=exportScenarioJson(scenario)+'\n';
  assert.deepEqual(parseScenarioJson(text),scenario);assert.equal(receipt.output.sha256,digest(text));
  assert.equal(receipt.output.bytes,Buffer.byteLength(text));
  for(const f of receipt.inputs) assert.equal(f.sha256,digest(original[f.file]));
  assert.equal(receipt.templateHash.sha256,digest(JSON.stringify(template)));
  assert.equal(optimizeWindows(scenario).best.reachable,1);
});

test('full chain enables a later-loop boarding without fabricating an omitted continuation',()=>{
  const i=input();i.template.origins[0].stopId='X';
  const {scenario}=adaptGtfsSubset(i);
  // There is no return to X, so an outbound-only trip must not become reachable.
  assert.equal(optimizeWindows(scenario).best.reachable,0);
  assert.equal(scenario.connections.filter(c=>c.tripId==='loop').length,3);
});

test('module does not mutate input and output is deterministic',()=>{
  const i=input(),before=structuredClone(i);
  const a=adaptGtfsSubset(i),b=adaptGtfsSubset(i);
  assert.deepEqual(i,before);assert.deepEqual(a,b);
  a.receipt.limitations.length=0;assert.ok(adaptGtfsSubset(i).receipt.limitations.length);
});

test('input row and file order do not change scenario identity',()=>{
  const i=input();for(const f of ['trips.txt','stop_times.txt','stops.txt']) {
    const [h,...rows]=i.files[f].trimEnd().split('\n');i.files[f]=[h,...rows.reverse()].join('\n')+'\n';
  }
  i.files=Object.fromEntries(Object.entries(i.files).reverse());
  assert.deepEqual(adaptGtfsSubset(i).scenario,adaptGtfsSubset(input()).scenario);
});

test('calendar_dates-only service and exception-only service IDs are selected',()=>{
  const i=input();delete i.files['calendar.txt'];
  i.files['calendar_dates.txt']='service_id,date,exception_type\nDAILY,20261112,1\nEXTRA,20261112,1\nREMOVED,20261112,2\n';
  assert.equal(adaptGtfsSubset(i).scenario.connections.length,4);
  i.files['calendar.txt']='service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nREMOVED,0,0,0,0,0,0,0,20261101,20261130\n';
  assert.equal(adaptGtfsSubset(i).scenario.connections.length,4);
});

test('inclusive calendar boundaries and UTC weekday selection',()=>{
  const i=input();i.files['calendar.txt']=i.files['calendar.txt'].replaceAll('20261101,20261130','20261112,20261112');
  assert.equal(adaptGtfsSubset(i).receipt.selection.selectedTripIds.length,2);
});

test('explicit trip scope has no outside-trip stop-times projection',()=>{
  const i=input();delete i.routeIds;i.tripIds=['return'];
  const r=adaptGtfsSubset(i);
  assert.deepEqual(r.receipt.selection.selectedTripIds,['return']);assert.equal(r.scenario.connections.length,1);
  assert.deepEqual(r.scenario.stops.map(s=>s.id),['A','P']);assert.equal(r.receipt.selection.outOfScopeTripCount,2);
});

test('single unnamed agency resolves a blank route agency_id',()=>{
  const i=input();i.files['agency.txt']=i.files['agency.txt'].replace('agency_id,','').replace('DEMO,','');
  i.files['routes.txt']=i.files['routes.txt'].replace('agency_id,','').replace('R,DEMO,','R,');
  assert.equal(adaptGtfsSubset(i).receipt.routes[0].agencyId,null);
});

test('stop timezone never converts stop_times; distinct exact stop IDs are never merged',()=>{
  const i=input();addColumn(i,'stops.txt','stop_timezone','Pacific/Honolulu');
  i.files['stops.txt']=i.files['stops.txt'].replace('Synthetic loop stop','Synthetic pantry stop');
  const r=adaptGtfsSubset(i);assert.equal(r.scenario.connections[1].departure,1432);
  assert.equal(r.receipt.stops[0].localTimezone,'Pacific/Honolulu');
  assert.equal(r.scenario.stops.filter(s=>s.name==='Synthetic pantry stop').length,2);
});

test('station ancestry only records inherited timezone, never merges platforms',()=>{
  const i=input();addColumn(i,'stops.txt','location_type','0');addColumn(i,'stops.txt','parent_station',row=>row.startsWith('X,')?'ST':'');
  addColumn(i,'stops.txt','stop_timezone',row=>row.startsWith('X,')?'Europe/London':'');
  i.files['stops.txt']+='ST,Synthetic station,0,0,1,,Asia/Tokyo\n';
  const r=adaptGtfsSubset(i);assert.equal(r.receipt.stops.find(s=>s.stopId==='X').localTimezone,'Asia/Tokyo');
  assert.ok(!r.scenario.stops.some(s=>s.id==='ST'));
});

test('effective no-continuous stop-time override accepts route continuous default',()=>{
  const i=input();for(const field of ['continuous_pickup','continuous_drop_off']) {addColumn(i,'routes.txt',field,'0');addColumn(i,'stop_times.txt',field,'1');}
  assert.equal(adaptGtfsSubset(i).scenario.connections.length,4);
});

test('frequency service outside selected active scope is not fabricated',()=>{
  const i=input();i.files['frequencies.txt']='trip_id,start_time,end_time,headway_secs,exact_times\nremoved,12:00:00,14:00:00,600,1\n';
  assert.equal(adaptGtfsSubset(i).scenario.connections.length,4);
});

test('quoted commas, escaped quote, UTF-8 BOM and CRLF are accepted without rewriting IDs',()=>{
  const i=input();i.files['stops.txt']=i.files['stops.txt'].replace('Synthetic loop stop','"Synthetic ""loop"" stop"');
  for(const key of Object.keys(i.files)) i.files[key]='\uFEFF'+i.files[key].replaceAll('\n','\r\n');
  const r=adaptGtfsSubset(i);assert.equal(r.scenario.stops.find(s=>s.id==='X').name,'Synthetic "loop" stop');
  assert.equal(r.scenario.stops.find(s=>s.id==='A').name,'Synthetic origin, east');
});

test('explicit service-day basis retains DST-day raw minutes without conversion',()=>{
  const i=input();i.serviceDay='2026-11-01';i.files['calendar_dates.txt']=i.files['calendar_dates.txt'].replaceAll('20261112','20261101');
  const r=adaptGtfsSubset(i);assert.equal(r.scenario.connections[0].departure,1420);
  assert.match(r.receipt.limitations.join(' '),/noon minus 12 hours/);assert.match(r.receipt.limitations.join(' '),/not necessarily local wall-clock/);
});

test('prototype-like IDs remain literal and generated IDs do not concatenate source IDs',()=>{
  const i=input();i.files['trips.txt']=i.files['trips.txt'].replace(',loop',',__proto__');
  i.files['stop_times.txt']=i.files['stop_times.txt'].replaceAll('loop,','__proto__,');
  const r=adaptGtfsSubset(i);assert.ok(r.scenario.connections.some(c=>c.tripId==='__proto__'));
  assert.ok(r.scenario.connections.every(c=>/^gtfs-leg-\d+$/.test(c.id)));
});

test('unmodeled metadata files are named and hashed, not represented as validated routing data',()=>{
  const i=input();i.files['feed_info.txt']='feed_publisher_name,feed_publisher_url,feed_lang\nSynthetic,https://example.invalid,en\n';
  const f=adaptGtfsSubset(i).receipt.inputs.find(f=>f.file==='feed_info.txt');
  assert.equal(f.role,'unmodeled metadata');assert.equal(f.rows,null);
});

reject('requires an explicit scope',i=>delete i.routeIds,/exactly one/);
reject('rejects both scope kinds',i=>i.tripIds=['loop'],/exactly one/);
reject('rejects empty scope',i=>i.routeIds=[],/1 to 1200/);
reject('rejects duplicate scope',i=>i.routeIds=['R','R'],/duplicate scope/);
reject('rejects unknown route',i=>i.routeIds=['missing'],/Unknown routeIds/);
reject('rejects unknown trip',i=>{delete i.routeIds;i.tripIds=['missing'];},/Unknown tripIds/);
reject('rejects explicit inactive trip',i=>{delete i.routeIds;i.tripIds=['removed'];},/inactive/);
reject('rejects a route without active trips among a larger scope',i=>{i.files['routes.txt']+='EMPTY,DEMO,E,Empty route,3\n';i.routeIds.push('EMPTY');},/has no active trips/);
reject('rejects no active route service',i=>{i.serviceDay='2027-01-01';},/no active trips/);
reject('rejects invalid service day',i=>i.serviceDay='2026-02-30',/invalid date/);
reject('rejects bad calendar dates',i=>change(i,'calendar.txt','20261101','20260230'),/invalid date/);
reject('rejects reverse calendar range',i=>change(i,'calendar.txt','20261101,20261130','20261130,20261101'),/exceeds/);
reject('rejects invalid weekday enum',i=>change(i,'calendar.txt','DAILY,1','DAILY,2'),/calendar.monday/);
reject('rejects missing calendars',i=>{delete i.files['calendar.txt'];delete i.files['calendar_dates.txt'];},/required/);
reject('rejects duplicate service IDs',i=>i.files['calendar.txt']+='DAILY,1,1,1,1,1,1,1,20261101,20261130\n',/duplicate service_id/);
reject('rejects duplicate calendar exceptions',i=>i.files['calendar_dates.txt']+='EXTRA,20261112,2\n',/duplicate service\/date/);
reject('rejects invalid exception type',i=>change(i,'calendar_dates.txt','EXTRA,20261112,1','EXTRA,20261112,3'),/exception_type/);
reject('rejects unknown trip service',i=>change(i,'trips.txt','DAILY','MISSING'),/unknown service/);
reject('rejects missing core files',i=>delete i.files['agency.txt'],/agency.txt/);
reject('rejects unknown file instead of dropping restrictions',i=>i.files['booking_rules.txt']='booking_rule_id\nx\n',/Unsupported feed file/);
reject('rejects unsupported column instead of guessing extension semantics',i=>addColumn(i,'stop_times.txt','custom_restriction','yes'),/unsupported column/);
reject('rejects duplicate header',i=>addColumn(i,'trips.txt','trip_id','other'),/duplicate CSV header/);
reject('rejects malformed CSV row length',i=>i.files['trips.txt']+='R,DAILY\n',/wrong number/);
reject('rejects empty comma-only record',i=>i.files['trips.txt']+=',\n',/wrong number/);
reject('rejects unclosed quote',i=>i.files['trips.txt']+='"oops',/unclosed/);
reject('rejects text after CSV quote',i=>i.files['trips.txt']+='"oops"x,z,z\n',/text after/);
reject('rejects unexpected CSV quote',i=>i.files['trips.txt']+='oo"ps,z,z\n',/unexpected/);
reject('rejects duplicate trip ID',i=>i.files['trips.txt']+='R,DAILY,loop\n',/duplicate trip_id/);
reject('rejects duplicate stop ID',i=>i.files['stops.txt']+='A,Synthetic duplicate,0,0\n',/duplicate stop_id/);
reject('rejects unknown route reference',i=>change(i,'trips.txt','R,DAILY','BAD,DAILY'),/unknown route/);
reject('rejects orphan stop-time trip',i=>change(i,'stop_times.txt','loop,','unknown,'),/unknown trip/);
reject('rejects duplicate normalized stop_sequence',i=>i.files['stop_times.txt']+='loop,23:40:00,23:40:00,A,00\n',/Duplicate stop_sequence/);
reject('rejects fractional stop_sequence',i=>change(i,'stop_times.txt','P,40','P,40.5'),/safe nonnegative/);
reject('rejects unrepresentable stop_sequence',i=>change(i,'stop_times.txt','P,40','P,9007199254740992'),/safe nonnegative/);
reject('rejects unknown selected stop',i=>change(i,'stop_times.txt','P,40','MISSING,40'),/unknown stop/);
reject('rejects single-stop selected chain',i=>{delete i.routeIds;i.tripIds=['return'];i.files['stop_times.txt']=i.files['stop_times.txt'].replace('return,24:55:00,24:55:00,A,20\n','');},/at least two/);
reject('rejects consecutive repeat without skipping it',i=>change(i,'stop_times.txt','X,10','A,10'),/Consecutive identical/);
reject('rejects zero-duration adjacency',i=>change(i,'stop_times.txt','23:50:00,23:52:00','23:40:00,23:52:00'),/positive travel/);
reject('rejects negative dwell',i=>change(i,'stop_times.txt','23:50:00,23:52:00','23:50:00,23:49:00'),/dwell/);
reject('rejects overnight wrap instead of adding a day',i=>change(i,'stop_times.txt','24:00:00,24:02:00','00:00:00,00:02:00'),/positive travel/);
reject('rejects seconds instead of rounding',i=>change(i,'stop_times.txt','24:10:00','24:10:01'),/exact minute/);
reject('rejects time beyond v1 range',i=>change(i,'stop_times.txt','24:10:00','48:10:00'),/exact minute/);
reject('rejects missing intermediate arrival',i=>change(i,'stop_times.txt','23:50:00,23:52:00',',23:52:00'),/exact minute/);
reject('rejects interpolated timepoint',i=>addColumn(i,'stop_times.txt','timepoint','0'),/timepoint/);
reject('rejects partially populated timepoint',i=>addColumn(i,'stop_times.txt','timepoint',row=>row.includes('X,10')?'':'1'),/mixes blank/);
for(const key of ['pickup_type','drop_off_type']) for(const value of ['1','2','3']) reject(`rejects selected ${key}=${value}`,i=>addColumn(i,'stop_times.txt',key,value),new RegExp(key));
for(const key of ['continuous_pickup','continuous_drop_off']) {
  reject(`rejects inherited route ${key}`,i=>addColumn(i,'routes.txt',key,'0'),new RegExp(key));
  reject(`rejects stop ${key} override`,i=>addColumn(i,'stop_times.txt',key,'2'),new RegExp(key));
}
for(const key of ['location_id','location_group_id','start_pickup_drop_off_window','end_pickup_drop_off_window','pickup_booking_rule_id','drop_off_booking_rule_id']) reject(`rejects flexible ${key}`,i=>addColumn(i,'stop_times.txt',key,'x'),new RegExp(key));
for(const key of ['block_id','safe_duration_factor','safe_duration_offset']) reject(`rejects selected ${key}`,i=>addColumn(i,'trips.txt',key,'1'),new RegExp(key));
for(const value of ['0','1']) reject(`rejects selected frequencies exact_times=${value}`,i=>i.files['frequencies.txt']=`trip_id,start_time,end_time,headway_secs,exact_times\nloop,23:40:00,25:40:00,600,${value}\n`,/frequency service/);
for(const value of ['0','1','2','3','4','5']) reject(`rejects transfer rule type=${value}`,i=>i.files['transfers.txt']=`from_stop_id,to_stop_id,transfer_type\nA,P,${value}\n`,/transfers.txt rules/);
reject('rejects timezone mismatch',i=>i.template.timeZone='UTC',/exactly match/);
reject('rejects invalid timezone',i=>i.template.timeZone='Not/A_Zone',/recognized timezone/);
reject('rejects missing agency reference',i=>change(i,'routes.txt','R,DEMO,','R,UNKNOWN,'),/known agency/);
reject('rejects unknown clock basis',i=>i.template.timeBasis='wall-clock',/timeBasis/);
reject('rejects absent clock basis',i=>delete i.template.timeBasis,/timeBasis/);
reject('rejects station as pantry',i=>{addColumn(i,'stops.txt','location_type',row=>row.startsWith('P,')?'1':'0');},/location_type/);
reject('rejects station as origin',i=>{addColumn(i,'stops.txt','location_type',row=>row.startsWith('U,')?'1':'0');i.template.origins[0].stopId='U';},/location_type/);
reject('rejects unknown template stop',i=>i.template.pantryStop='UNKNOWN',/unknown exact stop/);
reject('rejects malformed origin constraints through model',i=>i.template.origins[0].homeBy=-1,/homeBy/);
reject('rejects unknown template settings instead of silently losing intent',i=>i.template.settings.wheelchairOnly=true,/unsupported field/);
reject('rejects oversized IDs without truncation',i=>i.files['trips.txt']=i.files['trips.txt'].replace('loop','x'.repeat(81)),/at most 80/);
reject('rejects whitespace identifiers without trim',i=>i.files['trips.txt']=i.files['trips.txt'].replace('loop',' loop'),/edge whitespace/);
reject('rejects controls in even ignored description fields',i=>addColumn(i,'stops.txt','stop_desc','tab\tvalue'),/control characters/);
reject('rejects malformed Unicode input',i=>i.files['trips.txt']+='\ud800',/valid UTF-8/);
reject('rejects file byte limit',i=>i.files['feed_info.txt']='x'.repeat(GTFS_LIMITS.fileBytes+1),/byte limit/);
reject('rejects cell limit',i=>change(i,'trips.txt','loop','x'.repeat(GTFS_LIMITS.cellCharacters+1)),/cell limit/);

async function temp(t) {const dir=await mkdtemp(join(root,'.gtfs-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function fixtureIn(dir,i=input()) {
  await mkdir(join(dir,'feed'));
  for(const [name,text] of Object.entries(i.files)) await writeFile(join(dir,'feed',name),text);
  await writeFile(join(dir,'template.json'),JSON.stringify(i.template));
}
function cli(dir,extra=[]) {
  return spawnSync(process.execPath,['scripts/import-gtfs-subset.mjs','--feed',join(dir,'feed'),'--date','2026-11-12','--route','R','--template',join(dir,'template.json'),'--out',join(dir,'out'),...extra],{cwd:root,encoding:'utf8'});
}

test('CLI produces exact browser-importable pair and byte hashes without leaking paths',async t=>{
  const dir=await temp(t);await fixtureIn(dir);const result=cli(dir);
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual((await readdir(join(dir,'out'))).sort(),['receipt.json','scenario.json']);
  const scenario=await readFile(join(dir,'out/scenario.json'),'utf8'),receipt=JSON.parse(await readFile(join(dir,'out/receipt.json'),'utf8'));
  assert.equal(receipt.output.sha256,digest(scenario));assert.deepEqual(parseScenarioJson(scenario),adaptGtfsSubset(input()).scenario);
  assert.equal(receipt.templateInput.sha256,digest(await readFile(join(dir,'template.json'))));
  assert.ok(!JSON.stringify(receipt).includes(dir));assert.ok(!result.stdout.includes(dir));
  assert.equal(await readFile(join(dir,'feed/stop_times.txt'),'utf8'),original['stop_times.txt']);
});

test('CLI never overwrites existing output directory',async t=>{
  const dir=await temp(t);await fixtureIn(dir);assert.equal(cli(dir).status,0);
  const before=await readFile(join(dir,'out/scenario.json'),'utf8');const result=cli(dir);
  assert.equal(result.status,1);assert.match(result.stderr,/EEXIST/);assert.equal(await readFile(join(dir,'out/scenario.json'),'utf8'),before);
});

test('CLI validates before creating output',async t=>{
  const dir=await temp(t),i=input();addColumn(i,'stop_times.txt','pickup_type','1');await fixtureIn(dir,i);
  const result=cli(dir);assert.equal(result.status,1);assert.match(result.stderr,/pickup_type/);
  await assert.rejects(access(join(dir,'out')));
});

test('CLI rejects symlinked feed member without creating output',async t=>{
  const dir=await temp(t);await fixtureIn(dir);await rm(join(dir,'feed/stops.txt'));await writeFile(join(dir,'real-stops.txt'),original['stops.txt']);
  await symlink(join(dir,'real-stops.txt'),join(dir,'feed/stops.txt'));
  const result=cli(dir);assert.equal(result.status,1);assert.match(result.stderr,/symlink/);await assert.rejects(access(join(dir,'out')));
});

test('CLI rejects malformed UTF-8 rather than replacement decoding',async t=>{
  const dir=await temp(t);await fixtureIn(dir);await writeFile(join(dir,'feed/stops.txt'),Buffer.from([0xff]));
  const result=cli(dir);assert.equal(result.status,1);await assert.rejects(access(join(dir,'out')));
});

test('CLI rejects unknown flags and does not echo paths',async t=>{
  const dir=await temp(t);await fixtureIn(dir);const result=cli(dir,['--overwrite','yes']);
  assert.equal(result.status,1);assert.match(result.stderr,/Usage/);assert.ok(!result.stderr.includes(dir));await assert.rejects(access(join(dir,'out')));
});

test('committed synthetic expected scenario and receipt match reproducible CLI output',async t=>{
  const dir=await temp(t);
  const result=spawnSync(process.execPath,['scripts/import-gtfs-subset.mjs','--feed',join(fixture,'feed'),'--date','2026-11-12','--route','R','--template',join(fixture,'template.json'),'--out',join(dir,'out')],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  for(const file of ['scenario.json','receipt.json']) assert.equal(await readFile(join(dir,'out',file),'utf8'),await readFile(join(fixture,'expected',file),'utf8'));
});
