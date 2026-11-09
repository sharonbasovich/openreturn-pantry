// Optional terminal audit; does not change the browser or its applied settings.
import { readFile } from 'node:fs/promises';
import { SAMPLE } from '../src/sample.mjs';
import { parseScenarioJson } from '../src/import.mjs';
import { analyzeCoverageRanges, formatTime } from '../src/model.mjs';
const args=process.argv.slice(2);
if(args.length>1 || args.some(arg=>arg.startsWith('-'))){
  console.error('Usage: node scripts/coverage-ranges.mjs [scenario.json]');process.exitCode=1;
}else{
  try{
    const scenario=args.length?parseScenarioJson(await readFile(args[0],'utf8')):SAMPLE;
    const audit=analyzeCoverageRanges(scenario),show=window=>`${formatTime(window.start)}–${formatTime(window.end)}: ${window.reachable}/${audit.domain.total}`;
    // Quote source labels/IDs so embedded newlines cannot fabricate report rows.
    const labels=ids=>ids.map(id=>JSON.stringify(scenario.origins.find(origin=>origin.id===id)?.label??id)).join(', ')||'None';
    const lines=['OPENRETURN / INTEGER-MINUTE COVERAGE AUDIT',JSON.stringify(scenario.title),
      `Service day: ${scenario.serviceDay}; data: ${scenario.dataKind}. Supplied schedule, not verified travel advice.`,
      `Opening-start bounds: ${formatTime(audit.domain.earliestStart)} through ${formatTime(audit.domain.latestStart)}, inclusive. Staffed duration: ${audit.domain.openMinutes} min.`,
      `Current opening ${show(audit.baseline)}`,`Best tested grid opening ${show(audit.gridBest)}`,`Best integer-minute opening ${show(audit.best)}`,
      `The supplied grid ${audit.gridMissesHigherCoverage?'MISSES higher coverage':'reaches the maximum coverage count'} within the bounds.`,
      `Versus grid best: gained ${labels(audit.gainedVersusGrid)}; lost ${labels(audit.lostVersusGrid)}.`,
      `Versus current: gained ${labels(audit.gainedVersusCurrent)}; lost ${labels(audit.lostVersusCurrent)}.`,
      '', 'COVERAGE RANGES',
      'Endpoints below are inclusive OPENING START times, not opening/closing windows. Every integer minute in a row covers the same origin IDs.'];
    for(const range of audit.ranges)lines.push(`${formatTime(range.start)} through ${formatTime(range.end)}: ${range.reachable}/${audit.domain.total}; IDs ${JSON.stringify(range.originIds)}`);
    lines.push('', 'LIMITATIONS',
      'Exact means every integer opening-start minute within the supplied bounds under the existing schedule model, not continuous time, real-world access, reliability or optimal welfare.',
      'Counts represent origin scenarios, not people. Review every gain and loss. Equal coverage does not establish fairness.',
      'Witnesses, waiting and headroom can change within one coverage range. This report does not claim one journey works for the whole range.',
      'Best-count ties choose the start closest to current hours, then earlier start. The browser grid and source scenario are unchanged.',
      'Use the normal app/decision sheet with the chosen start to inspect concrete witnesses before making a decision. No operator validation has occurred.');
    process.stdout.write(lines.join('\n')+'\n');
  }catch(error){console.error(`Coverage audit not generated: ${error.message}`);process.exitCode=1;}
}
