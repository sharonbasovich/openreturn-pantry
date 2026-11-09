import { reportText } from './report-text.mjs';
import { continuationCheck } from './journey.mjs';
import { validateScenario, optimizeWindows, formatTime } from './model.mjs';

// All quantities describe the engine's retained scheduled witnesses. They do
// not add constraints or optimize waiting, and they are not delay tolerances.
function summarizeWindow(scenario, window) {
  const origins = new Map(scenario.origins.map(o => [o.id, o]));
  const continuesOnBoard = continuationCheck(scenario.connections);
  const journeys = window.results.filter(r => r.reachable).map(result => {
    const origin = origins.get(result.originId), j = result.journey;
    const waits = { beforeVisit: 0, afterVisit: 0, transfers: 0, onBoard: 0 };
    const transferHeadroom = [];
    for (const leg of [j.outbound, j.return]) {
      for (let i = 1; i < leg.length; i++) {
        const previous = leg[i - 1], next = leg[i], gap = next.departure - previous.arrival;
        if (continuesOnBoard(previous, next)) waits.onBoard += gap;
        else {
          waits.transfers += gap;
          transferHeadroom.push(gap - scenario.settings.transferMinutes);
        }
      }
    }
    if (j.outbound.length) waits.beforeVisit = j.pickupStart - j.outbound.at(-1).arrival;
    if (j.return.length) waits.afterVisit = j.return[0].departure - j.pickupEnd;
    return {
      originId: origin.id, label: origin.label, awayMinutes: j.awayMinutes,
      waitMinutes: j.waitMinutes, ridingMinutes: j.awayMinutes - j.waitMinutes - scenario.settings.visitMinutes,
      waits,
      headroom: {
        away: origin.maxAwayMinutes - j.awayMinutes,
        home: origin.homeBy - j.arrive,
        closing: window.end - j.pickupEnd,
        returnDeparture: j.return.length ? j.return[0].departure - j.pickupEnd : null,
        transfer: transferHeadroom.length ? Math.min(...transferHeadroom) : null
      }
    };
  });
  const values = key => journeys.map(j => j[key]);
  const range = key => journeys.length ? { min: Math.min(...values(key)), max: Math.max(...values(key)) } : null;
  return {
    start: window.start, end: window.end, reachable: window.reachable, total: window.total,
    journeys, waitRange: range('waitMinutes'), awayRange: range('awayMinutes'),
    zeroHeadroom: Object.fromEntries(['away', 'home', 'closing', 'returnDeparture', 'transfer'].map(key =>
      [key, journeys.filter(j => j.headroom[key] === 0).map(j => j.originId)]))
  };
}

export function auditDecision(input) {
  const scenario = validateScenario(input), comparison = optimizeWindows(scenario);
  return {
    scenario, comparison,
    baseline: summarizeWindow(scenario, comparison.baseline),
    best: summarizeWindow(scenario, comparison.best),
    windows: comparison.windows.map(w => summarizeWindow(scenario, w)),
    tiedBestStarts: comparison.windows.filter(w => w.reachable === comparison.best.reachable).map(w => w.start)
  };
}

const hypotheses = [
  { id: 'longer-visit', label: 'Visit +15 minutes', visit: 15, transfer: 0 },
  { id: 'longer-transfer', label: 'Transfer buffer +5 minutes', visit: 0, transfer: 5 },
  { id: 'both', label: 'Both changes', visit: 15, transfer: 5 }
];
const reachableIds = window => window.results.filter(r => r.reachable).map(r => r.originId);
const difference = (a, b) => a.filter(id => !b.includes(id));

export function auditSensitivity(input) {
  const original = auditDecision(input), { scenario, comparison } = original;
  const oldIds = reachableIds(comparison.best);
  const cases = hypotheses.map(hypothesis => {
    const settings = { ...scenario.settings,
      visitMinutes: scenario.settings.visitMinutes + hypothesis.visit,
      transferMinutes: scenario.settings.transferMinutes + hypothesis.transfer };
    const metadata = { id: hypothesis.id, label: hypothesis.label, visitMinutes: settings.visitMinutes, transferMinutes: settings.transferMinutes };
    let changed;
    try { changed = validateScenario({ ...scenario, settings }); }
    catch (error) { return { ...metadata, status: 'not-applicable', reason: error.message }; }
    // Only input validation is handled as a skipped hypothesis. An engine or
    // analysis defect must surface as an error, never a reassuring skip.
    const alternative = auditDecision(changed), c = alternative.comparison;
    const fixed = c.windows.find(w => w.start === comparison.best.start);
    const fixedIds = reachableIds(fixed), bestIds = reachableIds(c.best);
    const variantBaselineIds = reachableIds(c.baseline);
    return {
      ...metadata, status: 'evaluated',
      current: alternative.baseline,
      fixed: summarizeWindow(changed, fixed),
      fixedLost: difference(oldIds, fixedIds), fixedGained: difference(fixedIds, oldIds),
      reoptimized: alternative.best,
      reoptimizedLost: difference(oldIds, bestIds), reoptimizedGained: difference(bestIds, oldIds),
      reoptimizedNet: c.best.reachable - c.baseline.reachable,
      versusChangedCurrentLost: difference(variantBaselineIds, bestIds),
      versusChangedCurrentGained: difference(bestIds, variantBaselineIds),
      tiedBestStarts: alternative.tiedBestStarts
    };
  });
  return { scenario, appliedBestStart: comparison.best.start, appliedBestReachable: comparison.best.reachable, cases };
}

const windowLabel = w => `${formatTime(w.start)}–${formatTime(w.end)}`;
const rangeLabel = r => r === null ? 'No feasible journeys' : r.min === r.max ? `${r.min} min` : `${r.min}–${r.max} min`;
export { rangeLabel };

export function decisionAuditLines(audit, sensitivity = null) {
  // Refuse mismatched/stale results rather than attaching a check for a different
  // scenario to an export. The application also clears checks on every commit.
  if (sensitivity && JSON.stringify(audit.scenario) !== JSON.stringify(sensitivity.scenario))
    throw new Error('Assumption checks belong to different applied data. Run them again.');
  const labels = ids => ids.map(id => reportText(audit.scenario.origins.find(o => o.id === id)?.label ?? id)).join(', ') || 'None';
  const lines = ['SCHEDULE BURDEN AND HEADROOM',
    'Ranges cover feasible origin scenarios only, not people. Witnesses minimize time away, not waiting.',
    'Headroom is arithmetic for the displayed scheduled witness, not a guarantee of delay tolerance.'];
  for (const [label, window] of [['CURRENT', audit.baseline], ['BEST TESTED', audit.best]]) {
    lines.push(`${label} ${windowLabel(window)}: waits ${rangeLabel(window.waitRange)}; time away ${rangeLabel(window.awayRange)}.`);
    for (const j of window.journeys) lines.push(
      `  ${reportText(j.label)} (${reportText(j.originId)}): wait ${j.waitMinutes} = before visit ${j.waits.beforeVisit} + after visit ${j.waits.afterVisit} + transfers ${j.waits.transfers} + on-board dwell ${j.waits.onBoard} min; riding ${j.ridingMinutes} min.`,
      `  Remaining minutes: away allowance ${j.headroom.away}; home deadline ${j.headroom.home}; closing ${j.headroom.closing}; return departure ${j.headroom.returnDeparture ?? 'not applicable'}; minimum transfer/reboarding buffer headroom ${j.headroom.transfer ?? 'not applicable'}.`);
  }
  lines.push(`Highest-coverage grid starts (${audit.tiedBestStarts.length}): ${audit.tiedBestStarts.map(formatTime).join(', ')}.`,
    'The selected tie-break favors the start closest to current hours, then earlier start. Equal counts can cover different origins or waits.');
  lines.push('', 'ASSUMPTION CHECKS');
  if (!sensitivity) lines.push('Not run for these applied data. No sensitivity conclusion is available.');
  else {
    lines.push(`Hypothetical changes, not measured delays or probabilities. Fixed window: ${windowLabel(audit.comparison.best)}. Reoptimization may change hours; it does not rescue the fixed window.`,
      `Applied visit ${audit.scenario.settings.visitMinutes} min; transfer buffer ${audit.scenario.settings.transferMinutes} min.`);
    for (const item of sensitivity.cases) {
      lines.push(`${item.label}: visit ${item.visitMinutes} min; transfer buffer ${item.transferMinutes} min.`);
      if (item.status !== 'evaluated') { lines.push(`  NOT APPLICABLE: ${item.reason}`); continue; }
      lines.push(`  Current hours with changed assumptions: ${item.current.reachable}/${item.current.total}.`,
        `  Keep applied best hours ${windowLabel(item.fixed)}: ${item.fixed.reachable}/${item.fixed.total}; lost from applied best: ${labels(item.fixedLost)}; gained: ${labels(item.fixedGained)}.`,
        `  Search again ${windowLabel(item.reoptimized)}: ${item.reoptimized.reachable}/${item.reoptimized.total}; net ${item.reoptimizedNet >= 0 ? '+' : ''}${item.reoptimizedNet} versus current hours under the SAME changed assumptions.`,
        `  Search-again losses from applied best: ${labels(item.reoptimizedLost)}; gains: ${labels(item.reoptimizedGained)}.`,
        `  Search-again losses versus changed current: ${labels(item.versusChangedCurrentLost)}; gains: ${labels(item.versusChangedCurrentGained)}.`,
        `  Highest-coverage grid starts: ${item.tiedBestStarts.map(formatTime).join(', ')}.`);
    }
  }
  return lines;
}
