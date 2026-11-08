// Minimal DOM double: tests real application event handlers and text/state only.
// No browser, layout, actual keyboard handling, download or accessibility claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SAMPLE } from '../src/sample.mjs';
import { auditDecision, auditSensitivity } from '../src/decision.mjs';
import { buildDecisionSheet } from '../src/report.mjs';

class Element {
  constructor(tag, text='') { this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.listeners=new Map();this.attributes=new Map();this.dataset={};this.style={};this.value='';this._text=text;this.className='';this.classList={toggle:(name,on)=>{const classes=new Set(this.className.split(' ').filter(Boolean));on?classes.add(name):classes.delete(name);this.className=[...classes].join(' ');}}; }
  get id(){return this.attributes.get('id')||'';} set id(value){this.attributes.set('id',value);}
  get value(){return this._value??'';} set value(value){this._value=String(value);}
  get disabled(){return this._disabled||false;} set disabled(value){this._disabled=value;if(value&&document.activeElement===this)document.activeElement=document.body;}
  get isConnected(){return this===document.documentElement||Boolean(this.parentNode?.isConnected);}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');} set textContent(value){for(const c of this.children)c.parentNode=null;this.children=[];this._text=String(value);}
  append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
  replaceChildren(...nodes){this.textContent='';this.append(...nodes);}
  setAttribute(key,value){this.attributes.set(key,String(value));} getAttribute(key){return this.attributes.get(key)??null;} removeAttribute(key){this.attributes.delete(key);}
  contains(element){return this===element||this.children.some(c=>c.contains(element));}
  addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);}
  removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
  async emit(type,event={}){for(const handler of [...(this.listeners.get(type)||[])])await handler({preventDefault(){},target:this,...event});}
  click(){return this.disabled?Promise.resolve():this.emit('click');}
  focus(){if(this.isConnected&&!this.disabled)document.activeElement=this;}
  scrollIntoView(){}
  showModal(){this.setAttribute('open','');} close(){this.removeAttribute('open');}
  remove(){this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
}
const descendants=root=>[root,...root.children.flatMap(descendants)];
const doc={documentElement:new Element('html'),body:new Element('body')};
globalThis.document=doc;doc.documentElement.append(doc.body);doc.activeElement=doc.body;
doc.createElement=tag=>new Element(tag);doc.createTextNode=text=>new Element('#text',text);
doc.getElementById=id=>descendants(doc.documentElement).find(e=>e.id===id)??null;
doc.querySelectorAll=selector=>{const tags=selector.split(',').map(t=>t.toUpperCase());return descendants(doc.documentElement).filter(e=>tags.includes(e.tagName));};
doc.querySelector=selector=>selector==='dialog[open]'?descendants(doc.documentElement).find(e=>e.tagName==='DIALOG'&&e.attributes.has('open'))??null:null;
globalThis.window={addEventListener(){}};
globalThis.requestAnimationFrame=callback=>queueMicrotask(callback);
// Only test the copyable report. Deliberately do not simulate saved download bytes.
const originalTimeout=globalThis.setTimeout;
globalThis.setTimeout=callback=>{callback();return 0;};
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const el=new Element(match[1]);el.id=match[2];doc.body.append(el);}
await import('../src/app.mjs');
globalThis.setTimeout=originalTimeout;
const $=id=>doc.getElementById(id);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const exportReport=async()=>{const previous=globalThis.setTimeout;globalThis.setTimeout=callback=>{callback();return 0;};try{await $('export-report').click();}finally{globalThis.setTimeout=previous;}return $('export-text').value;};
const submit=()=> $('settings-form').emit('submit',{submitter:$('check-assumptions')});

test('real application handlers preserve and invalidate decision audits correctly',async t=>{
  await t.test('new summary cards include waits and initialize without sensitivity',async()=>{
    assert.match($('comparison').textContent,/Scheduled waits: 15–115 min/);
    assert.match($('tradeoffs').textContent,/1 grid start share the highest coverage/);
    assert.match($('sensitivity-status').textContent,/Not run/);
    assert.match(await exportReport(),/Not run for these applied data/);
  });
  await t.test('repeated checks render exactly three cards from the applied data',async()=>{
    await $('check-assumptions').click();await $('check-assumptions').click();
    assert.equal($('sensitivity-results').children.length,3);
    assert.match($('sensitivity-results').textContent,/Keep 10:30–12:30: 2\/7 origins/);
    assert.equal(await exportReport(),buildDecisionSheet(auditDecision(SAMPLE),auditSensitivity(SAMPLE)));
  });
  await t.test('unapplied data and settings drafts do not contaminate checks or exports',async()=>{
    $('field-visitMinutes').value='30';await $('field-visitMinutes').emit('input');
    $('import-text').value='private unsaved draft';await $('import-text').emit('input');
    await $('check-assumptions').click();const text=await exportReport();
    assert.equal(text,buildDecisionSheet(auditDecision(SAMPLE),auditSensitivity(SAMPLE)));
    assert.equal($('import-text').value,'private unsaved draft');
  });
  await t.test('applying settings clears old sensitivity, preserves data draft, updates report',async()=>{
    await submit();assert.equal($('sensitivity-results').children.length,0);assert.match($('sensitivity-status').textContent,/Not run/);
    assert.equal($('import-text').value,'private unsaved draft');assert.match(await exportReport(),/Visit minutes: 30/);
  });
  await t.test('failed settings do not replace results or checked state',async()=>{
    await $('check-assumptions').click();const before=await exportReport();
    $('field-visitMinutes').value='999';await $('field-visitMinutes').emit('input');await submit();
    assert.equal(await exportReport(),before);assert.match($('settings-status').textContent,/visitMinutes/);
  });
  await t.test('cancelled validated import preserves current checks and edits',async()=>{
    $('import-text').value=JSON.stringify(SAMPLE);await $('import-text').emit('input');const before=await exportReport();
    const pending=$('import-apply').click();await flush();assert(doc.querySelector('dialog[open]'));await $('confirm-cancel').click();await pending;
    assert.equal(await exportReport(),before);assert.equal($('field-visitMinutes').value,'999');
  });
  await t.test('confirmed import clears sensitivity and repairs settings without losing labels',async()=>{
    const sample=structuredClone(SAMPLE);sample.title='<script>not markup</script>';sample.origins[0].label='x'.repeat(160);
    $('import-text').value=JSON.stringify(sample);await $('import-text').emit('input');
    const pending=$('import-apply').click();await flush();await $('confirm-accept').click();await pending;
    assert.equal($('sensitivity-results').children.length,0);assert.equal($('field-visitMinutes').value,'15');
    assert.match($('scenario-meta').textContent,/<script>not markup<\/script>/);
    assert.equal($('origin-list').children[0]._text,'x'.repeat(160));
  });
  await t.test('journey selection shows retained-witness headroom and wait breakdown',async()=>{
    await $('origin-list').children.find(el=>el.dataset.originId==='hilltop').click();
    assert.match($('journey-detail').textContent,/31 scheduled wait minutes/);assert.match($('journey-detail').textContent,/6 on board/);
    assert.match($('journey-detail').textContent,/Return departure0 min remaining/);
    assert.match($('journey-detail').textContent,/not delay tolerances/);
  });
  await t.test('reset cancellation retains checks; confirmed reset clears them',async()=>{
    await $('check-assumptions').click();let pending=$('reset').click();await flush();await $('confirm-cancel').click();await pending;
    assert.equal($('sensitivity-results').children.length,3);
    pending=$('reset').click();await flush();await $('confirm-accept').click();await pending;
    assert.equal($('sensitivity-results').children.length,0);assert.match(await exportReport(),/Not run/);
  });
});

test('export failures preserve state and provide exact JSON recovery',async t=>{
  const clickExport=async id=>{const previous=globalThis.setTimeout;globalThis.setTimeout=callback=>{callback();return 0;};try{await $(id).click();}finally{globalThis.setTimeout=previous;}};
  const fixture=structuredClone(SAMPLE);fixture.connections[0].id='=1+1';
  await t.test('model-valid JSON with a restricted CSV ID imports normally',async()=>{
    $('import-text').value=JSON.stringify(fixture);await $('import-text').emit('input');
    const pending=$('import-apply').click();await flush();await $('confirm-accept').click();await pending;
    assert.match($('import-status').textContent,/Validated and imported/);
    await $('check-assumptions').click();await clickExport('export-json');
    assert.equal(JSON.parse($('export-text').value).connections[0].id,'=1+1');
  });
  await t.test('rejected CSV export preserves previous fallback, drafts and results',async()=>{
    const before=$('export-text').value,comparison=$('comparison').textContent;
    $('import-text').value='keep this draft';await $('import-text').emit('input');
    $('field-visitMinutes').value='20';await $('field-visitMinutes').emit('input');
    await clickExport('export-csv');
    assert.match($('import-status').textContent,/Not exported:.*formula-leading/);
    assert.equal($('export-text').value,before);assert.equal($('import-text').value,'keep this draft');
    assert.equal($('field-visitMinutes').value,'20');assert.equal($('comparison').textContent,comparison);assert.equal($('sensitivity-results').children.length,3);
  });
  await t.test('unavailable CSV format does not ask to discard or replace the draft',async()=>{
    $('import-kind').value='csv';await $('import-kind').emit('change');
    assert.equal($('import-kind').value,'json');assert.equal($('import-text').value,'keep this draft');
    assert.equal(doc.querySelector('dialog[open]'),null);assert.match($('import-status').textContent,/Format not changed/);
  });
  await t.test('automatic download failure leaves the complete copyable JSON available',async()=>{
    const original=URL.createObjectURL;URL.createObjectURL=()=>{throw new Error('simulated unavailable download');};
    try {await clickExport('export-json');}finally{URL.createObjectURL=original;}
    assert.match($('import-status').textContent,/Automatic download could not be started/);
    assert.equal(JSON.parse($('export-text').value).connections[0].id,'=1+1');assert.equal($('export-fallback').open,true);
    assert.equal($('import-text').value,'keep this draft');assert.equal($('field-visitMinutes').value,'20');
  });
  await t.test('valid format-change cancellation preserves draft and selected format',async()=>{
    const reset=$('reset').click();await flush();await $('confirm-accept').click();await reset;
    $('import-text').value='still keep this';await $('import-text').emit('input');$('import-kind').value='csv';
    const pending=$('import-kind').emit('change');await flush();assert(doc.querySelector('dialog[open]'));await $('confirm-cancel').click();await pending;
    assert.equal($('import-kind').value,'json');assert.equal($('import-text').value,'still keep this');
  });
  await t.test('valid repeated format changes and CSV export still work',async()=>{
    $('import-kind').value='csv';const pending=$('import-kind').emit('change');await flush();await $('confirm-accept').click();await pending;
    assert.equal($('import-kind').value,'csv');assert.match($('import-text').value,/^id,trip_id/);
    await clickExport('export-csv');assert.match($('export-text').value,/^id,trip_id/);
    $('import-kind').value='json';await $('import-kind').emit('change');assert.equal(JSON.parse($('import-text').value).version,1);
    $('import-kind').value='csv';await $('import-kind').emit('change');assert.match($('import-text').value,/^id,trip_id/);
  });
});
