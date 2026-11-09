import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,cp,writeFile,rm,symlink,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {verifyGtfsReceipt,strictJson} from '../src/verify-gtfs-receipt.mjs';
const fixture=new URL('./fixtures/gtfs-synthetic/',import.meta.url);
const files=Object.fromEntries(await Promise.all((await readdir(new URL('feed/',fixture))).map(async n=>[n,await readFile(new URL('feed/'+n,fixture),'utf8')])));
const input={files,scenarioText:await readFile(new URL('expected/scenario.json',fixture),'utf8'),receiptText:await readFile(new URL('expected/receipt.json',fixture),'utf8'),templateText:await readFile(new URL('template.json',fixture),'utf8')};
const verify=patch=>verifyGtfsReceipt({...input,...patch});
test('exact synthetic CLI artifact verifies; pure replay does not mutate input',()=>{const before=JSON.stringify(input);const result=verify();assert.equal(result.ok,true);assert.match(result.receiptSha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(input),before);});
test('scenario byte changes, even valid JSON reformatting, fail',()=>{for(const scenarioText of [input.scenarioText+' ',JSON.stringify(JSON.parse(input.scenarioText)),'\uFEFF'+input.scenarioText,JSON.stringify({...JSON.parse(input.scenarioText),title:'Modified scenario'})]){if(scenarioText===input.scenarioText)continue;assert.throws(()=>verify({scenarioText}),/SCENARIO_BYTES_MISMATCH/);}});
test('receipt formatting and property order are not a signature',()=>{const r=JSON.parse(input.receiptText);const result=verify({receiptText:JSON.stringify(Object.fromEntries(Object.entries(r).reverse()))});assert.equal(result.ok,true);assert.notEqual(result.receiptSha256,verify().receiptSha256);});
for(const [name,mutation] of Object.entries({
  map:r=>r.connectionMap[0].fromStopSequence++,calls:r=>r.stopCalls[0].arrival++,route:r=>r.routes[0].agencyTimezone='UTC',stop:r=>r.stops[0].parentStation='invented',services:r=>r.services[0].active=!r.services[0].active,
  selection:r=>r.selection.selectedTripIds.pop(),inactive:r=>r.selection.inactiveScopedTripIds=[],count:r=>r.selection.outOfScopeTripCount++,limits:r=>r.limitations=[],reference:r=>r.referenceReviewed='2026-01-01',extra:r=>r.certificate=true,
  output:r=>r.output.sha256=r.output.sha256.toUpperCase(),encoding:r=>r.output.encoding='canonical',input:r=>r.inputs[0].bytes++,inputHash:r=>r.inputs[0].sha256='0'.repeat(64),template:r=>r.templateHash.encoding='canonical',rawTemplate:r=>delete r.templateInput,version:r=>r.version=2,adapter:r=>r.adapterVersion='1.0.1',date:r=>r.serviceDay='2026-11-13',
})){test(`receipt mutation rejected: ${name}`,()=>{const r=JSON.parse(input.receiptText);mutation(r);assert.throws(()=>verify({receiptText:JSON.stringify(r)}));});}
test('changed and missing feed and template rejected',()=>{
  const changed={...files,'agency.txt':files['agency.txt']+'\n'};assert.throws(()=>verify({files:changed}),/RECEIPT_REPLAY_MISMATCH/);
  delete changed['stops.txt'];assert.throws(()=>verify({files:changed}),/REPLAY_REJECTED/);
  assert.throws(()=>verify({templateText:input.templateText+' '}),/RECEIPT_REPLAY_MISMATCH/);
  assert.throws(()=>verify({templateText:'{}'}),/REPLAY_REJECTED/);
});
test('strict JSON bounds, duplicate escaped keys and malformed strings',()=>{
  for(const text of ['{"a":1,"\\u0061":2}','{"a":"\\ud800"}','[1,]','{"a":1,}','[true false]',' '.repeat(50)+'{}','['.repeat(34)+'0'+']'.repeat(34)])assert.throws(()=>strictJson(text,50));
  assert.deepEqual(strictJson('{"a":[null,true,false,-1.25e+2,"\\\"x"]}',100),{a:[null,true,false,-125,'"x']});
});
const cli=new URL('../scripts/verify-gtfs-receipt.mjs',import.meta.url);
function run(root,extra=[]){return spawnSync(process.execPath,[cli.pathname,'--scenario',join(root,'expected/scenario.json'),'--receipt',join(root,'expected/receipt.json'),'--feed',join(root,'feed'),'--template',join(root,'template.json'),...extra],{encoding:'utf8',timeout:10000});}
test('real CLI is read-only and fails closed without private path/content disclosure',async()=>{
  const root=await mkdtemp(join(tmpdir(),'private-gtfs-'));
  try{
    await cp(fixture,root,{recursive:true});const before=await stat(join(root,'expected/scenario.json'));
    let result=run(root);assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(JSON.parse(result.stdout).ok,true);assert.equal(result.stderr,'');assert.equal((await stat(join(root,'expected/scenario.json'))).mtimeMs,before.mtimeMs);
    result=run(root,['--receipt','secret']);assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).error,'INVALID_ARGUMENTS');
    for(const bytes of [Buffer.from([0xff]),Buffer.alloc(4_000_001,32),Buffer.from('{"private-residential-address":')]){
      await writeFile(join(root,'expected/receipt.json'),bytes);result=run(root);assert.equal(result.status,1);assert.ok(!result.stdout.includes(root));assert.ok(!result.stdout.includes('residential'));assert.equal(result.stderr,'');
    }
    await cp(new URL('expected/receipt.json',fixture),join(root,'expected/receipt.json'));
    await rm(join(root,'template.json'));result=run(root);assert.equal(JSON.parse(result.stdout).error,'LOCAL_READ_FAILED');
    await symlink(new URL('template.json',fixture).pathname,join(root,'template.json'));result=run(root);assert.equal(JSON.parse(result.stdout).error,'REGULAR_FILE_REQUIRED');
    await rm(join(root,'template.json'));await cp(new URL('template.json',fixture),join(root,'template.json'));
    await writeFile(join(root,'feed/private-unsupported.txt'),'secret');result=run(root);assert.equal(JSON.parse(result.stdout).error,'UNSUPPORTED_FEED_ENTRY');
  }finally{await rm(root,{recursive:true,force:true});}
});
