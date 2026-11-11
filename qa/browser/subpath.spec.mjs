import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {mount,origin,policy,runtimeNames} from './subpath-policy.mjs';
import {SAMPLE} from '../../src/sample.mjs';
import {validateScenario} from '../../src/model.mjs';
import {auditDecision,auditSensitivity} from '../../src/decision.mjs';
import {exportScenarioJson,connectionsToCsv} from '../../src/import.mjs';
import {buildDecisionSheet} from '../../src/report.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const workerURL=origin+mount+'src/calculation-worker.mjs';
const evidenceURL=origin+'/__qa/evidence';
const browserRequests=new WeakMap();
const idle=page=>expect(page.locator('#calculation-bar')).toBeHidden();
async function attachJson(info,name,data){await info.attach(name,{body:JSON.stringify(data,null,2),contentType:'application/json'});}
async function journal(request){const r=await request.get(evidenceURL);expect(r.ok()).toBeTruthy();return r.json();}
async function sourceHashes(){return Object.fromEntries(await Promise.all(runtimeNames.map(async name=>[name,sha(await readFile(new URL('../../'+name,import.meta.url)))])));}
async function observe(page){
  const requests=[];browserRequests.set(page,requests);
  page.context().on('request',r=>requests.push({url:r.url(),method:r.method(),resourceType:r.resourceType()}));
  await page.addInitScript(()=>{
    window.__subpath={attempts:[],messages:[],violations:[]};
    document.addEventListener('securitypolicyviolation',e=>window.__subpath.violations.push({effectiveDirective:e.effectiveDirective,blockedURI:e.blockedURI,originalPolicy:e.originalPolicy,disposition:e.disposition}));
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      constructor(url,options){
        // Passive observer: forwards the original arguments and methods unchanged.
        window.__subpath.attempts.push({url:String(url),type:options?.type});
        super(url,options);
        this.addEventListener('message',e=>window.__subpath.messages.push(e.data));
      }
    };
  });
}
async function saved(page,info,kind,text,label){
  const pending=page.waitForEvent('download');
  await page.locator(kind==='txt'?'#export-report':`#export-${kind}`).click();
  const download=await pending;expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe(`openreturn-scenario.${kind}`);
  const target=info.outputPath(`${label}.${kind}`);await download.saveAs(target);
  const bytes=await readFile(target);expect(bytes.equals(Buffer.from(text))).toBeTruthy();
  await info.attach(label+'-'+kind,{path:target});
  await attachJson(info,label+'-'+kind+'-sha256',{actual:sha(bytes),expected:sha(text),size:bytes.length});
}
async function exactJournal(request,info,label,{blocked=false}={}){
  const records=await journal(request),hashes=await sourceHashes();
  await attachJson(info,label+'-server-resource-evidence',records);
  const runtime=records.filter(r=>!r.auxiliary);
  expect(runtime.length).toBeGreaterThan(0);
  for(const r of records){
    if(r.auxiliary){expect(r.url).toBe('/favicon.ico');expect(r.status).toBe(204);continue;}
    expect(r.method).toBe('GET');expect(r.status).toBe(200);
    expect(r.url).toBe(mount+(r.name==='index.html'?'':r.name)+(blocked&&r.name==='index.html'?'?workers=blocked':''));
    expect(r.sha256).toBe(hashes[r.name]);
    expect(r.policy).toBe(policy(blocked&&r.name==='index.html'));
  }
  const loaded=[...new Set(runtime.map(r=>r.name))].sort();
  expect(loaded).toEqual(runtimeNames.filter(n=>!blocked||n!=='src/calculation-worker.mjs').sort());
}
async function parityFlow(page,request,info,label){
  const workers=[],errors=[];
  const onWorker=w=>workers.push(w.url()),onError=e=>errors.push(e.message);
  page.on('worker',onWorker);page.on('pageerror',onError);
  try{
    const response=await page.goto(origin+mount);
    expect(response.status()).toBe(200);expect(response.headers()['content-security-policy']).toBe(policy());
    await expect(page.locator('.compare-card')).toHaveCount(2);await idle(page);
    let scenario=validateScenario(SAMPLE),audit=auditDecision(scenario);
    expect(await page.evaluate(()=>window.__subpath.messages.at(-1).result)).toEqual({normalized:scenario,result:audit.comparison,decision:audit});
    await expect(page.locator('.card-count').nth(0)).toHaveText('3 / 7 origins');
    await expect(page.locator('.card-count').nth(1)).toHaveText('5 / 7 origins');
    await saved(page,info,'txt',buildDecisionSheet(audit),label+'-initial');
    await page.locator('#check-assumptions').click();await expect(page.locator('.sensitivity-card')).toHaveCount(3);await idle(page);
    expect(await page.evaluate(()=>window.__subpath.messages.at(-1).result)).toEqual(auditSensitivity(scenario));
    await saved(page,info,'txt',buildDecisionSheet(audit,auditSensitivity(scenario)),label+'-initial-checked');
    await page.locator('#field-visitMinutes').fill('20');await page.locator('#settings-form button[type="submit"]').click();
    await expect(page.locator('#settings-status')).toContainText('Applied.');await idle(page);
    await expect(page.locator('.sensitivity-card')).toHaveCount(0);
    scenario=validateScenario({...SAMPLE,settings:{...SAMPLE.settings,visitMinutes:20}});audit=auditDecision(scenario);
    expect(await page.evaluate(()=>window.__subpath.messages.at(-1).result)).toEqual({normalized:scenario,result:audit.comparison,decision:audit});
    await saved(page,info,'txt',buildDecisionSheet(audit),label+'-applied');
    await page.locator('#check-assumptions').click();await expect(page.locator('.sensitivity-card')).toHaveCount(3);await idle(page);
    expect(await page.evaluate(()=>window.__subpath.messages.at(-1).result)).toEqual(auditSensitivity(scenario));
    await saved(page,info,'txt',buildDecisionSheet(audit,auditSensitivity(scenario)),label+'-applied-checked');
    await saved(page,info,'json',exportScenarioJson(scenario),label+'-applied');
    await saved(page,info,'csv',connectionsToCsv(scenario.connections),label+'-applied');
    // Chart inline heights must have actual pixel effect, not merely style text.
    const bars=await page.locator('.bar-fill').evaluateAll(es=>es.map(e=>({height:e.getBoundingClientRect().height,track:e.parentElement.getBoundingClientRect().height,percent:parseFloat(e.style.height)})));
    expect(bars.length).toBe(audit.windows.length);expect(bars.some(b=>b.height>0)).toBeTruthy();
    // CSSOM may serialize percentages with six significant digits (14.2857%).
    // Allow <0.0001 percentage point rounding, while retaining <1 CSS pixel geometry.
    bars.forEach((b,i)=>{expect(Math.abs(b.percent-100*audit.windows[i].reachable/audit.windows[i].total)).toBeLessThan(0.0001);expect(Math.abs(b.height-Math.max(3,b.track*b.percent/100))).toBeLessThan(1);});
    const observation=await page.evaluate(()=>window.__subpath);
    await attachJson(info,label+'-native-observation',observation);
    expect(observation.attempts).toEqual(Array.from({length:4},()=>({url:workerURL,type:'module'})));
    expect(observation.messages).toHaveLength(4);expect(observation.messages.every(m=>m.ok===true)).toBeTruthy();
    expect(observation.violations).toEqual([]);expect(workers).toEqual(Array(4).fill(workerURL));expect(errors).toEqual([]);
    await exactJournal(request,info,label);
    await page.screenshot({path:info.outputPath(label+'-completed.png'),fullPage:true});
  }finally{page.off('worker',onWorker);page.off('pageerror',onError);}
}

test.beforeEach(async({page,request},info)=>{
  await observe(page);
  // Actual HTTP probes, independent of static route checks. Deliberate requests
  // are retained separately, then excluded from the clean application journal.
  const probes=[];
  for(const path of ['/','/index.html','/src/app.mjs','/src/calculation-worker.mjs']){
    const r=await request.get(origin+path);probes.push({path,status:r.status()});expect(r.status()).toBe(404);
  }
  await attachJson(info,'deliberate-root-rejection-probes',probes);
  await attachJson(info,'policy-and-source-contract',{mount,origin,allowedPolicy:policy(),blockedPolicy:policy(true),runtimeSha256:await sourceHashes(),scope:'Specific synthetic loopback header/mount only; not a deployment or production CSP guarantee.'});
  for(const name of runtimeNames)await info.attach('exact-source-'+name.replaceAll('/','-'),{body:await readFile(new URL('../../'+name,import.meta.url)),contentType:'text/plain'});
  expect((await request.post(evidenceURL)).ok()).toBeTruthy();
});

test.afterEach(async({page,request},info)=>{
  await attachJson(info,'final-server-journal',await journal(request));
  const requests=browserRequests.get(page)??[];await attachJson(info,'browser-request-journal',requests);
  const allowed=new Set([origin+mount,origin+mount+'?workers=blocked',origin+'/favicon.ico',...runtimeNames.filter(n=>n!=='index.html').map(n=>origin+mount+n)]);
  for(const r of requests){expect(r.method).toBe('GET');expect(allowed.has(r.url),`Unexpected browser request: ${r.url}`).toBeTruthy();}
  if(!page.isClosed())await attachJson(info,'final-browser-observation',await page.evaluate(()=>window.__subpath??null));
});

test('EXACT subpath + restrictive CSP: native workers, settings, assumptions and saved bytes',async({page,request},info)=>{
  await parityFlow(page,request,info,'subpath-exact');
});

test('POLICY NEGATIVE: worker-src none fails visibly; fresh allowed-policy navigation recovers',async({page,request},info)=>{
  const response=await page.goto(origin+mount+'?workers=blocked');
  expect(response.status()).toBe(200);expect(response.headers()['content-security-policy']).toBe(policy(true));
  await expect(page.locator('#settings-status')).toContainText('Calculation failed:');await idle(page);
  await expect(page.locator('#settings-status')).toContainText('No changes were applied.');
  await expect(page.locator('.compare-card')).toHaveCount(0);await expect(page.locator('.sensitivity-card')).toHaveCount(0);
  await expect(page.locator('#window-chart button')).toHaveCount(0);
  for(const id of ['export-report','export-json','export-csv','check-assumptions'])await expect(page.locator('#'+id)).toBeDisabled();
  await expect(page.locator('#reset')).toBeEnabled();
  await expect.poll(()=>page.evaluate(()=>window.__subpath.violations.length)).toBeGreaterThan(0);
  const blocked=await page.evaluate(()=>window.__subpath);
  expect(blocked.attempts).toEqual([{url:workerURL,type:'module'}]);expect(blocked.messages).toEqual([]);
  for(const violation of blocked.violations){expect(violation.effectiveDirective).toBe('worker-src');expect(violation.blockedURI).toBe(workerURL);expect(violation.originalPolicy).toBe(policy(true));expect(violation.disposition).toBe('enforce');}
  await attachJson(info,'deliberate-policy-block-observation',blocked);
  await exactJournal(request,info,'deliberate-policy-block',{blocked:true});
  await page.screenshot({path:info.outputPath('worker-src-blocked-visible-failure.png'),fullPage:true});
  expect((await request.post(evidenceURL)).ok()).toBeTruthy();
  // Navigation is essential: CSP cannot be relaxed in an existing document.
  await parityFlow(page,request,info,'fresh-policy-recovery');
});
