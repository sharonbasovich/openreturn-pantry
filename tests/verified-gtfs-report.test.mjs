import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,cp,writeFile,rm,symlink,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildVerifiedGtfsReport} from '../src/verified-gtfs-report.mjs';
import {adaptGtfsSubset} from '../src/gtfs-subset.mjs';
import {exportScenarioJson} from '../src/import.mjs';
const fixture=new URL('./fixtures/gtfs-synthetic/',import.meta.url);
const files=Object.fromEntries(await Promise.all((await readdir(new URL('feed/',fixture))).map(async n=>[n,await readFile(new URL('feed/'+n,fixture),'utf8')])));
const input={files,scenarioText:await readFile(new URL('expected/scenario.json',fixture),'utf8'),receiptText:await readFile(new URL('expected/receipt.json',fixture),'utf8'),templateText:await readFile(new URL('template.json',fixture),'utf8')};
const hash=text=>createHash('sha256').update(text).digest('hex');
const cli=new URL('../scripts/verified-gtfs-report.mjs',import.meta.url).pathname;
const oldCli=new URL('../scripts/decision-sheet.mjs',import.meta.url).pathname;
function args(root){return ['--scenario',join(root,'expected/scenario.json'),'--receipt',join(root,'expected/receipt.json'),'--feed',join(root,'feed'),'--template',join(root,'template.json')];}
function run(root,extra=[],pre=[]){return spawnSync(process.execPath,[...pre,cli,...args(root),...extra],{encoding:'utf8',timeout:30000});}
async function setup(t){const root=await mkdtemp(join(tmpdir(),'verified-report-private-'));t.after(()=>rm(root,{recursive:true,force:true}));await cp(fixture,root,{recursive:true});return root;}
function v2(){const changed={...files,'trips.txt':'route_id,service_id,trip_id,block_id\nR,DAILY,loop,B\nR,EXTRA,return,B\nR,REMOVED,removed,B\n'};const {scenario,receipt}=adaptGtfsSubset({files:changed,template:JSON.parse(input.templateText),serviceDay:'2026-11-12',routeIds:['R'],blockPolicy:'separate-trips'});receipt.templateInput={bytes:Buffer.byteLength(input.templateText),sha256:hash(input.templateText)};return {...input,files:changed,scenarioText:exportScenarioJson(scenario)+'\n',receiptText:JSON.stringify(receipt)};}
for(const [label,p] of [['v1',input],['v2',v2()]])test(`${label}: full replay report has exact legacy CLI body and bound hashes`,async t=>{
 const root=await setup(t);await writeFile(join(root,'expected/scenario.json'),p.scenarioText);await writeFile(join(root,'expected/receipt.json'),p.receiptText);for(const [name,value] of Object.entries(p.files))await writeFile(join(root,'feed',name),value);
 const before=JSON.stringify(p),report=buildVerifiedGtfsReport(p);assert.equal(JSON.stringify(p),before);
 const result=run(root);assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');assert.equal(result.stdout,report+'\n');
 const baseline=spawnSync(process.execPath,[oldCli,join(root,'expected/scenario.json')],{encoding:'utf8'});assert.equal(baseline.status,0);assert.equal(result.stdout.slice(result.stdout.indexOf('OPENRETURN / DECISION SHEET')),baseline.stdout);
 assert.ok(report.includes(hash(p.scenarioText)));assert.ok(report.includes(hash(p.receiptText)));assert.match(report,/not independently authenticated/);const metadata=JSON.parse(p.receiptText);assert.ok(report.includes('Replayed agency timezone: '+JSON.stringify(metadata.timeZone)));assert.ok(report.includes('Replayed time basis: '+JSON.stringify(metadata.timeBasis)));assert.match(report,/Receipt-declared service day: 2026-11-12/);assert.match(report,/routeIds \["R"\]/);
 assert.match(report,label==='v2'?/LOSSY SEPARATE-TRIPS POLICY/:/Block policy: reject-blocks/);
 const reformatted={...p,receiptText:JSON.stringify(JSON.parse(p.receiptText),null,3)};assert.ok(buildVerifiedGtfsReport(reformatted).includes(hash(reformatted.receiptText)));
});
for(const [name,change] of Object.entries({
 scenario:p=>p.scenarioText+=' ',receipt:p=>{const r=JSON.parse(p.receiptText);r.connectionMap[0].fromStopSequence++;p.receiptText=JSON.stringify(r);},
 template:p=>p.templateText+=' ',source:p=>p.files['agency.txt']+='\n',missing:p=>delete p.files['stops.txt'],
 duplicate:p=>p.receiptText=p.receiptText.replace('"format":','"version":1,"version":1,"format":'),
 policy:p=>{const r=JSON.parse(p.receiptText);r.blockProjection.policy='reject-blocks';p.receiptText=JSON.stringify(r);},
 membership:p=>{const r=JSON.parse(p.receiptText);r.blockProjection.touchedBlocks[0].members.pop();p.receiptText=JSON.stringify(r);}
}))test(`report rejects ${name} tampering`,()=>{const p=structuredClone(v2());change(p);assert.throws(()=>buildVerifiedGtfsReport(p));});
test('captured scenario string is read from caller once and used for both replay and report',()=>{
 let reads=0;const p={...input};Object.defineProperty(p,'scenarioText',{get(){reads++;return reads===1?input.scenarioText:'secret invalid replacement';}});
 assert.ok(buildVerifiedGtfsReport(p).includes(hash(input.scenarioText)));assert.equal(reads,1);
});
test('CLI reads each input once: replacing scenario after read cannot change report body or digest',async t=>{
 const root=await setup(t),preload=join(root,'preload.mjs'),log=join(root,'reads.jsonl'),scenario=join(root,'expected/scenario.json');
 // Instrument only this subprocess. Replace the file after its captured read closes.
 await writeFile(preload,`import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';\nconst original=fs.open;fs.open=async function(path,...args){await fs.appendFile(${JSON.stringify(log)},JSON.stringify(path)+'\\n');const h=await original.call(this,path,...args);if(path===${JSON.stringify(scenario)}){const close=h.close.bind(h);h.close=async()=>{await close();await fs.writeFile(path,'private replacement not JSON');};}return h;};syncBuiltinESMExports();`);
 const result=run(root,[],['--import',preload]);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,buildVerifiedGtfsReport(input)+'\n');assert.equal(await readFile(scenario,'utf8'),'private replacement not JSON');
 const reads=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(reads.length,Object.keys(files).length+3);assert.equal(new Set(reads).size,reads.length);
});
test('CLI failures emit no report bytes and only sanitized fixed-code stderr',async t=>{
 const root=await setup(t);const failed=result=>{assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/^\{"ok":false,"error":"[A-Z0-9_]+"\}\n$/);assert.ok(!result.stderr.includes(root));assert.ok(!result.stderr.includes('private-residential'));};
 failed(run(root,['--receipt','private-residential']));
 for(const bytes of [Buffer.from([255]),Buffer.alloc(4_000_001,32),Buffer.from('{"private-residential":'),Buffer.from(input.receiptText.replace('"version": 1','"version": 99'))]){await writeFile(join(root,'expected/receipt.json'),bytes);failed(run(root));}
 await writeFile(join(root,'expected/receipt.json'),input.receiptText);
 await writeFile(join(root,'expected/scenario.json'),input.scenarioText+' ');failed(run(root));await writeFile(join(root,'expected/scenario.json'),input.scenarioText);
 await rm(join(root,'template.json'));failed(run(root));await symlink(new URL('template.json',fixture).pathname,join(root,'template.json'));failed(run(root));await rm(join(root,'template.json'));await mkdir(join(root,'template.json'));failed(run(root));await rm(join(root,'template.json'),{recursive:true});await writeFile(join(root,'template.json'),input.templateText);
 await writeFile(join(root,'feed/private-residential.txt'),'private-residential');failed(run(root));await rm(join(root,'feed/private-residential.txt'));
 await rm(join(root,'feed/agency.txt'));await symlink(new URL('feed/agency.txt',fixture).pathname,join(root,'feed/agency.txt'));failed(run(root));
});
