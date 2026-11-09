// Offline terminal export. Browser-rendering and download acceptance are separate.
import { readScenarioFile } from './read-scenario-file.mjs';
import { SAMPLE } from '../src/sample.mjs';
import { parseScenarioJson } from '../src/import.mjs';
import { auditDecision, auditSensitivity } from '../src/decision.mjs';
import { buildDecisionSheet } from '../src/report.mjs';
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => arg.startsWith('-'))) {
  console.error('Usage: node scripts/decision-sheet.mjs [scenario.json]');
  process.exitCode = 1;
} else {
  try {
    const scenario = args.length ? parseScenarioJson(await readScenarioFile(args[0])) : SAMPLE;
    process.stdout.write(buildDecisionSheet(auditDecision(scenario), auditSensitivity(scenario)) + '\n');
  } catch (error) {
    console.error(`Decision sheet not generated: ${error.message}`);
    process.exitCode = 1;
  }
}
