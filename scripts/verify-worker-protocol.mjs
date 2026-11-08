import assert from 'node:assert/strict';
import {createCalculator,CalculationCancelled} from '../src/calculation.mjs';
let created=[];
const make=()=>{const w={terminate(){this.dead=true;},postMessage(message){this.message=message;}};created.push(w);return w;};
const c=createCalculator(make);
let p=c.run('comparison',{}),w=created.at(-1),late=w.onmessage;
await assert.rejects(c.run('sensitivity',{}),/already running/);
w.onmessage({data:{id:w.message.id+1,ok:true,result:{bad:true}}});assert(c.busy);
c.cancel();await assert.rejects(p,CalculationCancelled);assert(w.dead);assert(!c.busy);
p=c.run('sensitivity',{});const current=created.at(-1);late({data:{id:w.message.id,ok:true,result:{stale:true}}});assert(c.busy);current.onmessage({data:{id:current.message.id,ok:true,result:{current:true}}});assert.deepEqual(await p,{current:true});
for(const failure of ['error','messageerror','protocol','worker-response']){p=c.run('comparison',{});w=created.at(-1);if(failure==='error')w.onerror({preventDefault(){}});if(failure==='messageerror')w.onmessageerror({});if(failure==='protocol')w.onmessage({data:{id:w.message.id,ok:true,result:null}});if(failure==='worker-response')w.onmessage({data:{id:w.message.id,ok:false,error:'bad scenario'}});await assert.rejects(p);assert(!c.busy);assert(w.dead);assert.equal(w.onmessage,null);}
let once=true;const retry=createCalculator(()=>{if(once){once=false;throw Error('blocked');}return make();});await assert.rejects(retry.run('comparison',{}),/Background calculation is unavailable/);p=retry.run('comparison',{});w=created.at(-1);w.onmessage({data:{id:w.message.id,ok:true,result:{retried:true}}});assert.deepEqual(await p,{retried:true});
const cloneFail=createCalculator(()=>{const w=make();w.postMessage=()=>{throw Error('DataCloneError');};return w;});await assert.rejects(cloneFail.run('comparison',{}));assert(!cloneFail.busy);assert(created.every(w=>w.dead));console.log('PASS: concurrency exclusion, unmatched ID, canceled late callback across jobs, error/messageerror/protocol/reported failure, failed constructor retry, postMessage clone failure. Synthetic protocol doubles only.');
