// Portable independent CLI review: node probe.mjs SOURCE_DIRECTORY [BASELINE_DIRECTORY]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]),baseline=process.argv[3]?resolve(process.argv[3]):source;
const load=p=>import(pathToFileURL(join(source,p)));
const {adaptGtfsSubset}=await load('src/gtfs-subset.mjs');
const {exportScenarioJson}=await load('src/import.mjs');
const {buildVerifiedGtfsReport}=await load('src/verified-gtfs-report.mjs');
const fixture=join(source,'tests/fixtures/gtfs-synthetic');
const hash=s=>createHash('sha256').update(s).digest('hex');
const feed=Object.fromEntries(fs.readdirSync(join(fixture,'feed')).map(n=>[n,fs.readFileSync(join(fixture,'feed',n),'utf8')]));
const templateText=fs.readFileSync(join(fixture,'template.json'),'utf8');
let count=0;const results=[];
function record(name){count++;results.push(name);}
function pair(day,kind,policy){const files={...feed};if(policy==='separate-trips')files['trips.txt']='route_id,service_id,trip_id,block_id\nR,DAILY,loop,Shared\nR,EXTRA,return,Shared\nR,REMOVED,removed,Shared\n';const {scenario,receipt}=adaptGtfsSubset({files,template:JSON.parse(templateText),serviceDay:day,[kind]:kind==='routeIds'?['R']:['loop'],blockPolicy:policy});receipt.templateInput={bytes:Buffer.byteLength(templateText),sha256:hash(templateText)};return {files,templateText,scenarioText:exportScenarioJson(scenario)+'\n',receiptText:JSON.stringify(receipt)};}
const root=fs.mkdtempSync(join(tmpdir(),'openreturn-independent-'));
const cli=join(source,'scripts/verified-gtfs-report.mjs');
function install(p){fs.rmSync(root,{recursive:true,force:true});fs.mkdirSync(join(root,'feed'),{recursive:true});for(const [n,s] of Object.entries(p.files))fs.writeFileSync(join(root,'feed',n),s);for(const k of ['scenario','receipt','template'])fs.writeFileSync(join(root,k+'.json'),p[k+'Text']);}
function args(){return ['--scenario',join(root,'scenario.json'),'--receipt',join(root,'receipt.json'),'--template',join(root,'template.json'),'--feed',join(root,'feed')];}
function run(pre=[],extra=[]){return spawnSync(process.execPath,[...pre,cli,...args(),...extra],{encoding:'utf8',timeout:30000,maxBuffer:10_000_000});}
function fail(name,change,expected){install(p);change();const r=run();assert.equal(r.status,1,name+': '+r.stderr);assert.equal(r.stdout,'',name);assert.match(r.stderr,/^\{"ok":false,"error":"[A-Z0-9_]+"\}\n$/);if(expected)assert.equal(JSON.parse(r.stderr).error,expected,name);assert.ok(!r.stderr.includes(root));assert.ok(!r.stderr.includes('PRIVATE_SENTINEL'));record(name);}
const p=pair('2026-11-12','routeIds','separate-trips');
try {
 for(const day of ['2026-11-12','2026-11-13'])for(const kind of ['routeIds','tripIds'])for(const policy of ['reject-blocks','separate-trips']){
  const q=pair(day,kind,policy);install(q);const r=run();assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');const old=spawnSync(process.execPath,[join(baseline,'scripts/decision-sheet.mjs'),join(root,'scenario.json')],{encoding:'utf8'});assert.equal(old.status,0);assert.equal(r.stdout.slice(r.stdout.indexOf('OPENRETURN / DECISION SHEET')),old.stdout);assert.ok(r.stdout.includes(`Receipt-declared service day: ${day}`));assert.ok(r.stdout.includes(`Receipt-declared selection: ${kind} ${kind==='routeIds'?'["R"]':'["loop"]'}`));assert.ok(r.stdout.includes(`Block policy: ${policy}`));assert.ok(r.stdout.includes('America/New_York'));assert.ok(r.stdout.includes('gtfs-service-day-minutes'));assert.ok(r.stdout.includes('The CLI reads inputs once'));assert.ok(r.stdout.includes(hash(q.scenarioText)));assert.ok(r.stdout.includes(hash(q.receiptText)));assert.match(r.stdout,/not independently authenticated/);assert.match(r.stdout,/not an atomic filesystem snapshot/);if(policy==='separate-trips')assert.match(r.stdout,/not globally conservative/);assert.equal(r.stdout,buildVerifiedGtfsReport(q)+'\n');record(`${day}/${kind}/${policy} exact legacy body and provenance`);
 }
 for(const role of ['scenario','receipt','template']){
  fail(`${role} invalid UTF8`,()=>fs.writeFileSync(join(root,role+'.json'),Buffer.from([0xc0,0xaf])),'INVALID_UTF8');
  fail(`${role} missing`,()=>fs.unlinkSync(join(root,role+'.json')));
  fail(`${role} leaf symlink`,()=>{fs.renameSync(join(root,role+'.json'),join(root,'saved'));fs.symlinkSync(join(root,'saved'),join(root,role+'.json'));},'REGULAR_FILE_REQUIRED');
  fail(`${role} directory`,()=>{fs.unlinkSync(join(root,role+'.json'));fs.mkdirSync(join(root,role+'.json'));},'REGULAR_FILE_REQUIRED');
  fail(`${role} oversized`,()=>fs.writeFileSync(join(root,role+'.json'),Buffer.alloc(({scenario:4000001,receipt:4000000,template:1000000})[role]+1,32)),'INPUT_SIZE_LIMIT');
 }
 fail('feed directory symlink',()=>{fs.renameSync(join(root,'feed'),join(root,'saved-feed'));fs.symlinkSync(join(root,'saved-feed'),join(root,'feed'));},'FEED_DIRECTORY_REQUIRED');
 fail('feed member symlink',()=>{fs.renameSync(join(root,'feed/agency.txt'),join(root,'saved'));fs.symlinkSync(join(root,'saved'),join(root,'feed/agency.txt'));},'REGULAR_FILE_REQUIRED');
 fail('feed member directory',()=>{fs.unlinkSync(join(root,'feed/agency.txt'));fs.mkdirSync(join(root,'feed/agency.txt'));},'REGULAR_FILE_REQUIRED');
 fail('unknown private entry',()=>fs.writeFileSync(join(root,'feed/PRIVATE_SENTINEL'),'x'),'UNSUPPORTED_FEED_ENTRY');
 fail('feed invalid UTF8',()=>fs.writeFileSync(join(root,'feed/agency.txt'),Buffer.from([0xff])),'INVALID_UTF8');
 fail('feed member oversized',()=>fs.writeFileSync(join(root,'feed/agency.txt'),Buffer.alloc(8000001,32)),'INPUT_SIZE_LIMIT');
 fail('combined feed oversized',()=>{for(const n of ['agency.txt','shapes.txt','feed_info.txt','attributions.txt'])fs.writeFileSync(join(root,'feed',n),Buffer.alloc(8000000,32));},'INPUT_SIZE_LIMIT');
 fail('source missing full-replay check',()=>fs.unlinkSync(join(root,'feed/stops.txt')),'REPLAY_REJECTED');
 fail('source exact-byte tamper',()=>fs.appendFileSync(join(root,'feed/agency.txt'),'\n'),'RECEIPT_REPLAY_MISMATCH');
 fail('template exact-byte tamper',()=>fs.appendFileSync(join(root,'template.json'),' '),'RECEIPT_REPLAY_MISMATCH');
 fail('scenario valid JSON reformat',()=>fs.writeFileSync(join(root,'scenario.json'),JSON.stringify(JSON.parse(p.scenarioText))),'SCENARIO_BYTES_MISMATCH');
 fail('receipt duplicate escaped key',()=>fs.writeFileSync(join(root,'receipt.json'),p.receiptText.replace('"version":2','"version":2,"ver\\u0073ion":2')),'DUPLICATE_JSON_KEY');
 fail('receipt extra private field',()=>{const r=JSON.parse(p.receiptText);r.PRIVATE_SENTINEL='private';fs.writeFileSync(join(root,'receipt.json'),JSON.stringify(r));},'RECEIPT_REPLAY_MISMATCH');
 fail('receipt missing inactive partner',()=>{const r=JSON.parse(p.receiptText);r.blockProjection.touchedBlocks[0].members=r.blockProjection.touchedBlocks[0].members.filter(m=>m.active);fs.writeFileSync(join(root,'receipt.json'),JSON.stringify(r));},'RECEIPT_REPLAY_MISMATCH');
 fail('version policy downgrade',()=>{const r=JSON.parse(p.receiptText);r.version=1;r.adapterVersion='1.0.0';delete r.blockProjection;fs.writeFileSync(join(root,'receipt.json'),JSON.stringify(r));},'REPLAY_REJECTED');
 fail('receipt malformed Unicode',()=>fs.writeFileSync(join(root,'receipt.json'),'"\\ud800"'));
 fail('receipt excessive depth',()=>fs.writeFileSync(join(root,'receipt.json'),'['.repeat(33)+'0'+']'.repeat(33)),'JSON_DEPTH_LIMIT');
 install(p);fs.writeFileSync(join(root,'receipt.json'),'\ufeff'+JSON.stringify(JSON.parse(p.receiptText),null,4));const bom=run();assert.equal(bom.status,0,bom.stderr);assert.ok(bom.stdout.includes(hash(fs.readFileSync(join(root,'receipt.json')))));record('BOM/reformatted receipt succeeds with actual supplied hash');
 // Close-time replacement of every already-read file with invalid content, not just scenario.
 // The report must still derive wholly from captured strings and each file may open only once.
 install(p);const preload=join(root,'instrument.mjs'),log=join(root,'reads.jsonl');
 fs.writeFileSync(preload,`import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';const original=fs.open;fs.open=async function(path,...args){const h=await original.call(this,path,...args);await fs.appendFile(${JSON.stringify(log)},JSON.stringify(path)+'\\n');const close=h.close.bind(h);h.close=async()=>{await close();await fs.writeFile(path,'PRIVATE_SENTINEL replaced after capture');};return h;};syncBuiltinESMExports();`);
 const replaced=run(['--import',preload]);assert.equal(replaced.status,0,replaced.stderr);assert.equal(replaced.stdout,buildVerifiedGtfsReport(p)+'\n');const reads=fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);assert.equal(reads.length,Object.keys(p.files).length+3);assert.equal(new Set(reads).size,reads.length);for(const f of reads)assert.equal(fs.readFileSync(f,'utf8'),'PRIVATE_SENTINEL replaced after capture');record('all inputs replaced after capture, single opens, exact original output');
 // Fail after bounded reader exhausts the advertised size, using growth during the read.
 install(p);const grow=join(root,'grow.mjs');fs.writeFileSync(grow,`import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';const original=fs.open;fs.open=async function(path,...args){const h=await original.call(this,path,...args);if(path.endsWith('/scenario.json')){const read=h.read.bind(h);let first=true;h.read=async(...args)=>{if(first){first=false;await fs.appendFile(path,' '.repeat(4000002));}return read(...args);};}return h;};syncBuiltinESMExports();`);const grown=run(['--import',grow]);assert.equal(grown.status,1);assert.equal(grown.stdout,'');assert.equal(JSON.parse(grown.stderr).error,'INPUT_SIZE_LIMIT');record('growth after fstat stays bounded and emits no report');
 for(const extra of [['--scenario','PRIVATE_SENTINEL'],['--bogus','PRIVATE_SENTINEL'],['--help']]){install(p);const r=run([],extra);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).error,'INVALID_ARGUMENTS');record('invalid argument '+extra[0]);}
 const help=spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/Usage:/);record('help');
 console.log(JSON.stringify({ok:true,node:process.version,checks:count,results},null,2));
}finally{fs.rmSync(root,{recursive:true,force:true});}
