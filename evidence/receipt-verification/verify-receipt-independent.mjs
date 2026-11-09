import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
// Run: node verify-receipt-independent.mjs [repository-root] [new-results-directory]
// Uses synthetic fixtures only. Case copies and logs stay outside the repository by default.
const repo=path.resolve(process.argv[2]??process.cwd());
const home=process.argv[3]?path.resolve(process.argv[3]):fs.mkdtempSync(path.join(tmpdir(),'openreturn-receipt-review-'));
if(process.argv[3])fs.mkdirSync(home,{recursive:false});
const fixture=path.join(repo,'tests/fixtures/gtfs-synthetic');
const cli=path.join(repo,'scripts/verify-gtfs-receipt.mjs');
const cases=[];
function receipt(dir,mut){let p=path.join(dir,'receipt.json');let r=JSON.parse(fs.readFileSync(p));mut(r);fs.writeFileSync(p,JSON.stringify(r));}
function test(name,expected,mut=()=>{},extra=[]){let dir=path.join(home,'cases',name);fs.mkdirSync(dir,{recursive:true});fs.cpSync(path.join(fixture,'feed'),path.join(dir,'feed'),{recursive:true});for(let f of ['scenario.json','receipt.json'])fs.copyFileSync(path.join(fixture,'expected',f),path.join(dir,f));fs.copyFileSync(path.join(fixture,'template.json'),path.join(dir,'template.json'));mut(dir);let args=['--scenario',path.join(dir,'scenario.json'),'--receipt',path.join(dir,'receipt.json'),'--feed',path.join(dir,'feed'),'--template',path.join(dir,'template.json'),...extra];let before=tree(dir);let r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:15000,maxBuffer:1000000});let after=tree(dir);let result={name,expected,status:r.status,signal:r.signal,error:r.error?.message,stdout:r.stdout,stderr:r.stderr,readOnly:JSON.stringify(before)===JSON.stringify(after)};result.pass=r.status===expected&&result.readOnly;cases.push(result);console.log(`${result.pass?'PASS':'FAIL'} ${name}: ${r.status}`);}
function tree(dir){let r={};for(let f of fs.readdirSync(dir).sort()){let p=path.join(dir,f),s=fs.lstatSync(p);r[f]=s.isSymbolicLink()?['link',fs.readlinkSync(p)]:s.isDirectory()?tree(p):s.isFile()?[s.size,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]:['other'];}return r;}
test('untouched',0);
test('reordered-receipt',0,d=>receipt(d,r=>{const n=Object.fromEntries(Object.entries(r).reverse());for(let k of Object.keys(r))delete r[k];Object.assign(r,n);}));
for(let [name,fn] of Object.entries({version:r=>r.version=2,adapter:r=>r.adapterVersion='2.0.0',date:r=>r.serviceDay='2026-11-13',invalidDate:r=>r.serviceDay='2026-02-30',zone:r=>r.timeZone='UTC',basis:r=>r.timeBasis='wall-clock',reference:r=>r.reference='https://example.com',reviewDate:r=>r.referenceReviewed='2026-11-09',selectionKind:r=>r.selection.kind='tripIds',selectionDuplicate:r=>r.selection.ids.push('R'),selectionInactive:r=>r.selection.inactiveScopedTripIds=[],selectedTrip:r=>r.selection.selectedTripIds.pop(),outOfScope:r=>r.selection.outOfScopeTripCount=1,services:r=>r.services[0].active=false,routes:r=>r.routes[0].agencyId='PRIVATE_SENTINEL',stops:r=>r.stops[0].parentStation='PRIVATE_SENTINEL',inputHash:r=>r.inputs[0].sha256='0'.repeat(64),inputBytes:r=>r.inputs[0].bytes++,inputRows:r=>r.inputs[0].rows++,inputRole:r=>r.inputs[0].role='ignored',inputMissing:r=>r.inputs.pop(),inputExtra:r=>r.inputs.push({...r.inputs[0],file:'extra.txt'}),templateHash:r=>r.templateHash.sha256='0'.repeat(64),templateRawHash:r=>r.templateInput.sha256='0'.repeat(64),templateRawAbsent:r=>delete r.templateInput,outputCount:r=>r.output.connections++,outputEncoding:r=>r.output.encoding='other',mapSequence:r=>r.connectionMap[0].fromStopSequence=1,mapMissing:r=>r.connectionMap.pop(),mapDuplicate:r=>r.connectionMap.push(r.connectionMap[0]),callDwell:r=>r.stopCalls[1].departure++,callMissing:r=>r.stopCalls.pop(),callDuplicate:r=>r.stopCalls.push(r.stopCalls[0]),limitations:r=>r.limitations=[],unknown:r=>r.PRIVATE_SENTINEL=true}))test(`receipt-${name}`,1,d=>receipt(d,fn));
test('scenario-whitespace',1,d=>fs.appendFileSync(path.join(d,'scenario.json'),' '));
test('scenario-rehash-tamper',1,d=>{let p=path.join(d,'scenario.json');let s=JSON.parse(fs.readFileSync(p));s.title='PRIVATE_SENTINEL';let b=JSON.stringify(s,null,2)+'\n';fs.writeFileSync(p,b);receipt(d,r=>{r.output.bytes=Buffer.byteLength(b);r.output.sha256=createHash('sha256').update(b).digest('hex');});});
test('template-whitespace',1,d=>fs.appendFileSync(path.join(d,'template.json'),' '));
test('template-whitespace-no-raw',1,d=>{fs.appendFileSync(path.join(d,'template.json'),' ');receipt(d,r=>delete r.templateInput);});
test('template-value',1,d=>{let p=path.join(d,'template.json'),t=JSON.parse(fs.readFileSync(p));t.settings.transferMinutes++;fs.writeFileSync(p,JSON.stringify(t));});
test('feed-whitespace',1,d=>fs.appendFileSync(path.join(d,'feed','agency.txt'),'\n'));
test('feed-extra',1,d=>fs.writeFileSync(path.join(d,'feed','secret.txt'),'PRIVATE_SENTINEL'));
for(let f of ['scenario.json','receipt.json','template.json','feed/agency.txt'])test(`utf8-${f.replace('/','-')}`,1,d=>fs.appendFileSync(path.join(d,f),Buffer.from([0xff])));
for(let f of ['scenario.json','receipt.json','template.json','feed/agency.txt'])test(`symlink-${f.replace('/','-')}`,1,d=>{let p=path.join(d,f);fs.renameSync(p,p+'.original');fs.symlinkSync(p+'.original',p);});

for(let f of ['scenario.json','receipt.json','template.json']) {
 test(`duplicate-${f}`,1,d=>{let p=path.join(d,f),t=fs.readFileSync(p,'utf8');fs.writeFileSync(p,t.replace('{','{\"version\":1,\"version\":1,'));});
 test(`escaped-duplicate-${f}`,1,d=>fs.writeFileSync(path.join(d,f),'{\"a\":1,\"\\u0061\":1}'));
 test(`surrogate-${f}`,1,d=>fs.writeFileSync(path.join(d,f),'{\"a\":\"\\ud800\"}'));
 test(`deep-${f}`,1,d=>fs.writeFileSync(path.join(d,f),'['.repeat(100)+'0'+']'.repeat(100)));
 test(`fifo-${f}`,1,d=>{fs.unlinkSync(path.join(d,f));const made=spawnSync('mkfifo',[path.join(d,f)],{encoding:'utf8'});if(made.status!==0||!fs.lstatSync(path.join(d,f)).isFIFO())throw new Error('FIFO fixture creation failed; requires mkfifo support.');});
 test(`oversize-${f}`,1,d=>fs.writeFileSync(path.join(d,f),' '.repeat(f==='template.json'?1000001:f==='receipt.json'?4000001:4000002)));
}
test('feed-oversize',1,d=>fs.writeFileSync(path.join(d,'feed','agency.txt'),' '.repeat(8000001)));
test('feed-directory-symlink',1,d=>{fs.renameSync(path.join(d,'feed'),path.join(d,'original'));fs.symlinkSync(path.join(d,'original'),path.join(d,'feed'));});
test('receipt-bom',0,d=>{let p=path.join(d,'receipt.json');fs.writeFileSync(p,'\ufeff'+fs.readFileSync(p,'utf8'));});
test('scenario-bom',1,d=>{let p=path.join(d,'scenario.json');fs.writeFileSync(p,'\ufeff'+fs.readFileSync(p,'utf8'));});
test('unknown-cli',1,()=>{},['--PRIVATE_SENTINEL','value']);
test('duplicate-cli',1,()=>{},['--scenario','PRIVATE_SENTINEL']);
test('missing-cli-value',1,()=>{},['--receipt']);
for(let c of cases){c.noLeaks=![c.stdout,c.stderr].some(v=>v?.includes(home)||v?.includes('PRIVATE_SENTINEL'));c.pass&&=c.noLeaks;}
fs.writeFileSync(path.join(home,'results.json'),JSON.stringify(cases,null,2)+'\n');if(cases.some(c=>!c.pass))process.exitCode=1;
