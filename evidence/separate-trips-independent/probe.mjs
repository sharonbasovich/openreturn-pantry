import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,mkdir,writeFile,access,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(process.argv[2]||'.');
const baseline=process.argv[3]?resolve(process.argv[3]):null;
const load=(dir,name)=>import(pathToFileURL(join(dir,'src',name)));
const {adaptGtfsSubset:adapt}=await load(root,'gtfs-subset.mjs');
const old=baseline?(await load(baseline,'gtfs-subset.mjs')).adaptGtfsSubset:null;
const {verifyGtfsReceipt:verify}=await load(root,'verify-gtfs-receipt.mjs');
const {exportScenarioJson}=await load(root,'import.mjs');
const {evaluateWindow}=await load(root,'model.mjs');
const fix=join(root,'tests/fixtures/gtfs-synthetic');
const files=Object.fromEntries(await Promise.all((await readdir(join(fix,'feed'))).map(async n=>[n,await readFile(join(fix,'feed',n),'utf8')])));
const template=JSON.parse(await readFile(join(fix,'template.json'),'utf8'));
const input=()=>({files:structuredClone(files),template:structuredClone(template),serviceDay:'2026-11-12',routeIds:['R']});
let checks=0,compatibility=0;
function check(fn){fn();checks++;}
function outcome(fn){try{return {result:fn()}}catch(e){return {error:e.message}}}
// Bounded matrix compares complete receipt/scenario objects or exact rejection text.
if(old) for(const date of ['2026-11-12','2026-11-13','2026-11-14','bad-date'])for(const scope of ['route','loop','return','removed','unknown'])for(const restriction of ['none','block','transfers','pickup','frequency','extra-file']){
 const i=input();i.serviceDay=date;if(scope!=='route'){delete i.routeIds;i.tripIds=[scope]}
 if(restriction==='block')i.files['trips.txt']=i.files['trips.txt'].trimEnd().split('\n').map((s,n)=>s+','+(n?'B':'block_id')).join('\n')+'\n';
 if(restriction==='transfers')i.files['transfers.txt']='transfer_type\n3\n';
 if(restriction==='pickup')i.files['stop_times.txt']=i.files['stop_times.txt'].trimEnd().split('\n').map((s,n)=>s+','+(n?'1':'pickup_type')).join('\n')+'\n';
 if(restriction==='frequency')i.files['frequencies.txt']='trip_id,start_time,end_time,headway_secs\nloop,01:00:00,02:00:00,60\n';
 if(restriction==='extra-file')i.files['pathways.txt']='pathway_id\nx\n';
 check(()=>assert.deepEqual(outcome(()=>adapt(i)),outcome(()=>old(i))));compatibility++;
}
const sep=()=>{const i=input();i.blockPolicy='separate-trips';i.files['trips.txt']='route_id,service_id,trip_id,block_id\nR,DAILY,loop,B\nR,EXTRA,return,B\nR,REMOVED,removed,B\n';return i};
const p=sep();delete p.routeIds;p.tripIds=['loop'];p.files['trips.txt']+='R,EXTRA,outside,B\nR,REMOVED,inactive-outside,B\nR,DAILY,unrelated,U\n';
const projected=adapt(p),members=projected.receipt.blockProjection.touchedBlocks[0].members;
check(()=>assert.deepEqual(projected.scenario.connections.map(c=>c.tripId),['loop','loop','loop']));
check(()=>assert.deepEqual(members.map(m=>[m.tripId,m.active,m.selected,m.inScope,m.omissionReason]),[['inactive-outside',false,false,false,'inactive-on-service-day'],['loop',true,true,true,null],['outside',true,false,false,'outside-selected-scope'],['removed',false,false,false,'inactive-on-service-day'],['return',true,false,false,'outside-selected-scope']]));
check(()=>assert.deepEqual(projected.receipt.services.map(s=>[s.serviceId,s.exception,s.active]),[['DAILY',null,true],['EXTRA','added',true],['REMOVED','removed',false]]));
check(()=>assert.deepEqual(projected.receipt.blockProjection.touchedBlocks.map(b=>b.blockId),['B']));
for(const bad of [' x','x ','x\t','x'.repeat(81)]){const i=sep();i.files['trips.txt']+=`R,REMOVED,unselected,${bad}\n`;check(()=>assert.throws(()=>adapt(i)))}
// Real source IDs remain distinct even when block IDs equal another trip's ID.
{const i=sep();i.files['trips.txt']=i.files['trips.txt'].replaceAll(',B\n',',loop\n');check(()=>assert.deepEqual(adapt(i).scenario,adapt({...i,files,blockPolicy:'reject-blocks'}).scenario))}
function pair(i){const templateText=JSON.stringify(i.template);const a=adapt(i);a.receipt.templateInput={bytes:Buffer.byteLength(templateText),sha256:createHash('sha256').update(templateText).digest('hex')};return {files:i.files,templateText,receiptText:JSON.stringify(a.receipt),scenarioText:exportScenarioJson(a.scenario)+'\n'}}
check(()=>assert.equal(verify(pair(input())).receiptVersion,1));
const pair0=pair(p);check(()=>assert.equal(verify(pair0).ok,true));
for(const mutate of [r=>r.blockProjection.policy='reject-blocks',r=>r.version=1,r=>r.adapterVersion='1.0.0',r=>r.version=3,r=>delete r.blockProjection,r=>r.blockProjection.touchedBlocks[0].members[0].omissionReason='outside-selected-scope',r=>r.blockProjection.touchedBlocks[0].members[0].inScope=true,r=>r.blockProjection.touchedBlocks[0].members[0].serviceId='DAILY',r=>r.blockProjection.touchedBlocks[0].members.push(r.blockProjection.touchedBlocks[0].members[0]),r=>r.blockProjection.selectedTripBlocks[0].tripId='return',r=>r.services[0].active=false,r=>r.services.pop(),r=>r.extra='untrusted']){
 const r=JSON.parse(pair0.receiptText);mutate(r);check(()=>assert.throws(()=>verify({...pair0,receiptText:JSON.stringify(r)})));
}
for(const type of [0,1,2,3,4,5]){const i=sep();i.files['transfers.txt']=`from_trip_id,to_trip_id,transfer_type\nloop,return,${type}\n`;check(()=>assert.throws(()=>adapt(i)))}
for(const field of ['pickup_type','drop_off_type','pickup_booking_rule_id','continuous_pickup','continuous_drop_off']){const i=sep();i.files['stop_times.txt']=i.files['stop_times.txt'].trimEnd().split('\n').map((s,n)=>s+','+(n?'2':field)).join('\n')+'\n';check(()=>assert.throws(()=>adapt(i)))}
for(const [buffer,transfers,crossStop,expected] of [[0,0,false,0],[0,1,false,1],[1,1,false,0],[0,3,true,0],[10,3,false,0]]){
 const i=sep();i.template.settings.transferMinutes=buffer;i.template.settings.maxTransfers=transfers;i.files['trips.txt']='route_id,service_id,trip_id,block_id\nR,DAILY,first,B\nR,DAILY,next,B\nR,DAILY,back,B\n';
 i.files['stop_times.txt']=`trip_id,arrival_time,departure_time,stop_id,stop_sequence\nfirst,23:40:00,23:40:00,A,1\nfirst,23:50:00,23:50:00,X,2\nnext,23:50:00,23:50:00,${crossStop?'Z':'X'},1\nnext,24:10:00,24:10:00,P,2\nback,24:40:00,24:40:00,P,1\nback,24:55:00,24:55:00,A,2\n`;
 if(crossStop)i.files['stops.txt']+='Z,Other exact stop,40,-74\n';
 check(()=>assert.equal(evaluateWindow(adapt(i).scenario,1450).reachable,expected));
}
// Portable CLI end-to-end: all generated data synthetic; clean temp directory.
const dir=await mkdtemp(join(tmpdir(),'openreturn-independent-'));try{
 await mkdir(join(dir,'feed'));for(const [n,s] of Object.entries(sep().files))await writeFile(join(dir,'feed',n),s);await writeFile(join(dir,'template.json'),JSON.stringify(template));
 const cli=(name,args)=>spawnSync(process.execPath,[join(root,'scripts',name),...args],{encoding:'utf8',timeout:30000});
 const args=['--feed',join(dir,'feed'),'--date','2026-11-12','--route','R','--template',join(dir,'template.json'),'--out',join(dir,'out')];
 check(()=>assert.equal(cli('import-gtfs-subset.mjs',args).status,1));await assert.rejects(access(join(dir,'out')));checks++;
 const r=cli('import-gtfs-subset.mjs',[...args,'--block-policy','separate-trips']);check(()=>assert.equal(r.status,0,r.stderr));
 const before=await readFile(join(dir,'out/receipt.json'),'utf8');check(()=>assert.equal(cli('import-gtfs-subset.mjs',[...args,'--block-policy','separate-trips']).status,1));assert.equal(await readFile(join(dir,'out/receipt.json'),'utf8'),before);checks++;
 check(()=>assert.equal(cli('verify-gtfs-receipt.mjs',['--feed',join(dir,'feed'),'--template',join(dir,'template.json'),'--scenario',join(dir,'out/scenario.json'),'--receipt',join(dir,'out/receipt.json')]).status,0));
 check(()=>assert.equal(cli('decision-sheet.mjs',[join(dir,'out/scenario.json')]).status,0));
 // Oversized provenance must be rejected before an output directory exists.
 await writeFile(join(dir,'feed/trips.txt'),sep().files['trips.txt']+Array.from({length:20000},(_,n)=>`R,REMOVED,long-member-${n},B`).join('\n')+'\n');
 const oversized=args.map(x=>x===join(dir,'out')?join(dir,'large-out'):x);
 const tooLarge=cli('import-gtfs-subset.mjs',[...oversized,'--block-policy','separate-trips']);check(()=>assert.equal(tooLarge.status,1));check(()=>assert.match(tooLarge.stderr,/INVALID_JSON_INPUT/));await assert.rejects(access(join(dir,'large-out')));checks++;
}finally{await rm(dir,{recursive:true,force:true})}
console.log(JSON.stringify({passed:checks,legacyComparisonCases:compatibility,legacyComparisonSkipped:old?0:120,syntheticOnly:true}));
