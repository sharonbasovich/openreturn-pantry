import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,writeFile,mkdir,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {adaptGtfsSubset,GTFS_LIMITS} from '../src/gtfs-subset.mjs';
import {verifyGtfsReceipt} from '../src/verify-gtfs-receipt.mjs';
import {exportScenarioJson} from '../src/import.mjs';
import {evaluateWindow} from '../src/model.mjs';
const fixture=new URL('./fixtures/gtfs-synthetic/',import.meta.url);
const templateText=await readFile(new URL('template.json',fixture),'utf8');
const original=Object.fromEntries(await Promise.all((await readdir(new URL('feed/',fixture))).map(async n=>[n,await readFile(new URL('feed/'+n,fixture),'utf8')])));
function input(){return {files:{...original,'trips.txt':'route_id,service_id,trip_id,block_id\nR,DAILY,loop,B\nR,EXTRA,return,B\nR,REMOVED,removed,B\n'},serviceDay:'2026-11-12',routeIds:['R'],template:JSON.parse(templateText),blockPolicy:'separate-trips'};}
function pair(i){const {scenario,receipt}=adaptGtfsSubset(i);receipt.templateInput={bytes:Buffer.byteLength(templateText),sha256:createHash('sha256').update(templateText).digest('hex')};return {files:i.files,templateText,scenarioText:exportScenarioJson(scenario)+'\n',receiptText:JSON.stringify(receipt)};}
function cli(script,args){return spawnSync(process.execPath,[new URL('../scripts/'+script,import.meta.url).pathname,...args],{encoding:'utf8',timeout:30000});}
async function setup(t,i=input()){const dir=await mkdtemp(join(tmpdir(),'gtfs-separate-'));t.after(()=>rm(dir,{recursive:true,force:true}));await mkdir(join(dir,'feed'));for(const [name,text] of Object.entries(i.files))await writeFile(join(dir,'feed',name),text);await writeFile(join(dir,'template.json'),templateText);return dir;}
function generate(dir,extra=['--block-policy','separate-trips']){return cli('import-gtfs-subset.mjs',['--feed',join(dir,'feed'),'--date','2026-11-12','--route','R','--template',join(dir,'template.json'),'--out',join(dir,'out'),...extra]);}
test('explicit separate mode preserves exact trip identities and every adjacent leg, default still rejects blocks',()=>{
 const i=input(),before=structuredClone(i),a=adaptGtfsSubset(i);assert.deepEqual(i,before);assert.deepEqual(a,adaptGtfsSubset(i));
 assert.equal(a.receipt.version,2);assert.equal(a.receipt.adapterVersion,'1.1.0');assert.equal(a.receipt.blockProjection.policy,'separate-trips');
 assert.deepEqual(a.scenario,adaptGtfsSubset({...i,files:original,blockPolicy:'reject-blocks'}).scenario);
 assert.deepEqual(a.receipt.blockProjection.selectedTripBlocks,[{tripId:'loop',blockId:'B'},{tripId:'return',blockId:'B'}]);
 assert.deepEqual(a.receipt.blockProjection.touchedBlocks[0].members.map(m=>[m.tripId,m.active,m.selected,m.inScope]),[['loop',true,true,true],['removed',false,false,true],['return',true,true,true]]);
 delete i.blockPolicy;assert.throws(()=>adaptGtfsSubset(i),/block_id/);
 for(const blockPolicy of [null,'',false,'join-blocks'])assert.throws(()=>adaptGtfsSubset({...i,blockPolicy}),/blockPolicy/);
});
test('trip scope includes active and inactive out-of-scope partners and service exceptions but no extra legs',()=>{
 const i=input();delete i.routeIds;i.tripIds=['loop'];const {scenario,receipt:r}=adaptGtfsSubset(i);assert.equal(scenario.connections.length,3);
 assert.deepEqual(r.blockProjection.touchedBlocks[0].members.map(m=>[m.tripId,m.active,m.selected,m.inScope]),[['loop',true,true,true],['removed',false,false,false],['return',true,false,false]]);
 assert.equal(r.services.find(s=>s.serviceId==='EXTRA').exception,'added');assert.equal(r.services.find(s=>s.serviceId==='REMOVED').exception,'removed');
 i.tripIds=['removed'];assert.throws(()=>adaptGtfsSubset(i),/inactive/);
});
test('route scope includes out-of-route membership, blank IDs, singleton blocks and no unrelated block evidence',()=>{
 const i=input();i.files['routes.txt']+=i.files['routes.txt'].split('\n')[1].replace(/^R,/, 'OTHER,')+'\n';
 i.files['trips.txt']+='OTHER,DAILY,outside,B\nOTHER,REMOVED,unrelated,OTHERBLOCK\n';
 const r=adaptGtfsSubset(i).receipt;assert.equal(r.blockProjection.touchedBlocks.length,1);assert.ok(r.blockProjection.touchedBlocks[0].members.some(m=>m.tripId==='outside'&&!m.inScope&&m.active));
 i.files['trips.txt']=i.files['trips.txt'].replace('return,B','return,').replace('loop,B','loop,Single');
 const p=adaptGtfsSubset(i).receipt.blockProjection;assert.equal(p.selectedTripBlocks[1].blockId,null);assert.equal(p.touchedBlocks[0].members.length,1);
});
for(const id of [' spaced','spaced ','x'.repeat(81),'bad\tkey','\ud800'])test(`malformed block ID rejected ${JSON.stringify(id)}`,()=>{const i=input();i.files['trips.txt']=i.files['trips.txt'].replaceAll(',B\n',','+id+'\n');assert.throws(()=>adaptGtfsSubset(i));});
test('block option cannot bypass transfers, frequency, boarding or safe-duration restrictions',()=>{
 for(const modify of [i=>i.files['transfers.txt']='transfer_type\n0\n',i=>i.files['frequencies.txt']='trip_id,start_time,end_time,headway_secs\nloop,01:00:00,02:00:00,60\n',i=>i.files['stop_times.txt']=i.files['stop_times.txt'].trimEnd().split('\n').map((r,n)=>r+','+(n?'1':'pickup_type')).join('\n')+'\n',i=>i.files['trips.txt']=i.files['trips.txt'].replace('block_id','safe_duration_factor')]){const i=input();modify(i);assert.throws(()=>adaptGtfsSubset(i));}
});
test('same-block distinct trips never receive in-seat buffer or transfer-count exemptions',()=>{
 const i=input();i.files['trips.txt']='route_id,service_id,trip_id,block_id\nR,DAILY,first,B\nR,DAILY,second,B\nR,DAILY,back,B\n';
 i.files['stop_times.txt']='trip_id,arrival_time,departure_time,stop_id,stop_sequence\nfirst,23:40:00,23:40:00,A,1\nfirst,23:50:00,23:50:00,X,2\nsecond,23:50:00,23:50:00,X,1\nsecond,24:10:00,24:10:00,P,2\nback,24:40:00,24:40:00,P,1\nback,24:55:00,24:55:00,A,2\n';
 for(const [buffer,maxTransfers,expected] of [[10,2,0],[0,0,0],[0,1,1]]){i.template.settings.transferMinutes=buffer;i.template.settings.maxTransfers=maxTransfers;assert.equal(evaluateWindow(adaptGtfsSubset(i).scenario,1450).reachable,expected);}
});
test('v2 replay and tamper rejection cover policy/version pairing and exhaustive membership',()=>{
 const p=pair(input());assert.equal(verifyGtfsReceipt(p).receiptVersion,2);
 for(const mutate of [r=>delete r.blockProjection,r=>r.blockProjection.policy='reject-blocks',r=>r.version=1,r=>r.adapterVersion='1.0.0',r=>r.blockProjection.touchedBlocks[0].members.pop(),r=>r.blockProjection.touchedBlocks[0].members[0].active=false,r=>r.blockProjection.selectedTripBlocks[0].blockId='other',r=>r.services.pop(),r=>r.limitations.pop()]){const r=JSON.parse(p.receiptText);mutate(r);assert.throws(()=>verifyGtfsReceipt({...p,receiptText:JSON.stringify(r)}));}
 const legacy=pair({...input(),files:original,blockPolicy:'reject-blocks'});assert.equal(verifyGtfsReceipt(legacy).receiptVersion,1);
 const forged=JSON.parse(p.receiptText);forged.version=1;forged.adapterVersion='1.0.0';delete forged.blockProjection;assert.throws(()=>verifyGtfsReceipt({...p,receiptText:JSON.stringify(forged)}),/REPLAY_REJECTED/);
});
test('CLI import → replay → report, fresh directory/no overwrite and no source changes',async t=>{
 const i=input(),dir=await setup(t,i);let result=generate(dir);assert.equal(result.status,0,result.stderr);
 result=cli('verify-gtfs-receipt.mjs',['--feed',join(dir,'feed'),'--template',join(dir,'template.json'),'--scenario',join(dir,'out/scenario.json'),'--receipt',join(dir,'out/receipt.json')]);assert.equal(result.status,0,result.stdout);assert.equal(JSON.parse(result.stdout).receiptVersion,2);
 result=cli('decision-sheet.mjs',[join(dir,'out/scenario.json')]);assert.equal(result.status,0,result.stderr);
 const before=await readFile(join(dir,'out/receipt.json'),'utf8');assert.equal(generate(dir).status,1);assert.equal(await readFile(join(dir,'out/receipt.json'),'utf8'),before);
 for(const [name,text] of Object.entries(i.files))assert.equal(await readFile(join(dir,'feed',name),'utf8'),text);
});
test('CLI policy errors and nonempty transfers reject all-or-nothing',async t=>{
 const dir=await setup(t);for(const extra of [[],['--block-policy','invented'],['--block-policy','separate-trips','--block-policy','separate-trips']]){assert.equal(generate(dir,extra).status,1);await assert.rejects(access(join(dir,'out')));}
 await writeFile(join(dir,'feed/transfers.txt'),'transfer_type\n0\n');assert.equal(generate(dir).status,1);await assert.rejects(access(join(dir,'out')));
});
test('source byte and oversized full membership receipt limits fail without trimming or output',async t=>{
 const i=input();assert.throws(()=>adaptGtfsSubset({...i,files:{...i.files,'shapes.txt':'x'.repeat(GTFS_LIMITS.fileBytes+1)}}),/byte limit/);
 i.files['trips.txt']+=Array.from({length:20000},(_,n)=>`R,REMOVED,member${n},B`).join('\n')+'\n';
 const r=adaptGtfsSubset(i).receipt;assert.equal(r.blockProjection.touchedBlocks[0].members.length,20003);assert.ok(Buffer.byteLength(JSON.stringify(r,null,2))>4_000_000);
 const dir=await setup(t,i),result=generate(dir);assert.equal(result.status,1);assert.match(result.stderr,/INVALID_JSON_INPUT/);await assert.rejects(access(join(dir,'out')));
});
