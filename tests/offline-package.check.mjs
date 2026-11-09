import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildOffline, root, sha256 } from '../scripts/build-offline.mjs';

test('deterministic artifact, source hashes and exact accepted runtime blobs',async()=>{
  const a=await buildOffline(),b=await buildOffline();
  assert.equal(a.html,b.html);assert.deepEqual(a.manifest,b.manifest);
  const tree=JSON.parse(await readFile(join(root,'evidence/accepted-main-tree.json'),'utf8'));
  for(const [path,hash] of Object.entries(a.manifest.sourceSha256)) {
    const bytes=await readFile(join(root,path));assert.equal(sha256(bytes),hash);
    const blob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(blob,tree.tree.find(e=>e.path===path).sha,path);
  }
  assert.equal(a.manifest.artifact.sha256,sha256(a.html));
  assert.equal(a.html,await readFile(join(root,'dist/openreturn-offline.html'),'utf8'),'Regenerate dist before testing');
  assert.equal(a.html.match(/<script\b/g).length,1);
  assert.ok(!/<script[^>]*\bsrc=|<link\b|<iframe\b|<img\b|\son\w+=/i.test(a.html));
  for(const content of [a.js,a.css]) assert.ok(a.html.includes(`sha256-${createHash('sha256').update(content).digest('base64')}`));
});

test('bundled application runs the complete existing DOM-double state suite',async()=>{
  const {js}=await buildOffline();
  const dir=await mkdtemp(join(tmpdir(),'openreturn-bundle-state-'));
  try {
    let suite=await readFile(join(root,'tests/app-state.test.mjs'),'utf8');
    suite=suite.replaceAll("from './",`from '${pathToFileURL(join(root,'tests/')).href}`).replaceAll("from '../src/",`from '${pathToFileURL(join(root,'src/')).href}`)
      .replace("new URL('../index.html',import.meta.url)",`new URL(${JSON.stringify(pathToFileURL(join(root,'dist/openreturn-offline.html')).href)})`);
    suite=suite.replace("await import('../src/app.mjs');",`await import('data:text/javascript;base64,${Buffer.from(js).toString('base64')}');`);
    const file=join(dir,'bundle-state.test.mjs');await writeFile(file,suite);
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const run=spawnSync(process.execPath,['--test','--test-reporter=tap',file],{encoding:'utf8',timeout:30000,env});
    assert.equal(run.status,0,run.stdout+run.stderr);
    assert.match(run.stdout,/# fail 0/);assert.match(run.stdout,/# tests 18/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

for(const [name,file,append] of [
  ['remote import','src/app.mjs',"\nimport 'https://example.invalid/code.mjs';"],
  ['dynamic import','src/app.mjs',"\nimport('./model.mjs');"],
  ['undeclared local module','src/app.mjs',"\nimport './extra.mjs';"],
  ['invalid module syntax','src/app.mjs','\nexport {'],
  ['stylesheet network resource','src/style.css','\nbody { background:url(https://example.invalid/a); }'],
  ['stylesheet closing tag','src/style.css','\n</style><script>alert(1)</script>']
]) test(`build rejects ${name}`,async()=>{
  const dir=await mkdtemp(join(tmpdir(),'openreturn-build-control-'));
  try {
    await cp(join(root,'src'),join(dir,'src'),{recursive:true});await cp(join(root,'index.html'),join(dir,'index.html'));
    await writeFile(join(dir,file),(await readFile(join(dir,file),'utf8'))+append);
    await assert.rejects(buildOffline(dir));
  } finally {await rm(dir,{recursive:true,force:true});}
});
