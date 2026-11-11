import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalculator,CalculationCancelled} from '../src/calculation.mjs';
import {calculateRequest} from '../src/calculation-worker.mjs';
import {SAMPLE} from '../src/sample.mjs';
import {auditDecision,auditSensitivity} from '../src/decision.mjs';
function setup(){const workers=[];const calculator=createCalculator(()=>{const w={postMessage(request){this.request=request;},terminate(){this.terminated=true;}};workers.push(w);return w;});return {workers,calculator};}
test('worker protocol preserves pure model output and rejects invalid requests',()=>{
  const decision=auditDecision(SAMPLE);
  assert.deepEqual(calculateRequest({id:1,kind:'comparison',scenario:SAMPLE}).result,{normalized:decision.scenario,result:decision.comparison,decision});
  assert.deepEqual(calculateRequest({id:2,kind:'sensitivity',scenario:SAMPLE}).result,auditSensitivity(SAMPLE));
  assert.equal(calculateRequest({id:3,kind:'bad',scenario:SAMPLE}).ok,false);
  assert.equal(calculateRequest({id:4,kind:'comparison',scenario:{}}).ok,false);
});
test('cancel terminates work and stale saved callbacks cannot settle newer work',async()=>{
  const {workers,calculator:c}=setup();const first=c.run('comparison',SAMPLE),old=workers[0].onmessage;
  assert(c.busy);await assert.rejects(c.run('comparison',SAMPLE),/already running/);
  c.cancel();await assert.rejects(first,CalculationCancelled);assert(workers[0].terminated);assert(!c.busy);
  c.cancel();const second=c.run('sensitivity',SAMPLE);old({data:{id:1,ok:true,result:{stale:true}}});assert(c.busy);
  workers[1].onmessage({data:{id:1,ok:true,result:{stale:true}}});assert(c.busy);
  workers[1].onmessage({data:{id:2,ok:true,result:{fresh:true}}});assert.deepEqual(await second,{fresh:true});assert(workers[1].terminated);
});
for(const failure of ['error','messageerror','reported','malformed','post','factory'])test(`worker ${failure} failure releases controller and permits retry`,async()=>{
  const {workers,calculator:c}=setup();
  if(failure==='factory'||failure==='post'){
    const broken=createCalculator(()=>{if(failure==='factory')throw Error('blocked');return {postMessage(){throw Error('clone');},terminate(){}};});
    await assert.rejects(broken.run('comparison',SAMPLE),/unavailable/);assert(!broken.busy);return;
  }
  const pending=c.run('comparison',SAMPLE),w=workers[0];
  if(failure==='error')w.onerror({preventDefault(){}});
  if(failure==='messageerror')w.onmessageerror();
  if(failure==='reported')w.onmessage({data:{id:1,ok:false,error:'bad input'}});
  if(failure==='malformed')w.onmessage({data:{id:1,ok:true}});
  await assert.rejects(pending);assert(w.terminated);assert(!c.busy);
  const retry=c.run('comparison',SAMPLE);workers[1].onmessage({data:{id:2,ok:true,result:{}}});await retry;
});
test('unavailable native Worker rejects without synchronous model fallback',async()=>{
  const old=globalThis.Worker;delete globalThis.Worker;
  try{await assert.rejects(createCalculator().run('comparison',SAMPLE),/unavailable/);}finally{globalThis.Worker=old;}
});
