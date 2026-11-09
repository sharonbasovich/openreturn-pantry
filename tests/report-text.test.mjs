import test from 'node:test';
import assert from 'node:assert/strict';
import {SAMPLE} from '../src/sample.mjs';
import {auditDecision,auditSensitivity,decisionAuditLines} from '../src/decision.mjs';
import {buildDecisionSheet} from '../src/report.mjs';
import {reportText} from '../src/report-text.mjs';
import {exportScenarioJson,parseScenarioJson} from '../src/import.mjs';
const payload='Label\nLost: None\r\x1b[2J\t\x00\x85\u2028\u2029\u202e"\\u000a café 東京 🥕';
test('report text visibly escapes controls, line separators, bidi overrides and lone surrogates only',()=>{
  assert.equal(reportText('café 東京 🥕 "quotes"'), 'café 東京 🥕 "quotes"');
  assert.equal(reportText('\n\r\t\x1b\x85\u2028\u2029\u202e\ud800\\n'), '\\u000a\\u000d\\u0009\\u001b\\u0085\\u2028\\u2029\\u202e\\ud800\\\\n');
  assert.notEqual(reportText('\n'),reportText('\\u000a'));
});
for(const field of ['title','origin label','origin id','stop name','connection id','trip id'])test(`decision export contains ${field} as one visible field, with exact JSON preserved`,()=>{
  const s=structuredClone(SAMPLE);
  if(field==='title')s.title=payload;
  if(field==='origin label')s.origins.forEach(o=>o.label=payload);
  if(field==='origin id')s.origins.forEach((o,i)=>o.id=payload+i);
  if(field==='stop name')s.stops.forEach(o=>o.name=payload);
  if(field==='connection id')s.connections.forEach((c,i)=>c.id=payload+i);
  if(field==='trip id') {const ids=new Map([...new Set(s.connections.map(c=>c.tripId))].map((id,i)=>[id,payload+i]));s.connections.forEach(c=>c.tripId=ids.get(c.tripId));}
  const before=JSON.stringify(s),audit=auditDecision(s),sensitivity=auditSensitivity(s),text=buildDecisionSheet(audit,sensitivity);
  assert(text.includes(reportText(payload)));
  assert(!text.includes(payload));
  assert(!/[\r\x00-\x09\x0b-\x1f\x7f-\x9f\u2028\u2029\u202e]/u.test(text));
  assert.equal(text.split('\n').filter(l=>l.startsWith('Lost:')).length,1);
  assert.equal(text.split('\n').filter(l=>l.startsWith('Best tested:')).length,1);
  assert.equal(JSON.stringify(s),before);
  assert.deepEqual(parseScenarioJson(exportScenarioJson(s)),audit.scenario);
  assert.equal(audit.comparison.best.reachable,5);
  assert.equal(audit.comparison.baseline.reachable,3);
  if(field.startsWith('origin'))assert(!decisionAuditLines(audit,sensitivity).some(l=>l.includes('\n')));
});
