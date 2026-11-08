import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE } from '../../src/sample.mjs';
import { validateScenario } from '../../src/model.mjs';
import { auditDecision, auditSensitivity } from '../../src/decision.mjs';
import { buildDecisionSheet } from '../../src/report.mjs';
import { exportScenarioJson, parseScenarioJson, connectionsToCsv, parseTimetableCsv } from '../../src/import.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(root, 'downloads', name), 'utf8');
const exact = (name, expected) => assert.deepEqual(
  fs.readFileSync(path.join(root, 'downloads', name)), Buffer.from(expected, 'utf8'));
const s = validateScenario(SAMPLE);
exact('synthetic.json', exportScenarioJson(s));
exact('synthetic.csv', connectionsToCsv(s.connections));
assert.deepEqual(parseScenarioJson(read('synthetic.json')), s);
assert.deepEqual(parseTimetableCsv(read('synthetic.csv')), s.connections);
exact('synthetic-with-checks.txt', buildDecisionSheet(auditDecision(s), auditSensitivity(s)));
exact('synthetic-without-checks.txt', buildDecisionSheet(auditDecision(s), null));
const unsafe = structuredClone(s);
unsafe.title = 'Synthetic CSV rejection check';
unsafe.connections[0].id = '=not-a-formula-evaluation';
exact('unsafe-id.json', exportScenarioJson(unsafe));
assert.deepEqual(parseScenarioJson(read('unsafe-id.json')), validateScenario(unsafe));
assert.throws(() => connectionsToCsv(unsafe.connections), /formula-leading/);
console.log('Five synthetic saved files match exactly; JSON/CSV parse back; unsafe ID remains exact.');
