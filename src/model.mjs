/**
 * OpenReturn v1: exact enumeration of the allowed opening-start grid over a
 * supplied, single-service-day timetable. No walking, live data or date logic.
 * Limits: 64 stops, 24 origins, 1200 legs, 48 grid starts, 0..2879 minutes.
 * Each tripId identifies one continuous non-overlapping vehicle chain. Transfers
 * (0..3) are capped separately in each direction; pickup resets boarding.
 * Time away starts at the first actual departure, not leaveAfter. A pantry-stop
 * origin has zero travel and visitMinutes away. waitMinutes excludes riding and
 * pickup, but includes transfer waits, vehicle dwell and waiting for opening.
 * For each feasible first departure, keep the earliest outward arrival, breaking
 * equal-arrival ties by shortlex (fewer legs, then lexicographic connection IDs).
 * For that candidate, keep the earliest return with the same path tie rule.
 * Rank these retained complete journeys by minimum away, earlier home arrival,
 * outbound shortlex, then return shortlex. This minimizes away time, but is not
 * a global shortest/fewest-leg tie-break across every feasible complete journey:
 * a later outward arrival at the same departure may have been discarded.
 * Unknown fields are discarded; all public operations validate and clone input.
 */
const MAX_TIME = 2879;
const fail = message => { throw new Error(message); };
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}
function integer(value, label, min = 0, max = MAX_TIME) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}
function string(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} must be nonempty text of at most ${max} characters.`);
  return value;
}
function list(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} must contain ${min} to ${max} entries.`);
  return value;
}
function unique(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) fail(`${label} has duplicate id: ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
// Shortlex is stable, locale independent and preserved when appending a leg.
function pathCompare(a,b) {
  if (a.length !== b.length) return a.length - b.length;
  for (let i=0; i<a.length; i++) { const c = cmp(a[i].id,b[i].id); if(c) return c; }
  return 0;
}
export function validateScenario(data) {
  const d = object(data, 'Scenario');
  if (d.version !== 1) fail('Scenario version must be 1.');
  const title = string(d.title,'title');
  const serviceDay = string(d.serviceDay,'serviceDay',10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDay) || !Number.isFinite(Date.parse(`${serviceDay}T00:00:00Z`)) || new Date(`${serviceDay}T00:00:00Z`).toISOString().slice(0,10) !== serviceDay) fail('serviceDay must be a valid YYYY-MM-DD date (informational only).');
  if (!['synthetic','user-supplied'].includes(d.dataKind)) fail('dataKind must be synthetic or user-supplied.');
  const stops = list(d.stops,'stops',2,64).map((v,i) => {
    const s = object(v,`stops[${i}]`); return {id:string(s.id,`stops[${i}].id`,80),name:string(s.name,`stops[${i}].name`)};
  });
  const stopIds = unique(stops,'stops');
  const stop = (v,label) => { string(v,label,80); if (!stopIds.has(v)) fail(`${label} references unknown stop: ${v}.`); return v; };
  const pantryStop = stop(d.pantryStop,'pantryStop');
  const origins = list(d.origins,'origins',1,24).map((v,i) => {
    const o = object(v,`origins[${i}]`), p = `origins[${i}]`;
    const out = {id:string(o.id,`${p}.id`,80),stopId:stop(o.stopId,`${p}.stopId`),label:string(o.label,`${p}.label`),leaveAfter:integer(o.leaveAfter,`${p}.leaveAfter`),homeBy:integer(o.homeBy,`${p}.homeBy`),maxAwayMinutes:integer(o.maxAwayMinutes,`${p}.maxAwayMinutes`,1)};
    if (out.leaveAfter > out.homeBy) fail(`${p}.leaveAfter must not exceed homeBy.`);
    return out;
  });
  unique(origins,'origins');
  const connections = list(d.connections,'connections',1,1200).map((v,i) => {
    const c = object(v,`connections[${i}]`), p = `connections[${i}]`;
    const out = {id:string(c.id,`${p}.id`,80),tripId:string(c.tripId,`${p}.tripId`,80),from:stop(c.from,`${p}.from`),to:stop(c.to,`${p}.to`),departure:integer(c.departure,`${p}.departure`),arrival:integer(c.arrival,`${p}.arrival`)};
    if(out.arrival <= out.departure) fail(`${p} must have positive travel duration.`);
    if(out.from === out.to) fail(`${p} must connect different stops.`);
    return out;
  });
  unique(connections,'connections');
  connections.sort((a,b)=>a.departure-b.departure || a.arrival-b.arrival || cmp(a.id,b.id));
  const trips = new Map();
  for(const c of connections) {
    const prev = trips.get(c.tripId);
    if(prev && (prev.to !== c.from || prev.arrival > c.departure)) fail(`Trip ${c.tripId} must form one continuous, non-overlapping chain; use separate tripIds for separate vehicles or runs.`);
    trips.set(c.tripId,c);
  }
  const v = object(d.settings,'settings');
  const settings = {};
  for(const key of ['baselineStart','earliestStart','latestStart']) settings[key]=integer(v[key],`settings.${key}`);
  for(const key of ['openMinutes','visitMinutes','stepMinutes']) settings[key]=integer(v[key],`settings.${key}`,1);
  settings.transferMinutes=integer(v.transferMinutes,'settings.transferMinutes');
  settings.maxTransfers=integer(v.maxTransfers,'settings.maxTransfers',0,3);
  if(settings.earliestStart>settings.latestStart) fail('earliestStart must not exceed latestStart.');
  if(settings.baselineStart<settings.earliestStart || settings.baselineStart>settings.latestStart) fail('baselineStart must be within the start bounds.');
  if(settings.latestStart+settings.openMinutes>MAX_TIME) fail('Latest closing time must not exceed minute 2879.');
  if(settings.visitMinutes>settings.openMinutes) fail('visitMinutes must not exceed openMinutes.');
  if(Math.floor((settings.latestStart-settings.earliestStart)/settings.stepMinutes)+1>48) fail('At most 48 permitted start windows are supported.');
  return {version:1,title,serviceDay,dataKind:d.dataKind,stops,pantryStop,origins,connections,settings};
}
function prepare(s) {
  const previous = new Map(), last = new Map();
  for (const c of s.connections) { previous.set(c.id,last.get(c.tripId)); last.set(c.tripId,c); }
  const arrivals = [...s.connections].sort((a,b)=>a.arrival-b.arrival || cmp(a.id,b.id));
  return {s,previous,arrivals,outbound:new Map(),returns:new Map()};
}
/** Earliest scheduled arrival using event-order dynamic programming. */
function route(ctx, from, to, ready, deadline, firstDeparture = null) {
  const {s,previous,arrivals} = ctx, {maxTransfers,transferMinutes} = s.settings;
  const states = new Map(), eligible = new Map();
  let ai = 0, winner = null;
  for(const c of s.connections) {
    if(c.departure < ready) continue;
    if(c.departure > deadline) break;
    while(ai < arrivals.length && arrivals[ai].arrival+transferMinutes <= c.departure) {
      const p = arrivals[ai++], paths = states.get(p.id);
      if(!paths) continue;
      let at = eligible.get(p.to);
      if(!at) { at = []; eligible.set(p.to,at); }
      for(let k=0;k<=maxTransfers;k++) if(paths[k] && (!at[k] || pathCompare(paths[k],at[k])<0)) at[k]=paths[k];
    }
    if(c.arrival>deadline) continue;
    const paths = [];
    const choose = (k,path) => { if(!paths[k] || pathCompare(path,paths[k])<0) paths[k]=path; };
    if(c.from===from && (firstDeparture===null || c.departure===firstDeparture)) choose(0,[c]);
    const at=eligible.get(c.from);
    for(let k=1;k<=maxTransfers;k++) if(at?.[k-1]) choose(k,[...at[k-1],c]);
    const prev=previous.get(c.id), onBoard=prev && states.get(prev.id);
    for(let k=0;k<=maxTransfers;k++) if(onBoard?.[k]) choose(k,[...onBoard[k],c]);
    states.set(c.id,paths);
    if(c.to===to) for(const path of paths) if(path && (!winner || c.arrival<winner.arrival || (c.arrival===winner.arrival && pathCompare(path,winner.path)<0))) winner={arrival:c.arrival,path};
  }
  return winner;
}
function outwardOptions(ctx,o) {
  // Origin IDs label results; routing depends only on these constraints.
  // Keep caches local to one prepared scenario so timetable/settings changes
  // cannot reuse stale routes. JSON tuples preserve arbitrary ID boundaries.
  const key=JSON.stringify([o.stopId,o.leaveAfter,o.homeBy,o.maxAwayMinutes]);
  if(ctx.outbound.has(key)) return ctx.outbound.get(key);
  const times=[...new Set(ctx.s.connections.filter(c=>c.from===o.stopId && c.departure>=o.leaveAfter && c.departure<o.homeBy).map(c=>c.departure))];
  const options=[];
  for(const depart of times) {
    const out=route(ctx,o.stopId,ctx.s.pantryStop,depart,Math.min(o.homeBy,depart+o.maxAwayMinutes),depart);
    if(out) options.push({depart,...out});
  }
  ctx.outbound.set(key,options); return options;
}
function journeyCompare(a,b) {
  return a.awayMinutes-b.awayMinutes || a.arrive-b.arrive || pathCompare(a.outbound,b.outbound) || pathCompare(a.return,b.return);
}
function evaluate(ctx,start) {
  const s=ctx.s, end=start+s.settings.openMinutes;
  const results=s.origins.map(o=>{
    const result={originId:o.id,reachable:false,reason:'No complete scheduled round trip fits the pickup window, availability, transfer limit and maximum time away.',journey:null};
    let best=null;
    let outboundFound=false, pickupFits=false, returnFound=false;
    if(o.stopId===s.pantryStop) {
      const pickupStart=Math.max(start,o.leaveAfter), pickupEnd=pickupStart+s.settings.visitMinutes;
      if(pickupEnd<=end && pickupEnd<=o.homeBy && s.settings.visitMinutes<=o.maxAwayMinutes) best={outbound:[],pickupStart,pickupEnd,return:[],depart:pickupStart,arrive:pickupEnd,awayMinutes:s.settings.visitMinutes,waitMinutes:0};
    } else for(const out of outwardOptions(ctx,o)) {
      outboundFound=true;
      const pickupStart=Math.max(start,out.arrival), pickupEnd=pickupStart+s.settings.visitMinutes;
      if(pickupEnd>end || pickupEnd>o.homeBy || pickupEnd>out.depart+o.maxAwayMinutes) continue;
      pickupFits=true;
      // The return search does not use the origin label, departure availability
      // or away allowance. The full round-trip away check remains below.
      const key=JSON.stringify([o.stopId,pickupEnd,o.homeBy]);
      if(!ctx.returns.has(key)) ctx.returns.set(key,route(ctx,s.pantryStop,o.stopId,pickupEnd,o.homeBy));
      const back=ctx.returns.get(key);
      if(!back) continue;
      returnFound=true;
      if(back.arrival>out.depart+o.maxAwayMinutes) continue;
      const awayMinutes=back.arrival-out.depart;
      const riding=[...out.path,...back.path].reduce((n,c)=>n+c.arrival-c.departure,0);
      // Sharing a route search must not introduce shared mutable path arrays
      // between distinct origin results. Connection objects remain the same
      // normalized timetable objects, as in the original implementation.
      const j={outbound:[...out.path],pickupStart,pickupEnd,return:[...back.path],depart:out.depart,arrive:back.arrival,awayMinutes,waitMinutes:awayMinutes-riding-s.settings.visitMinutes};
      if(!best || journeyCompare(j,best)<0) best=j;
    }
    // Diagnose only after every retained outward option has been considered.
    // Earlier pickup cannot remove a feasible return, so these stage failures
    // are conservative under the same timetable assumptions as reachability.
    if(!best) {
      if(o.stopId===s.pantryStop) result.reason='The pickup cannot fit the opening window, availability and maximum time away.';
      else if(!outboundFound) result.reason='No outbound journey reaches the pantry within the supplied availability, maximum time away and transfer limit.';
      else if(!pickupFits) result.reason='Outbound travel exists, but no pickup fits both the opening window and the supplied time limits.';
      else if(!returnFound) result.reason='Pickup fits, but no scheduled return reaches the origin by its home deadline within the transfer limit.';
      else result.reason='Scheduled returns exist, but none completes a round trip within the maximum time away.';
    }
    if(best) { result.reachable=true; result.reason='Complete scheduled round trip fits all supplied constraints.'; result.journey=best; }
    return result;
  });
  return {start,end,reachable:results.filter(r=>r.reachable).length,total:results.length,results};
}
export function evaluateWindow(scenario,start) {
  const s=validateScenario(scenario);
  integer(start,'Window start',s.settings.earliestStart,s.settings.latestStart);
  return evaluate(prepare(s),start);
}
export function optimizeWindows(scenario) {
  const s=validateScenario(scenario),ctx=prepare(s), windows=[];
  for(let start=s.settings.earliestStart;start<=s.settings.latestStart;start+=s.settings.stepMinutes) windows.push(evaluate(ctx,start));
  const baseline=windows.find(w=>w.start===s.settings.baselineStart) ?? evaluate(ctx,s.settings.baselineStart);
  const best=[...windows].sort((a,b)=>b.reachable-a.reachable || Math.abs(a.start-baseline.start)-Math.abs(b.start-baseline.start) || a.start-b.start)[0];
  const old=new Set(baseline.results.filter(r=>r.reachable).map(r=>r.originId)), now=new Set(best.results.filter(r=>r.reachable).map(r=>r.originId));
  return {baseline,best,windows,gained:[...now].filter(id=>!old.has(id)),lost:[...old].filter(id=>!now.has(id))};
}
export function formatTime(minute) {
  integer(minute,'Time');
  const time=`${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  return time+(minute>=1440?' +1d':'');
}
