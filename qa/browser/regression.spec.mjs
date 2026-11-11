import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {capacityFixture} from './fixture.mjs';
import {SAMPLE} from '../../src/sample.mjs';
import {auditDecision,auditSensitivity} from '../../src/decision.mjs';
import {validateScenario} from '../../src/model.mjs';
import {parseScenarioJson,exportScenarioJson,connectionsToCsv} from '../../src/import.mjs';
import {buildDecisionSheet} from '../../src/report.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const heavyText=JSON.stringify(capacityFixture());
const apply='#settings-form button[type="submit"]';
async function mode(request,value){const r=await request.post('/__qa/next',{data:value});expect(r.ok()).toBeTruthy();}
async function idle(page){await expect(page.locator('#calculation-bar')).toBeHidden();}
async function ready(page){await page.goto('/');await expect(page.locator('.compare-card')).toHaveCount(2);await idle(page);}
async function checks(page){await page.locator('#check-assumptions').click();await expect(page.locator('.sensitivity-card')).toHaveCount(3);await idle(page);}
async function save(page,testInfo,kind,expected,label=kind){
  const downloadPromise=page.waitForEvent('download');
  await page.locator(kind==='txt'?'#export-report':`#export-${kind}`).click();
  const download=await downloadPromise;expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe(`openreturn-scenario.${kind}`);
  const target=testInfo.outputPath(`saved-${label}.${kind}`);await download.saveAs(target);
  const actual=await readFile(target);expect(actual.equals(Buffer.from(expected,'utf8'))).toBeTruthy();
  // Download bytes above remain exact, including CSV's required CRLF endings.
  // HTMLTextAreaElement.value normalizes CRLF and lone CR to LF (HTML API value).
  let fallbackExpected=expected;
  if(kind==='csv'){
    expect(expected).toContain('\r\n');
    expect(expected.replaceAll('\r\n','')).not.toMatch(/[\r\n]/);
    const nativeValue=await page.evaluate(()=>{
      const textarea=document.createElement('textarea');
      textarea.value='CRLF\r\nCR\rLF\nend';return textarea.value;
    });
    expect(nativeValue).toBe('CRLF\nCR\nLF\nend');
    fallbackExpected=expected.replaceAll('\r\n','\n');
    expect(await page.locator('#export-text').inputValue()).not.toContain('\r');
  }
  await expect(page.locator('#export-text')).toHaveValue(fallbackExpected);
  await testInfo.attach(`saved-${label}`,{path:target});
  await testInfo.attach(`sha256-${label}`,{body:JSON.stringify({actual:sha(actual),expected:sha(Buffer.from(expected))}),contentType:'application/json'});
}
async function draft(page){
  await page.locator('#window-chart button').first().click();
  await page.locator('#origin-list button').last().click();
  await page.locator('#field-visitMinutes').fill('19');
  await page.locator('#data-editor summary').click();
  await page.locator('#import-text').fill(heavyText);
}
async function snapshot(page){return page.evaluate(()=>{
  const ids=['comparison','tradeoffs','window-chart','window-selection','origin-list','journey-detail','selected-window','sensitivity-results','scenario-meta'];
  return {results:Object.fromEntries(ids.map(id=>[id,document.getElementById(id).innerHTML])),
    fields:[...document.querySelectorAll('#fields input')].map(e=>[e.id,e.value]),
    draft:document.getElementById('import-text').value,kind:document.getElementById('import-kind').value,
    export:document.getElementById('export-text').value};
});}
async function heldCancel(page,request,trigger,region){
  await mode(request,'held');
  const workerPromise=page.waitForEvent('worker');
  await page.locator(trigger).click();const worker=await workerPromise;
  expect(worker.url()).toMatch(/\/src\/calculation-worker\.mjs$/);
  const cancel=page.locator('#cancel-calculation');await expect(cancel).toBeVisible();await expect(cancel).toBeEnabled();await expect(cancel).toBeFocused();
  await expect(page.locator(region)).toHaveAttribute('aria-busy','true');
  expect(await page.locator('button,input,select,textarea').evaluateAll(es=>es.filter(e=>e.id!=='cancel-calculation').every(e=>e.disabled))).toBeTruthy();
  const box=await cancel.boundingBox();const viewport=page.viewportSize();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);expect(box.height).toBeGreaterThanOrEqual(40);
  const closed=new Promise(resolve=>worker.once('close',resolve));await page.keyboard.press('Enter');await closed;
  await idle(page);await expect(page.locator(trigger)).toBeFocused();await expect(page.locator('#confirm-dialog')).not.toBeVisible();
}

test.beforeEach(async({request})=>{await mode(request,'exact');});

test('EXACT: native worker ready, checks and browser-saved TXT/JSON/CSV byte parity',async({page,request},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const workers=[];page.on('worker',w=>workers.push(w.url()));
  // Verify every runtime resource is exactly the checked-out source.
  const names=['index.html','src/style.css','src/app.mjs','src/model.mjs','src/journey.mjs','src/sample.mjs','src/import.mjs','src/decision.mjs','src/report.mjs','src/report-text.mjs','src/calculation.mjs','src/calculation-worker.mjs'];
  const hashes={};for(const name of names){const response=await request.get('/'+name);expect(response.ok()).toBeTruthy();if(name==='src/calculation-worker.mjs')expect(response.headers()['x-openreturn-qa-mode']).toBe('exact');const bytes=await response.body();expect(bytes.equals(await readFile(new URL('../../'+name,import.meta.url)))).toBeTruthy();hashes[name]=sha(bytes);}
  await info.attach('exact-runtime-sha256',{body:JSON.stringify(hashes,null,2),contentType:'application/json'});
  await ready(page);await expect(page.locator('.card-count').nth(0)).toHaveText('3 / 7 origins');await expect(page.locator('.card-count').nth(1)).toHaveText('5 / 7 origins');
  const normalized=validateScenario(SAMPLE),audit=auditDecision(normalized);
  await save(page,info,'txt',buildDecisionSheet(audit),'txt-without-checks');await checks(page);
  await save(page,info,'txt',buildDecisionSheet(audit,auditSensitivity(normalized)),'txt-with-checks');
  await save(page,info,'json',exportScenarioJson(normalized));await save(page,info,'csv',connectionsToCsv(normalized.connections));
  expect(workers).toHaveLength(2);expect(workers.every(url=>url.endsWith('/src/calculation-worker.mjs'))).toBeTruthy();expect(errors).toEqual([]);
});

test('EXACT: bounded heavy import Keep/Replace, 48 windows, checks, exports and apply',async({page},info)=>{
  await ready(page);await checks(page);await draft(page);const before=await snapshot(page);
  await page.locator('#import-apply').click();await expect(page.locator('#confirm-dialog')).toBeVisible();await expect(page.locator('#confirm-cancel')).toBeFocused();await page.keyboard.press('Escape');
  expect(await snapshot(page)).toEqual(before);await expect(page.locator('#import-apply')).toBeFocused();
  await page.locator('#import-apply').click();await expect(page.locator('#confirm-dialog')).toBeVisible();await page.locator('#confirm-accept').click();
  await expect(page.locator('#window-chart button')).toHaveCount(48);await expect(page.locator('.sensitivity-card')).toHaveCount(0);await checks(page);
  const imported=parseScenarioJson(heavyText);const audit=auditDecision(imported);
  await save(page,info,'txt',buildDecisionSheet(audit,auditSensitivity(imported)));await save(page,info,'json',exportScenarioJson(imported));await save(page,info,'csv',connectionsToCsv(imported.connections));
  await page.locator('#field-visitMinutes').fill('20');await page.locator(apply).click();await expect(page.locator('#settings-status')).toContainText('Applied.');await expect(page.locator('.sensitivity-card')).toHaveCount(0);
});

for(const width of [320,390])test(`INJECTED held native worker: ${width}px keyboard import/apply/check cancellation preserves full state`,async({page,request},info)=>{
  await page.setViewportSize({width,height:844});await ready(page);await checks(page);
  await save(page,info,'txt',buildDecisionSheet(auditDecision(SAMPLE),auditSensitivity(SAMPLE)));
  await draft(page);const before=await snapshot(page);
  // Heavy input is submitted for import; apply/check still use the prior SAMPLE.
  // The injected 60s worker delay makes all cancellation windows deterministic.
  for(const [trigger,region] of [['#import-apply','#planner'],[apply,'#planner'],['#check-assumptions','#assumption-check']]){
    await heldCancel(page,request,trigger,region);expect(await snapshot(page)).toEqual(before);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  }
  await page.screenshot({path:info.outputPath(`narrow-${width}.png`),fullPage:true});
  // Dirty state survived: reset must ask permission, and Escape preserves it.
  await page.locator('#reset').click();await expect(page.locator('#confirm-dialog')).toBeVisible();await page.keyboard.press('Escape');expect(await snapshot(page)).toEqual(before);
  // Fresh unmodified worker succeeds after all canceled workers were terminated.
  await checks(page);expect(await snapshot(page)).toEqual(before);
});

test('INJECTED: initial module-load failure then exact Reset retry',async({page,request})=>{
  await mode(request,'failure');await page.goto('/');await expect(page.locator('#settings-status')).toContainText('Calculation failed:');await idle(page);
  await expect(page.locator('.compare-card')).toHaveCount(0);await expect(page.locator('#export-report')).toBeDisabled();await expect(page.locator('#check-assumptions')).toBeDisabled();await expect(page.locator('#reset')).toBeEnabled();
  await page.locator('#reset').click();await expect(page.locator('.compare-card')).toHaveCount(2);await expect(page.locator('#export-report')).toBeEnabled();await expect(page.locator('#settings-status')).toHaveText('Synthetic example restored.');
});

test('INJECTED: held initialization Cancel then exact Reset retry',async({page,request})=>{
  await mode(request,'held');await page.goto('/',{waitUntil:'commit'});await expect(page.locator('#cancel-calculation')).toBeFocused();await page.keyboard.press('Enter');await idle(page);
  await expect(page.locator('.compare-card')).toHaveCount(0);await expect(page.locator('#export-json')).toBeDisabled();await expect(page.locator('#settings-status')).toContainText('Calculation cancelled.');
  await page.locator('#reset').click();await expect(page.locator('.compare-card')).toHaveCount(2);
});

test('INJECTED: applied-state worker failure and reset cancellation preserve drafts, results and export',async({page,request},info)=>{
  await ready(page);await checks(page);await save(page,info,'txt',buildDecisionSheet(auditDecision(SAMPLE),auditSensitivity(SAMPLE)));await draft(page);const before=await snapshot(page);
  await mode(request,'failure');await page.locator(apply).click();await expect(page.locator('#settings-status')).toContainText('Calculation failed:');await idle(page);expect(await snapshot(page)).toEqual(before);
  await mode(request,'held');await page.locator('#reset').click();await expect(page.locator('#confirm-dialog')).toBeVisible();await page.locator('#confirm-accept').click();await expect(page.locator('#cancel-calculation')).toBeFocused();await page.keyboard.press('Enter');await idle(page);await expect(page.locator('#reset')).toBeFocused();expect(await snapshot(page)).toEqual(before);
  await checks(page);expect(await snapshot(page)).toEqual(before);
});


test('INJECTED: heavy applied scenario cancellation retains prior heavy checks and dirty drafts',async({page,request},info)=>{
  await ready(page);await page.locator('#data-editor summary').click();await page.locator('#import-text').fill(heavyText);
  await page.locator('#import-apply').click();await expect(page.locator('#confirm-dialog')).toBeVisible();await page.locator('#confirm-accept').click();await expect(page.locator('#window-chart button')).toHaveCount(48);await checks(page);
  const imported=parseScenarioJson(heavyText);await save(page,info,'txt',buildDecisionSheet(auditDecision(imported),auditSensitivity(imported)));
  await page.locator('#window-chart button').first().click();await page.locator('#origin-list button').last().click();await page.locator('#field-visitMinutes').fill('19');await page.locator('#import-text').fill(heavyText+'\n');
  const before=await snapshot(page);
  for(const [trigger,region] of [['#import-apply','#planner'],[apply,'#planner'],['#check-assumptions','#assumption-check']]){await heldCancel(page,request,trigger,region);expect(await snapshot(page)).toEqual(before);}
  await checks(page);expect(await snapshot(page)).toEqual(before);
});
