import test, {after} from 'node:test';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,mkdir,readdir,symlink,stat,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {makeFiles,makeTemplate} from './independent-fixture.mjs';
const source=process.env.REVIEW_SOURCE ? resolve(process.env.REVIEW_SOURCE) : fileURLToPath(new URL('../../',import.meta.url));
const cli=join(source,'scripts/import-gtfs-subset.mjs');
const evidence=await mkdtemp(join(tmpdir(),'openreturn-gtfs-independent-'));
after(()=>rm(evidence,{recursive:true,force:true}));
const sha=b=>createHash('sha256').update(b).digest('hex');
function template(){const x=makeTemplate();return {title:x.title,timeZone:'Etc/UTC',timeBasis:'gtfs-service-day-minutes',pantryStop:x.pantryStop,origins:x.origins,settings:x.settings};}
async function fixture(t,name){const root=await mkdtemp(join(evidence,name+'-')), feed=join(root,'feed'),out=join(root,'out'),tpl=join(root,'template.json');await mkdir(feed);for(const [k,v] of Object.entries(makeFiles()))await writeFile(join(feed,k),v);await writeFile(tpl,JSON.stringify(template(),null,2)+'\n');return {root,feed,out,tpl};}
const args=f=>['--feed',f.feed,'--date','2026-11-08','--route','R','--template',f.tpl,'--out',f.out];
const run=(f,more=[])=>spawnSync(process.execPath,[cli,...args(f),...more],{encoding:'utf8',timeout:10_000});
const absent=async path=>assert.rejects(stat(path),{code:'ENOENT'});

test('CLI creates two portable files; every input, template and output byte hash independently matches',async t=>{
 const f=await fixture(t,'happy'),result=run(f);assert.equal(result.status,0,result.stderr);assert.deepEqual((await readdir(f.out)).sort(),['receipt.json','scenario.json']);
 const receipt=JSON.parse(await readFile(join(f.out,'receipt.json'),'utf8')),scenario=await readFile(join(f.out,'scenario.json'));
 assert.equal(receipt.output.sha256,sha(scenario));assert.equal(receipt.output.bytes,scenario.length);
 for(const item of receipt.inputs){const actual=await readFile(join(f.feed,item.file));assert.equal(item.sha256,sha(actual));assert.equal(item.bytes,actual.length);}
 const tpl=await readFile(f.tpl);assert.equal(receipt.templateInput.sha256,sha(tpl));assert.equal(receipt.templateInput.bytes,tpl.length);
 const text=await readFile(join(f.out,'receipt.json'),'utf8');assert.ok(!text.includes(f.root));assert.ok(!text.includes('generatedAt'));
 const repeat={...f,out:join(f.root,'repeat')};assert.equal(run(repeat).status,0);assert.equal(await readFile(join(repeat.out,'receipt.json'),'utf8'),text);assert.deepEqual(await readFile(join(repeat.out,'scenario.json')),scenario);
 await writeFile(join(f.root,'SUCCESS.json'),JSON.stringify({stdout:result.stdout,scenarioSha256:sha(scenario),receiptSha256:sha(text)},null,2)+'\n');
});
test('CLI exact BOM/CRLF byte provenance, without source normalization',async t=>{
 const f=await fixture(t,'bom');for(const name of await readdir(f.feed)){const p=join(f.feed,name);await writeFile(p,'\ufeff'+(await readFile(p,'utf8')).replaceAll('\n','\r\n'));}await writeFile(f.tpl,'\ufeff'+await readFile(f.tpl,'utf8'));
 const r=run(f);assert.equal(r.status,0,r.stderr);const receipt=JSON.parse(await readFile(join(f.out,'receipt.json'),'utf8'));
 for(const item of receipt.inputs){assert.equal(item.sha256,sha(await readFile(join(f.feed,item.file))));}assert.equal(receipt.templateInput.sha256,sha(await readFile(f.tpl)));
});
test('CLI rejects malformed UTF-8 without replacement and creates no output',async t=>{
 const f=await fixture(t,'bad-utf8');await writeFile(join(f.feed,'stops.txt'),Buffer.from([0x73,0x74,0x6f,0x70,0x5f,0x69,0x64,0x0a,0xc3,0x28]));const r=run(f);assert.equal(r.status,1);await absent(f.out);
});
test('CLI rejects invalid template UTF-8 and never touches source files',async t=>{
 const f=await fixture(t,'bad-template');const original=await readFile(join(f.feed,'trips.txt'));await writeFile(f.tpl,Buffer.from([0xff]));assert.equal(run(f).status,1);assert.deepEqual(await readFile(join(f.feed,'trips.txt')),original);await absent(f.out);
});
test('CLI rejects validation failure before output reservation',async t=>{
 const f=await fixture(t,'restriction');let text=await readFile(join(f.feed,'stop_times.txt'),'utf8');text=text.replace('08:05:00','08:05:30');await writeFile(join(f.feed,'stop_times.txt'),text);assert.equal(run(f).status,1);await absent(f.out);
});
test('CLI never overwrites an existing output directory or an input path',async t=>{
 const f=await fixture(t,'existing');await mkdir(f.out);await writeFile(join(f.out,'scenario.json'),'keep me');assert.equal(run(f).status,1);assert.equal(await readFile(join(f.out,'scenario.json'),'utf8'),'keep me');
 const old=await readFile(f.tpl);assert.equal(run({...f,out:f.tpl}).status,1);assert.deepEqual(await readFile(f.tpl),old);
 assert.equal(run({...f,out:f.feed}).status,1);assert.equal((await readdir(f.feed)).length,6);
});
test('CLI rejects input symlinks and symlink feed directories',async t=>{
 const f=await fixture(t,'symlinks');const p=join(f.feed,'stops.txt'),original=await readFile(p);await writeFile(join(f.root,'original-stops.txt'),original);await rm(p);await symlink('../original-stops.txt',p);assert.equal(run(f).status,1);await absent(f.out);
 await rm(p);await writeFile(p,original);await symlink('feed',join(f.root,'feed-link'));assert.equal(run({...f,feed:join(f.root,'feed-link')}).status,1);await absent(f.out);
});
test('CLI rejects unknown nested entries and oversize bytes without creating partial output',async t=>{
 const f=await fixture(t,'limits');await mkdir(join(f.feed,'subfolder'));assert.equal(run(f).status,1);await rm(join(f.feed,'subfolder'),{recursive:true});await writeFile(join(f.feed,'shapes.txt'),'x'.repeat(8_000_001));assert.equal(run(f).status,1);await absent(f.out);
});
test('CLI flags are explicit and invalid combinations do not create output',async t=>{
 const f=await fixture(t,'flags');assert.equal(run(f,['--trip','LOOP']).status,1);assert.equal(run(f,['--date','2026-11-08']).status,1);assert.equal(run(f,['--unknown','x']).status,1);await absent(f.out);
 const r=spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8'});assert.equal(r.status,0);assert.match(r.stdout,/--route/);
});

test('CLI exact quoted comma, quotes and Unicode IDs with BOM retain the whole repeated-stop loop',async t=>{
 const f=await fixture(t,'quoted-ids');const stopMap={A:'A,Ω',B:'B"quoted',P:'P-食'},tripMap={LOOP:'Loop,"Ω',BACK:'Return,食'},route='R,"Ω';
 const files=makeFiles(rows=>{for(const r of rows.stops)r[0]=stopMap[r[0]];for(const r of rows.routes)r[0]=route;for(const r of rows.trips){r[0]=route;r[2]=tripMap[r[2]];}for(const r of rows.stop_times){r[0]=tripMap[r[0]];r[3]=stopMap[r[3]];}});
 for(const [name,text] of Object.entries(files))await writeFile(join(f.feed,name),'\ufeff'+text.replaceAll('\n','\r\n'));
 const tpl=template();tpl.pantryStop=stopMap.P;tpl.origins[0].stopId=stopMap.A;await writeFile(f.tpl,'\ufeff'+JSON.stringify(tpl));
 const argv=args(f);argv[argv.indexOf('--route')+1]=route;const r=spawnSync(process.execPath,[cli,...argv],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const scenario=JSON.parse(await readFile(join(f.out,'scenario.json'),'utf8')),receipt=JSON.parse(await readFile(join(f.out,'receipt.json'),'utf8'));
 assert.deepEqual(scenario.connections.filter(c=>c.tripId===tripMap.LOOP).map(c=>[c.from,c.to,c.departure,c.arrival]),[[stopMap.A,stopMap.B,480,485],[stopMap.B,stopMap.A,488,493],[stopMap.A,stopMap.P,494,499]]);
 for(const item of receipt.inputs)assert.equal(item.sha256,sha(await readFile(join(f.feed,item.file))));assert.equal(receipt.output.sha256,sha(await readFile(join(f.out,'scenario.json'))));
});
