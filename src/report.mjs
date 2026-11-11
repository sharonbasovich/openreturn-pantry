import { reportText } from './report-text.mjs';
import { formatTime } from './model.mjs';
import { decisionAuditLines } from './decision.mjs';
const range = w => `${formatTime(w.start)}–${formatTime(w.end)}`;
export const SETTINGS_FIELDS = [
  ['baselineStart','Current start','time'], ['openMinutes','Staffed minutes','number'],
  ['earliestStart','Earliest start','time'], ['latestStart','Latest start','time'],
  ['visitMinutes','Visit minutes','number'], ['stepMinutes','Search step (min)','number'],
  ['transferMinutes','Transfer buffer (min)','number'], ['maxTransfers','Max transfers / leg','number']
];
export function buildDecisionSheet(audit, sensitivity = null) {
  const { scenario, comparison } = audit;
  const fields = SETTINGS_FIELDS;
  const originLabels = ids => ids.map(id => reportText(scenario.origins.find(o => o.id === id)?.label ?? id)).join(', ') || 'None';
  const lines=['OPENRETURN / DECISION SHEET',reportText(scenario.title),`Service day: ${scenario.serviceDay}`,`Data: ${scenario.dataKind}. Unverified scheduled stop-to-stop scenarios, not travel advice.`, '', `Current: ${range(comparison.baseline)} — ${comparison.baseline.reachable}/${comparison.baseline.total} origins`, `Best tested: ${range(comparison.best)} — ${comparison.best.reachable}/${comparison.best.total} origins`, `Gained: ${originLabels(comparison.gained)}`, `Lost: ${originLabels(comparison.lost)}`, '', 'APPLIED CONSTRAINTS'];
  for(const [key,label,type] of fields)lines.push(`${label}: ${type==='time'?formatTime(scenario.settings[key]):scenario.settings[key]}`);
  lines.push('',...decisionAuditLines(audit,sensitivity));
  const stop=id=>reportText(scenario.stops.find(s=>s.id===id)?.name??id);
  for(const [label,window] of [['CURRENT',comparison.baseline],['BEST TESTED',comparison.best]]) {
    lines.push('',`${label}: ${range(window)}`);
    for(const origin of scenario.origins) {
      const r=window.results.find(x=>x.originId===origin.id);
      lines.push('',`${reportText(origin.label)} (${reportText(origin.id)})`, `Origin stop: ${stop(origin.stopId)}; leave after ${formatTime(origin.leaveAfter)}; home by ${formatTime(origin.homeBy)}; maximum away ${origin.maxAwayMinutes} min.`);
      if(!r?.reachable||!r.journey){lines.push(`NO COMPLETE TRIP: ${r?.reason||'No feasible return witness.'}`);continue;}
      const j=r.journey;
      for(const c of j.outbound)lines.push(`Outbound ${formatTime(c.departure)}–${formatTime(c.arrival)}: ${stop(c.from)} → ${stop(c.to)} [trip ${reportText(c.tripId)}, connection ${reportText(c.id)}]`);
      lines.push(`Visit ${formatTime(j.pickupStart)}–${formatTime(j.pickupEnd)} at ${stop(scenario.pantryStop)}`);
      for(const c of j.return)lines.push(`Return ${formatTime(c.departure)}–${formatTime(c.arrival)}: ${stop(c.from)} → ${stop(c.to)} [trip ${reportText(c.tripId)}, connection ${reportText(c.id)}]`);
      lines.push(`Back ${formatTime(j.arrive)}; ${j.awayMinutes} minutes away; ${j.waitMinutes} scheduled wait minutes.`);
    }
  }
  lines.push('', 'LIMITATIONS', 'Counts represent origins, not people served or real-world impact. Equal staffed duration does not establish fairness. Review every lost origin.', 'Best means highest reachable count among tested start times only, then closest to current start, then earlier start; a coarse step may miss better windows. One feasible witness is shown per origin, not a guaranteed itinerary.', 'One supplied service-day timetable. No walking, live delays, cancellations, fares, wheelchair accessibility, capacity, demand, or automatic service-calendar / GTFS verification.', 'Verify the date, timetable, stop access and local assumptions with operators and the community before changing real opening hours.', 'No accounts, telemetry or autosave. This export contains applied data only; unapplied drafts are excluded.');
  return lines.join('\n');
}
