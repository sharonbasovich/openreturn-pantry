import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {route,policy,runtimeNames,mount} from './subpath-policy.mjs';
assert.equal(policy(false).replace("worker-src 'self'","worker-src 'none'"),policy(true));
for(const value of [policy(false),policy(true)]){
  assert.match(value,/default-src 'none'/);assert.match(value,/script-src 'self';/);
  assert.doesNotMatch(value,/unsafe-eval|script-src[^;]*unsafe-inline|worker-src[^;]*(blob:|data:|\*)/);
}
for(const name of runtimeNames){
  assert.equal(route('/'+name).kind,'reject');
  assert.deepEqual(route(mount+name),{kind:'runtime',name,blocked:false});
  await readFile(new URL('../../'+name,import.meta.url));
}
assert.deepEqual(route(mount),{kind:'runtime',name:'index.html',blocked:false});
assert.equal(route(mount+'?workers=blocked').blocked,true);
for(const url of ['/', '/src/calculation-worker.mjs','/openreturn/../src/app.mjs','/openreturn/%2e%2e/src/app.mjs','/openreturn/src%2fapp.mjs','/openreturn/qa/browser/server.mjs','/openreturn/?unknown=true','/openreturn/src/app.mjs?workers=blocked'])assert.equal(route(url).kind,'reject',url);
console.log('Subpath static contract: root runtime denied, allowlisted exact resources, restrictive scripts/workers, only worker-src differs in blocked document policy.');
