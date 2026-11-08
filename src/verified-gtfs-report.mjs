/** Node-only, pure composition: replay and report use the same captured strings. */
import {verifyGtfsReceipt} from './verify-gtfs-receipt.mjs';
import {parseScenarioJson} from './import.mjs';
import {auditDecision,auditSensitivity} from './decision.mjs';
import {buildDecisionSheet} from './report.mjs';

export function buildVerifiedGtfsReport({scenarioText,receiptText,templateText,files}) {
  // No path reopening, callbacks or asynchronous work between replay and reporting.
  const verification=verifyGtfsReceipt({scenarioText,receiptText,templateText,files});
  const receipt=JSON.parse(receiptText.replace(/^\uFEFF/,''));
  const scenario=parseScenarioJson(scenarioText);
  const body=buildDecisionSheet(auditDecision(scenario),auditSensitivity(scenario));
  const policy=receipt.version===1?'reject-blocks':'separate-trips';
  const lines=[
    'OPENRETURN / LOCAL REPLAY PROVENANCE',
    `Check: ${verification.check}; receipt ${verification.receiptVersion}; adapter ${verification.adapterVersion}.`,
    `Receipt-declared service day: ${receipt.serviceDay}`,
    `Replayed agency timezone: ${JSON.stringify(receipt.timeZone)}`,
    `Replayed time basis: ${JSON.stringify(receipt.timeBasis)}`,
    `Receipt-declared selection: ${receipt.selection.kind} ${JSON.stringify(receipt.selection.ids)}`,
    `Selected active trips: ${JSON.stringify(receipt.selection.selectedTripIds)}`,
    `Block policy: ${policy}`,
    `Scenario SHA-256 (exact supplied UTF-8 bytes): ${verification.scenarioSha256}`,
    `Receipt SHA-256 (exact supplied UTF-8 bytes): ${verification.receiptSha256}`,
    verification.assurance,
    'The feed is not independently authenticated. This does not confirm intended date/scope, source completeness or currentness, licensing, access, or real-world feasibility.',
    'The report below derives from the same scenario bytes checked in this process. The CLI reads inputs once, sequentially; this is not an atomic filesystem snapshot. A consistently replaced input set can pass.',
    policy==='separate-trips'
      ? 'LOSSY SEPARATE-TRIPS POLICY: block membership is provenance only. No inter-trip onboard continuation is modeled; distinct trips use ordinary transfer rules. Missing onboard options can change coverage and rankings; results are not globally conservative or vehicle-feasibility evidence.'
      : 'Reject-blocks policy: selected trips with nonempty block IDs are refused; this is not block support.',
    'Replayed adapter limitations:',
    ...receipt.limitations.map(value=>`- ${value}`),
    'The unchanged decision-sheet body retains its general unverified-schedule warnings; this prefix adds only the limited local replay check.',
    '',
    body
  ];
  return lines.join('\n');
}
