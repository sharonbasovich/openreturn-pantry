import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { SAMPLE } from '../src/sample.mjs';
import { optimizeWindows } from '../src/model.mjs';
import { auditDecision, auditSensitivity, decisionAuditLines } from '../src/decision.mjs';
import { buildDecisionSheet } from '../src/report.mjs';

const clone = value => structuredClone(value);
const freeze = value => { Object.values(value).forEach(v => { if(v && typeof v === 'object') freeze(v); });return Object.freeze(value); };
test('decision audit preserves every original routing result',()=>{
  assert.deepEqual(auditDecision(SAMPLE).comparison,optimizeWindows(SAMPLE));
});
test('same-vehicle dwell is distinct from a transfer and waiting phases reconcile',()=>{
  const a=auditDecision(SAMPLE), h=a.best.journeys.find(j=>j.originId==='hilltop');
  assert.deepEqual(h.waits,{beforeVisit:25,afterVisit:0,transfers:0,onBoard:6});
  assert.equal(h.waitMinutes,31);assert.equal(h.ridingMinutes,49);assert.equal(h.headroom.transfer,null);
  assert.equal(h.headroom.returnDeparture,0);assert.deepEqual(a.best.zeroHeadroom.returnDeparture,['hilltop']);
});
test('minimum true-transfer headroom counts the required buffer once',()=>{
  const j=auditDecision(SAMPLE).best.journeys.find(j=>j.originId==='west');
  assert.deepEqual(j.waits,{beforeVisit:0,afterVisit:15,transfers:12,onBoard:0});
  assert.equal(j.headroom.transfer,1);assert.equal(j.waitMinutes,27);
});
test('three named sensitivity cases distinguish holding hours from searching again',()=>{
  const a=auditSensitivity(SAMPLE);
  assert.deepEqual(a.cases.map(c=>[c.id,c.fixed.reachable,c.reoptimized.reachable,c.reoptimized.start,c.reoptimizedNet]),[
    ['longer-visit',3,4,615,1],['longer-transfer',4,4,630,1],['both',2,3,540,0]
  ]);
  assert.deepEqual(a.cases[2].fixedLost,['hilltop','west','east']);
  assert.deepEqual(a.cases[2].reoptimizedLost,['west','orchard','east']);
  assert.deepEqual(a.cases[2].reoptimizedGained,['maple']);
});
test('comparison uses current hours under the same changed assumptions',()=>{
  const s=clone(SAMPLE);s.settings.baselineStart=630;
  const a=auditSensitivity(s).cases[0];assert.equal(a.current.reachable,3);assert.equal(a.reoptimized.reachable,4);assert.equal(a.reoptimizedNet,1);
});
test('off-grid baseline remains available and is not inserted into tied grid starts',()=>{
  const s=clone(SAMPLE);s.settings.baselineStart=547;
  const a=auditDecision(s);assert.equal(a.baseline.start,547);assert(!a.windows.some(w=>w.start===547));assert(!a.tiedBestStarts.includes(547));
});
test('on-site origin has no boarding or vehicle-change headroom',()=>{
  const s=clone(SAMPLE);s.origins=[{id:'at-pantry',label:'At pantry stop',stopId:'P',leaveAfter:540,homeBy:555,maxAwayMinutes:15}];
  const j=auditDecision(s).baseline.journeys[0];
  assert.equal(j.awayMinutes,15);assert.equal(j.waitMinutes,0);assert.equal(j.ridingMinutes,0);
  assert.deepEqual(j.headroom,{away:0,home:0,closing:105,returnDeparture:null,transfer:null});
});
test('no feasible journeys uses null ranges, not misleading zero waiting',()=>{
  const s=clone(SAMPLE);s.origins=s.origins.filter(o=>o.id==='wharf');
  const a=auditDecision(s);assert.equal(a.best.waitRange,null);assert.equal(a.best.awayRange,null);assert.equal(a.best.journeys.length,0);
  assert.equal(a.tiedBestStarts.length,a.windows.length);assert.match(decisionAuditLines(a).join('\n'),/No feasible journeys/);
});
test('invalid longer visit is explicitly skipped rather than clamped',()=>{
  const s=clone(SAMPLE);s.settings.visitMinutes=110;
  const a=auditSensitivity(s);assert.equal(a.cases[0].status,'not-applicable');assert.equal(a.cases[0].visitMinutes,125);
  assert.match(a.cases[0].reason,/visitMinutes/);assert.equal(a.cases[1].status,'evaluated');assert.equal(a.cases[2].status,'not-applicable');
});
test('invalid longer transfer is explicitly skipped rather than clamped',()=>{
  const s=clone(SAMPLE);s.settings.transferMinutes=2879;
  const a=auditSensitivity(s);assert.equal(a.cases[0].status,'evaluated');assert.equal(a.cases[1].status,'not-applicable');assert.equal(a.cases[1].transferMinutes,2884);
});
test('frozen input survives both analyses and caller mutation is isolated',()=>{
  const s=freeze(clone(SAMPLE)), snapshot=JSON.stringify(s);const a=auditDecision(s),b=auditSensitivity(s);
  assert.equal(JSON.stringify(s),snapshot);a.scenario.origins[0].label='changed';b.scenario.settings.visitMinutes=99;assert.equal(JSON.stringify(s),snapshot);
});
test('report states checks were not run and refuses mismatched cached checks',()=>{
  const a=auditDecision(SAMPLE);assert.match(buildDecisionSheet(a),/Not run for these applied data/);
  const s=clone(SAMPLE);s.settings.visitMinutes=30;
  assert.throws(()=>buildDecisionSheet(a,auditSensitivity(s)),/different applied data/);
});
test('report includes assumptions, wait breakdown, origin losses, fixed and reoptimized hours',()=>{
  const text=buildDecisionSheet(auditDecision(SAMPLE),auditSensitivity(SAMPLE));
  for(const phrase of ['scheduled witness','not a guarantee of delay tolerance','Keep applied best hours 10:30–12:30: 2/7','Search again 09:00–11:00: 3/7','West End, Orchard, Eastbank','SAME changed assumptions','CURRENT: 09:00–11:00','BEST TESTED: 10:30–12:30']) assert(text.includes(phrase),phrase);
});
test('terminal export is the same pure report as the application',()=>{
  const result=execFileSync(process.execPath,['scripts/decision-sheet.mjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(result,buildDecisionSheet(auditDecision(SAMPLE),auditSensitivity(SAMPLE))+'\n');
});
test('terminal rejects missing files and invalid arguments without writing a report',()=>{
  for(const args of [['--bad'],['not-an-existing-scenario.json']]){
    const result=spawnSync(process.execPath,['scripts/decision-sheet.mjs',...args],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
    assert.equal(result.status,1);assert.equal(result.stdout,'');assert(result.stderr.length>0);
  }
});

for(const visit of [1,15,30,45,120]) for(const transfer of [0,5,6,10]) {
  test(`all window witnesses reconcile for visit ${visit}, transfer ${transfer}`,()=>{
    const s=clone(SAMPLE);s.settings.visitMinutes=visit;s.settings.transferMinutes=transfer;
    const a=auditDecision(s);
    for(const w of [a.baseline,...a.windows])for(const j of w.journeys){
      assert.equal(Object.values(j.waits).reduce((x,y)=>x+y,0),j.waitMinutes);
      assert.equal(j.ridingMinutes+j.waitMinutes+visit,j.awayMinutes);
      for(const n of Object.values(j.headroom))assert(n===null||Number.isInteger(n)&&n>=0);
      assert(w.waitRange.min<=j.waitMinutes&&w.waitRange.max>=j.waitMinutes);
      assert(w.awayRange.min<=j.awayMinutes&&w.awayRange.max>=j.awayMinutes);
    }
  });
}
