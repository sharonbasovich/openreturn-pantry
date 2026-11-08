// Exhaustive reference helpers. The original enumeration was authored before
// inspecting the routing implementation. The 2026-11-08 reboarding correction
// and extracted helpers are later review work, not a new blinded oracle.
// No runtime routing or transition helper is used to determine expectations.
import assert from 'node:assert/strict';
import { validateScenario, evaluateWindow, optimizeWindows } from '../../src/model.mjs';

// Remaining aboard requires exactly the previous and next leg in this closed
// portion of the vehicle chain. A third leg means the vehicle left and came back.
// This checks the full raw timetable, independently of input order or witness
// membership; it deliberately does not import the production predecessor map.
export function continuesOnBoard(s, prior, next) {
  if (!prior || prior.tripId !== next.tripId || prior.id === next.id ||
      prior.to !== next.from || prior.arrival > next.departure) return false;
  return s.connections.filter(c => c.tripId === prior.tripId &&
    c.departure >= prior.departure && c.departure <= next.departure).length === 2;
}

export function paths(s, from, to, ready, cap, prefix = [], changes = 0) {
  if (from === to) return [prefix];
  const prior = prefix.at(-1), found = [];
  for (const c of s.connections) {
    if (c.from !== from || prefix.some(x => x.id === c.id)) continue;
    const changed = prior && !continuesOnBoard(s, prior, c);
    if (c.departure < ready + (changed ? s.settings.transferMinutes : 0)) continue;
    const nextChanges = changes + (changed ? 1 : 0);
    if (nextChanges > cap) continue;
    found.push(...paths(s, c.to, to, c.arrival, cap, [...prefix, c], nextChanges));
  }
  return found;
}
export function oracle(s, start, origin) {
  const { openMinutes, visitMinutes, maxTransfers } = s.settings;
  if (origin.stopId === s.pantryStop) {
    const pickupStart = Math.max(start, origin.leaveAfter);
    return pickupStart + visitMinutes <= Math.min(start + openMinutes, origin.homeBy) && visitMinutes <= origin.maxAwayMinutes ? { away: visitMinutes, home: pickupStart + visitMinutes } : null;
  }
  const choices = [];
  for (const outbound of paths(s, origin.stopId, s.pantryStop, origin.leaveAfter, maxTransfers)) {
    for (let pickupStart = Math.max(start, outbound.at(-1).arrival); pickupStart + visitMinutes <= start + openMinutes; pickupStart++) {
      const end = pickupStart + visitMinutes;
      for (const back of paths(s, s.pantryStop, origin.stopId, end, maxTransfers)) {
        const home = back.at(-1).arrival, away = home - outbound[0].departure;
        if (home <= origin.homeBy && away <= origin.maxAwayMinutes) choices.push({away, home});
      }
    }
  }
  return choices.sort((a,b) => a.away-b.away || a.home-b.home)[0] ?? null;
}
// Derive failure stages from all enumerated paths, independently of retained labels.
export function oracleFailure(s,start,o) {
  if(o.stopId===s.pantryStop) return 'The pickup cannot fit the opening window, availability and maximum time away.';
  const outward=paths(s,o.stopId,s.pantryStop,o.leaveAfter,s.settings.maxTransfers)
    .filter(p=>p.at(-1).arrival<=o.homeBy && p.at(-1).arrival-p[0].departure<=o.maxAwayMinutes);
  if(!outward.length) return 'No outbound journey reaches the pantry within the supplied availability, maximum time away and transfer limit.';
  const pickups=[];
  for(const p of outward) {
    for(let t=Math.max(start,p.at(-1).arrival);t+s.settings.visitMinutes<=start+s.settings.openMinutes;t++) {
      const end=t+s.settings.visitMinutes;
      if(end<=o.homeBy && end-p[0].departure<=o.maxAwayMinutes) pickups.push(end);
    }
  }
  if(!pickups.length) return 'Outbound travel exists, but no pickup fits both the opening window and the supplied time limits.';
  const returns=pickups.flatMap(t=>paths(s,s.pantryStop,o.stopId,t,s.settings.maxTransfers)).filter(p=>p.at(-1).arrival<=o.homeBy);
  if(!returns.length) return 'Pickup fits, but no scheduled return reaches the origin by its home deadline within the transfer limit.';
  return 'Scheduled returns exist, but none completes a round trip within the maximum time away.';
}
export function verifyWitness(s, start, origin, row, expected) {
  assert.equal(row.reachable, !!expected, `origin ${origin.id}, start ${start}`);
  if (!expected) { assert.equal(row.journey, null); assert.equal(row.reason,oracleFailure(s,start,origin)); return; }
  const j = row.journey;
  assert.ok(j);
  function verifyLeg(legs, from, to, ready) {
    let at = from, time = ready, prior = null, changes = 0;
    for (const c of legs) {
      assert.deepEqual(c, s.connections.find(x => x.id === c.id));
      assert.equal(c.from, at);
      const changed = prior !== null && !continuesOnBoard(s, prior, c);
      changes += changed ? 1 : 0;
      assert.ok(c.departure >= time + (changed ? s.settings.transferMinutes : 0));
      assert.ok(c.arrival > c.departure);
      at = c.to; time = c.arrival; prior = c;
    }
    assert.equal(at, to);
    assert.ok(changes <= s.settings.maxTransfers);
    return time;
  }
  const outwardArrival = verifyLeg(j.outbound, origin.stopId, s.pantryStop, origin.leaveAfter);
  assert.ok(j.pickupStart >= Math.max(start, outwardArrival));
  assert.equal(j.pickupEnd-j.pickupStart, s.settings.visitMinutes);
  assert.ok(j.pickupEnd <= start+s.settings.openMinutes);
  const home = verifyLeg(j.return, s.pantryStop, origin.stopId, j.pickupEnd);
  assert.equal(j.depart, j.outbound[0]?.departure ?? j.pickupStart);
  assert.equal(j.arrive, home);
  assert.ok(j.depart >= origin.leaveAfter && home <= origin.homeBy);
  assert.equal(j.awayMinutes, home-j.depart);
  assert.ok(j.awayMinutes <= origin.maxAwayMinutes);
  assert.equal(j.awayMinutes, expected.away, 'must minimize away time');
  assert.equal(j.arrive, expected.home, 'equal-away tie must return earlier');
  const travel = [...j.outbound,...j.return].reduce((n,c)=>n+c.arrival-c.departure,0);
  assert.equal(j.waitMinutes, j.awayMinutes-travel-s.settings.visitMinutes);
}
export const coverage = { windows: 0, origins: 0, reachableTransit: 0, unreachable: 0 };
export function compare(s) {
  validateScenario(s);
  const expectedWindows = [];
  const check = start => {
    const actual = evaluateWindow(s,start); coverage.windows++;
    assert.equal(actual.start,start); assert.equal(actual.end,start+s.settings.openMinutes);
    assert.equal(actual.total,s.origins.length); assert.equal(actual.results.length,s.origins.length);
    let count = 0;
    for (const o of s.origins) {
      const expected = oracle(s,start,o); count += expected ? 1 : 0;
      coverage.origins++; if(expected && o.stopId!==s.pantryStop)coverage.reachableTransit++; if(!expected)coverage.unreachable++;
      const rows = actual.results.filter(x=>x.originId===o.id); assert.equal(rows.length,1);
      verifyWitness(s,start,o,rows[0],expected);
    }
    assert.equal(actual.reachable,count); return actual;
  };
  for(let t=s.settings.earliestStart;t<=s.settings.latestStart;t+=s.settings.stepMinutes) expectedWindows.push(check(t));
  const baseline = check(s.settings.baselineStart);
  const opt = optimizeWindows(s);
  const best = [...expectedWindows].sort((a,b)=>b.reachable-a.reachable || Math.abs(a.start-baseline.start)-Math.abs(b.start-baseline.start) || a.start-b.start)[0];
  assert.equal(opt.best.start,best.start); assert.equal(opt.best.reachable,best.reachable);
  assert.equal(opt.baseline.start,baseline.start); assert.equal(opt.baseline.reachable,baseline.reachable);
  assert.deepEqual(opt.windows.map(w=>w.start),expectedWindows.map(w=>w.start));
  return opt;
}
