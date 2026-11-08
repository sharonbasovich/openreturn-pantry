// Bounded negative controls for the test oracle and the runtime witnesses.
// Runs only copied local source in temporary directories; no network or packages.
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=['src/model.mjs','tests/support/exhaustive-oracle.mjs','tests/oracle-reboarding.test.mjs'];
const mutations=[
  {name:'legacy trip-ID-only oracle',file:files[1],from:'!continuesOnBoard(s, prior, c)',to:'prior.tripId !== c.tripId'},
  {name:'oracle ignores transfer buffer',file:files[1],from:'changed ? s.settings.transferMinutes : 0',to:'0'},
  {name:'oracle ignores transfer cap',file:files[1],apply:s=>s.replace('if (nextChanges > cap) continue;','if (false) continue;').replace('assert.ok(changes <= s.settings.maxTransfers);','assert.ok(true);')},
  {name:'runtime forgets transfer buffer',file:files[0],from:'arrivals[ai].arrival+transferMinutes <= c.departure',to:'arrivals[ai].arrival <= c.departure'},
  {name:'runtime treats skipped trip legs as on-board',file:files[0],from:'const prev=previous.get(c.id), onBoard=prev && states.get(prev.id);',
    to:'const prev=s.connections.find(p=>p.tripId===c.tripId && p.to===c.from && p.arrival<=c.departure && states.get(p.id)), onBoard=prev && states.get(prev.id);'}
];
const results=[];
for(const mutation of [{name:'unmodified control'},...mutations]) {
  const temp=mkdtempSync(join(tmpdir(),'openreturn-oracle-control-'));
  try {
    for(const file of files){const dest=join(temp,file);mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(root,file),dest);}
    if(mutation.file){const p=join(temp,mutation.file),s=readFileSync(p,'utf8');
      const altered=mutation.apply?mutation.apply(s):s.replaceAll(mutation.from,mutation.to);
      assert.notEqual(s,altered,`mutation anchor missing: ${mutation.name}`);writeFileSync(p,altered);}
    const r=spawnSync(process.execPath,['--test','tests/oracle-reboarding.test.mjs'],{cwd:temp,encoding:'utf8',timeout:30000});
    assert.equal(r.error,undefined,`${mutation.name}: subprocess error`);
    assert.equal(r.signal,null,`${mutation.name}: interrupted subprocess`);
    const output=r.stdout+r.stderr;
    assert.match(output,/tests 130\b/,`${mutation.name}: full test enumeration did not complete`);
    if(!mutation.file)assert.equal(r.status,0,output);
    else {assert.notEqual(r.status,0,`${mutation.name}: mutation survived`);assert.match(output,/ERR_ASSERTION|AssertionError/,`${mutation.name}: failure must be an assertion, not setup`);}
    const failed=output.match(/fail (\d+)/)?.[1];
    results.push({name:mutation.name,status:mutation.file?'detected':'passed',failedTests:Number(failed)});
  } finally {rmSync(temp,{recursive:true,force:true});}
}
console.log(JSON.stringify({scope:'Five deliberately faulty local copies; not mutation completeness or production proof',results},null,2));
