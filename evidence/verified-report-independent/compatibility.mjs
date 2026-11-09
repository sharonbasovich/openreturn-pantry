// node compatibility.mjs SOURCE_DIRECTORY BASELINE_DIRECTORY
import fs from 'node:fs';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const [source,baseline]=process.argv.slice(2).map(p=>resolve(p)),hash=b=>createHash('sha256').update(b).digest('hex');
function walk(root,base=''){return fs.readdirSync(join(root,base),{withFileTypes:true}).flatMap(e=>e.name==='.git'?[]:e.isDirectory()?walk(root,join(base,e.name)):[join(base,e.name)]).sort();}
const before=walk(baseline),after=walk(source),changed=[],unchanged=[];
for(const path of before){assert.ok(after.includes(path),'missing baseline file '+path);const old=fs.readFileSync(join(baseline,path)),now=fs.readFileSync(join(source,path));const entry={path,sha256:hash(now),mode:fs.statSync(join(source,path)).mode&511};assert.equal(entry.mode,fs.statSync(join(baseline,path)).mode&511,'mode changed '+path);(old.equals(now)?unchanged:changed).push(entry);}
assert.deepEqual(changed.map(x=>x.path),['README.md','docs/GTFS_RECEIPT_VERIFICATION.md']);
console.log(JSON.stringify({ok:true,baselineFiles:before.length,unchangedFiles:unchanged.length,changed,added:after.filter(p=>!before.includes(p)).map(path=>({path,sha256:hash(fs.readFileSync(join(source,path)))})),unchanged},null,2));
