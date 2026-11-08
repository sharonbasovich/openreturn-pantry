/** Node-only, bounded GTFS scheduled-service projection. Not a GTFS validator. */
import {createHash} from 'node:crypto';
import {validateScenario} from './model.mjs';
import {exportScenarioJson} from './import.mjs';

export const GTFS_LIMITS = Object.freeze({fileBytes:8_000_000,totalBytes:32_000_000,rows:100_000,cellCharacters:4096,templateBytes:1_000_000});
const fields = {
  'agency.txt': ['agency_id agency_name agency_url agency_timezone agency_lang agency_phone agency_fare_url agency_email','agency_name agency_url agency_timezone'],
  'stops.txt': ['stop_id stop_code stop_name tts_stop_name stop_desc stop_lat stop_lon zone_id stop_url location_type parent_station stop_timezone wheelchair_boarding level_id platform_code stop_access','stop_id stop_name'],
  'routes.txt': ['route_id agency_id route_short_name route_long_name route_desc route_type route_url route_color route_text_color route_sort_order continuous_pickup continuous_drop_off network_id','route_id route_type'],
  'trips.txt': ['route_id service_id trip_id trip_headsign trip_short_name direction_id block_id shape_id wheelchair_accessible bikes_allowed cars_allowed safe_duration_factor safe_duration_offset','route_id service_id trip_id'],
  'stop_times.txt': ['trip_id arrival_time departure_time stop_id location_group_id location_id stop_sequence stop_headsign start_pickup_drop_off_window end_pickup_drop_off_window pickup_type drop_off_type continuous_pickup continuous_drop_off shape_dist_traveled timepoint pickup_booking_rule_id drop_off_booking_rule_id','trip_id arrival_time departure_time stop_id stop_sequence'],
  'calendar.txt': ['service_id monday tuesday wednesday thursday friday saturday sunday start_date end_date','service_id monday tuesday wednesday thursday friday saturday sunday start_date end_date'],
  'calendar_dates.txt': ['service_id date exception_type','service_id date exception_type'],
  'frequencies.txt': ['trip_id start_time end_time headway_secs exact_times','trip_id start_time end_time headway_secs'],
  'transfers.txt': ['from_stop_id to_stop_id from_route_id to_route_id from_trip_id to_trip_id transfer_type min_transfer_time','transfer_type']
};
const metadata = ['shapes.txt','feed_info.txt','attributions.txt'];
export const GTFS_FILE_NAMES = Object.freeze([...Object.keys(fields),...metadata]);
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const fail = message => {throw new Error(message);};
const bytes = s => Buffer.byteLength(s,'utf8');
const hash = s => createHash('sha256').update(s,'utf8').digest('hex');
const own = (o,k) => Object.hasOwn(o,k);
const record = (o,label) => {if(!o || typeof o!=='object' || Array.isArray(o)) fail(`${label} must be an object.`);};
function exactKeys(o,allowed,label) {
  record(o,label);
  for(const key of Object.keys(o)) if(!allowed.includes(key)) fail(`${label}: unsupported field ${key}.`);
}
function textValue(s,label,max=80) {
  if(typeof s!=='string'||!s||s.length>max||s.trim()!==s||/[\u0000-\u001f\u007f-\u009f]/u.test(s)||[...s].some(c=>{const x=c.codePointAt(0);return x>=0xd800&&x<=0xdfff;}))
    fail(`${label} needs exact nonempty text, at most ${max} characters, without edge whitespace, controls or unpaired surrogates.`);
  return s;
}
function date(s,label,compact=false) {
  if(typeof s!=='string'||!(compact?/^\d{8}$/:/^\d{4}-\d{2}-\d{2}$/).test(s)) fail(`${label}: invalid date.`);
  const iso=compact?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:s;
  const d=new Date(`${iso}T00:00:00Z`);
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso) fail(`${label}: invalid date.`);
  return iso;
}
function enumValue(s,allowed,label) {if(!allowed.includes(s??'')) fail(`${label}: unsupported value ${JSON.stringify(s)}.`);}
function sequence(s,label) {
  if(!/^\d+$/.test(s)||!Number.isSafeInteger(Number(s))) fail(`${label} must be a safe nonnegative integer.`);
  return Number(s);
}
function minute(s,label) {
  if(typeof s!=='string'||!/^(?:[0-3]?\d|4[0-7]):[0-5]\d:00$/.test(s)) fail(`${label} requires an exact minute from 0:00:00 through 47:59:00; no interpolation or rounding.`);
  const [h,m]=s.split(':').map(Number);return h*60+m;
}
function zone(s,label) {
  textValue(s,label,100);
  try {new Intl.DateTimeFormat('en',{timeZone:s}).format(0);} catch {fail(`${label} must be a recognized timezone.`);}
  return s;
}
// Deliberately separate from the browser's narrower connection-CSV contract.
function csv(text,name) {
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const emit=()=>{
    if(/[\u0000-\u001f\u007f-\u009f]/u.test(cell)) fail(`${name}: CSV fields must not contain control characters, even when quoted.`);
    row.push(cell);cell='';closed=false;
    if(row.length>64) fail(`${name}: too many columns.`);
  };
  const finish=()=>{
    if(row.length!==1||row[0]!=='') rows.push(row);
    row=[];
    if(rows.length>GTFS_LIMITS.rows+1) fail(`${name}: row limit exceeded.`);
  };
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<=text.length;i++) {
    const c=text[i];
    if(quoted) {
      if(c===undefined) fail(`${name}: unclosed CSV quote.`);
      if(c==='"') {if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}} else cell+=c;
    } else if(c==='"') {
      if(cell!==''||closed) fail(`${name}: unexpected CSV quote.`);quoted=true;
    } else if(c===','||c==='\r'||c==='\n'||c===undefined) {
      emit();if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;finish();}
    } else {if(closed) fail(`${name}: text after quoted field.`);cell+=c;}
    if(cell.length>GTFS_LIMITS.cellCharacters) fail(`${name}: cell limit exceeded.`);
  }
  if(!rows.length) fail(`${name}: a header is required.`);
  const [allowed,required]=fields[name].map(s=>s.split(' ')),headers=rows.shift();
  if(new Set(headers).size!==headers.length) fail(`${name}: duplicate CSV header.`);
  for(const key of headers) if(!allowed.includes(key)) fail(`${name}: unsupported column ${key}.`);
  for(const key of required) if(!headers.includes(key)) fail(`${name}: missing column ${key}.`);
  return rows.map((values,i)=>{
    if(values.length!==headers.length) fail(`${name}: row ${i+2} has the wrong number of fields.`);
    const result=Object.create(null);headers.forEach((key,j)=>{result[key]=values[j];});return result;
  });
}
function index(rows,key,label,optionalSingle=false) {
  const map=new Map();
  for(const row of rows) {
    const id=optionalSingle&&rows.length===1&&!row[key]?'':textValue(row[key],`${label}.${key}`);
    if(map.has(id)) fail(`${label}: duplicate ${key} ${JSON.stringify(id)}.`);
    map.set(id,row);
  }
  return map;
}
const sorted = values => [...values].sort(cmp);
const absent = (row,keys,label) => {for(const key of keys) if(row[key]) fail(`${label}: ${key} is unsupported; no partial import was produced.`);};
const limitations = [
  'Restricted scheduled-service projection, not GTFS compliance or a complete-feed validator. Input provenance and completeness are user assertions, not independently verified.',
  'Only the explicitly selected service date and route/trip scope are represented. Other routes, trips and adjacent service dates may change the answer. Every selected trip retains its complete supplied stop chain.',
  'All template and scenario times are GTFS service-day minutes in the agency timezone (noon minus 12 hours), not necessarily local wall-clock minutes on DST transition days. No timezone or daylight-saving conversion is performed; the browser only displays numeric service-day labels.',
  'No walking, station access, fares, wheelchair access, capacity, eligibility, real-time disruption, queues, reliability, safe-travel or real-world feasibility claims. Origin and pantry access at the exact stop are user assumptions.',
  'Transfers are possible only at identical stop IDs using the template buffer. No station/platform merging or cross-stop transfer inference. All supplied transfer rules are rejected, even outside scope.',
  'Only regular scheduled pickup/drop-off, exact whole-minute times and positive-duration adjacent legs are supported. Selected frequency service, blocks, flexible service and unsupported files/fields are rejected.',
  'The receipt is a separate provenance companion; scenario import into the unchanged browser does not preserve it. Keep both files. Hashes identify bytes, not authenticity, licensing or freshness.'
];

/** files: {basename: UTF-8 text}; exactly one explicit routeIds/tripIds list. */
export function adaptGtfsSubset(options) {
  exactKeys(options,['files','serviceDay','routeIds','tripIds','template','blockPolicy'],'Options');
  const {files,template}=options;
  const blockPolicy=own(options,'blockPolicy')?options.blockPolicy:'reject-blocks';
  if(!['reject-blocks','separate-trips'].includes(blockPolicy)) fail('Unsupported blockPolicy.');
  const separate=blockPolicy==='separate-trips';
  record(files,'files');
  date(options.serviceDay,'serviceDay');
  const modes=['routeIds','tripIds'].filter(key=>own(options,key));
  if(modes.length!==1) fail('Supply exactly one nonempty routeIds or tripIds scope.');
  const mode=modes[0],requested=options[mode];
  if(!Array.isArray(requested)||requested.length<1||requested.length>1200) fail(`${mode} must contain 1 to 1200 IDs.`);
  requested.forEach(id=>textValue(id,mode));
  if(new Set(requested).size!==requested.length) fail(`${mode}: duplicate scope ID.`);
  const scope=sorted(requested);
  exactKeys(template,['title','timeZone','timeBasis','pantryStop','origins','settings'],'Template');
  if(template.timeBasis!=='gtfs-service-day-minutes') fail('Template.timeBasis must explicitly be gtfs-service-day-minutes.');
  zone(template.timeZone,'Template.timeZone');
  if(bytes(JSON.stringify(template))>GTFS_LIMITS.templateBytes) fail('Template exceeds the byte limit.');
  if(!Array.isArray(template.origins)) fail('Template.origins must be an array.');
  for(const origin of template.origins) exactKeys(origin,['id','stopId','label','leaveAfter','homeBy','maxAwayMinutes'],'Template origin');
  exactKeys(template.settings,['baselineStart','openMinutes','visitMinutes','earliestStart','latestStart','stepMinutes','transferMinutes','maxTransfers'],'Template.settings');
  const names=sorted(Object.keys(files));
  let total=0;const tables=Object.create(null),inputs=[];
  for(const name of names) {
    if(!GTFS_FILE_NAMES.includes(name)) fail(`Unsupported feed file ${JSON.stringify(name)}. Do not strip restrictions to force acceptance.`);
    const content=files[name];
    if(typeof content!=='string') fail(`${name}: valid UTF-8 text is required.`);
    const size=bytes(content);total+=size;
    if(size>GTFS_LIMITS.fileBytes||total>GTFS_LIMITS.totalBytes) fail('Feed byte limit exceeded.');
    if(!content.isWellFormed()) fail(`${name}: valid UTF-8 text is required.`);
    const parsed=own(fields,name)?csv(content,name):null;
    if(parsed) tables[name]=parsed;
    inputs.push({file:name,bytes:size,sha256:hash(content),rows:parsed?.length??null,role:parsed?'checked table':'unmodeled metadata'});
  }
  for(const name of ['agency.txt','stops.txt','routes.txt','trips.txt','stop_times.txt']) if(!tables[name]?.length) fail(`${name} must contain records.`);
  if(!own(tables,'calendar.txt')&&!own(tables,'calendar_dates.txt')) fail('calendar.txt or calendar_dates.txt is required.');
  if(tables['transfers.txt']?.length) fail('transfers.txt rules (including linked trips) are unsupported, even outside the selected scope.');
  const agencies=index(tables['agency.txt'],'agency_id','agency.txt',true);
  for(const agency of agencies.values()) {
    zone(agency.agency_timezone,'agency_timezone');
    textValue(agency.agency_name,'agency_name',160);
    textValue(agency.agency_url,'agency_url',4096);
  }
  const routes=index(tables['routes.txt'],'route_id','routes.txt');
  const trips=index(tables['trips.txt'],'trip_id','trips.txt');
  const stops=index(tables['stops.txt'],'stop_id','stops.txt');
  const calendar=index(tables['calendar.txt']??[],'service_id','calendar.txt');
  const services=new Set(calendar.keys()),active=new Set(),serviceEvidence=new Map();
  const dayKey=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(`${options.serviceDay}T00:00:00Z`).getUTCDay()];
  const compactDay=options.serviceDay.replaceAll('-','');
  for(const [id,row] of calendar) {
    date(row.start_date,'calendar.start_date',true);date(row.end_date,'calendar.end_date',true);
    if(row.start_date>row.end_date) fail('calendar start_date exceeds end_date.');
    for(const key of ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) enumValue(row[key],['0','1'],`calendar.${key}`);
    const enabled=row.start_date<=compactDay&&compactDay<=row.end_date&&row[dayKey]==='1';
    if(enabled) active.add(id);
    serviceEvidence.set(id,{serviceId:id,calendarActive:enabled,exception:null,active:enabled});
  }
  const exceptions=new Set();
  for(const row of tables['calendar_dates.txt']??[]) {
    textValue(row.service_id,'calendar_dates.service_id');date(row.date,'calendar_dates.date',true);
    enumValue(row.exception_type,['1','2'],'calendar_dates.exception_type');
    const key=JSON.stringify([row.service_id,row.date]);
    if(exceptions.has(key)) fail('calendar_dates has a duplicate service/date pair.');exceptions.add(key);services.add(row.service_id);
    if(row.date!==compactDay) continue;
    if(row.exception_type==='1') active.add(row.service_id);else active.delete(row.service_id);
    serviceEvidence.set(row.service_id,{serviceId:row.service_id,calendarActive:serviceEvidence.get(row.service_id)?.calendarActive??false,exception:row.exception_type==='1'?'added':'removed',active:row.exception_type==='1'});
  }
  for(const trip of trips.values()) {
    if(separate&&trip.block_id) textValue(trip.block_id,'trips.block_id');
    textValue(trip.route_id,'trips.route_id');textValue(trip.service_id,'trips.service_id');
    if(!routes.has(trip.route_id)) fail(`Trip references unknown route ${JSON.stringify(trip.route_id)}.`);
    if(!services.has(trip.service_id)) fail(`Trip references unknown service ${JSON.stringify(trip.service_id)}.`);
  }
  const scopeIndex=mode==='routeIds'?routes:trips;
  for(const id of scope) if(!scopeIndex.has(id)) fail(`Unknown ${mode} scope ID ${JSON.stringify(id)}.`);
  const scoped=[...trips.values()].filter(t=>scope.includes(mode==='routeIds'?t.route_id:t.trip_id));
  const selected=scoped.filter(t=>active.has(t.service_id)).sort((a,b)=>cmp(a.trip_id,b.trip_id));
  const inactive=sorted(scoped.filter(t=>!active.has(t.service_id)).map(t=>t.trip_id));
  if(mode==='tripIds'&&inactive.length) fail(`Explicitly selected trip is inactive on serviceDay: ${JSON.stringify(inactive[0])}.`);
  if(!selected.length) fail('The selected scope has no active trips on serviceDay.');
  if(mode==='routeIds') for(const id of scope) if(!selected.some(t=>t.route_id===id)) fail(`Requested route ${JSON.stringify(id)} has no active trips on serviceDay.`);
  const selectedIds=new Set(selected.map(t=>t.trip_id));
  // Membership is exhaustive only relative to trips supplied in this archive.
  // Block identity never changes scenario trip identity or creates a connection.
  const touchedBlocks=separate?sorted(new Set(selected.map(t=>t.block_id).filter(Boolean))):[];
  const blockMembers=new Map(touchedBlocks.map(id=>[id,[]]));
  if(separate) for(const trip of trips.values()) if(blockMembers.has(trip.block_id))
    blockMembers.get(trip.block_id).push({tripId:trip.trip_id,routeId:trip.route_id,serviceId:trip.service_id,active:active.has(trip.service_id),selected:selectedIds.has(trip.trip_id),inScope:scope.includes(mode==='routeIds'?trip.route_id:trip.trip_id),omissionReason:selectedIds.has(trip.trip_id)?null:!active.has(trip.service_id)?'inactive-on-service-day':'outside-selected-scope'});
  const membershipServices=separate?[...blockMembers.values()].flat().map(t=>t.serviceId):[];
  for(const row of tables['frequencies.txt']??[]) {
    textValue(row.trip_id,'frequencies.trip_id');
    if(!trips.has(row.trip_id)) fail('frequencies references an unknown trip.');
    if(selectedIds.has(row.trip_id)) fail(`Selected trip ${JSON.stringify(row.trip_id)} has unsupported frequency service (including exact_times=1).`);
  }
  const routeEvidence=[];const selectedRoutes=sorted(new Set(selected.map(t=>t.route_id)));
  for(const id of selectedRoutes) {
    const route=routes.get(id),agencyId=route.agency_id|| (agencies.size===1?[...agencies.keys()][0]:undefined),agency=agencies.get(agencyId);
    if(!agency) fail(`Route ${JSON.stringify(id)} has no unambiguous known agency.`);
    if(agency.agency_timezone!==template.timeZone) fail('Selected route agency_timezone must exactly match Template.timeZone; mixed timezones are unsupported.');
    enumValue(route.route_type,['0','1','2','3','4','5','6','7','11','12'],'route_type');
    if(!route.route_short_name&&!route.route_long_name) fail('Selected route needs a short or long name.');
    for(const key of ['continuous_pickup','continuous_drop_off']) enumValue(route[key],['','0','1','2','3'],`routes.${key}`);
    routeEvidence.push({routeId:id,agencyId:agencyId||null,agencyTimezone:agency.agency_timezone});
  }
  const times=new Map(selected.map(t=>[t.trip_id,[]])),sequenceKeys=new Set();
  for(const row of tables['stop_times.txt']) {
    if(!trips.has(row.trip_id)) fail('stop_times references an unknown trip.');
    const n=sequence(row.stop_sequence,'stop_sequence');
    const key=JSON.stringify([row.trip_id,n]);
    if(sequenceKeys.has(key)) fail('Duplicate stop_sequence within a trip.');sequenceKeys.add(key);
    if(selectedIds.has(row.trip_id)) times.get(row.trip_id).push({...row,sequence:n});
  }
  const connections=[],connectionMap=[],calls=[],usedStops=new Set();
  for(const trip of selected) {
    absent(trip,separate?['safe_duration_factor','safe_duration_offset']:['block_id','safe_duration_factor','safe_duration_offset'],`Trip ${JSON.stringify(trip.trip_id)}`);
    const route=routes.get(trip.route_id),rows=times.get(trip.trip_id).sort((a,b)=>a.sequence-b.sequence);
    if(rows.length<2) fail('Each selected trip needs at least two supplied stop-time records.');
    // Do not infer missing timepoint flags in a partially populated selected trip.
    if(rows.some(r=>r.timepoint)&&rows.some(r=>!r.timepoint)) fail('Selected trip mixes blank and explicit timepoint flags. Use an unambiguous source.');
    for(const row of rows) {
      absent(row,['location_id','location_group_id','start_pickup_drop_off_window','end_pickup_drop_off_window','pickup_booking_rule_id','drop_off_booking_rule_id'],'Selected stop_time');
      for(const key of ['pickup_type','drop_off_type']) enumValue(row[key],['','0'],`Selected stop_times.${key}`);
      for(const key of ['continuous_pickup','continuous_drop_off']) {
        enumValue(row[key],['','0','1','2','3'],`Selected stop_times.${key}`);
        const effective=row[key]||route[key]||'1';
        if(effective!=='1') fail(`Selected stop_time has unsupported effective ${key}=${effective}.`);
      }
      enumValue(row.timepoint,['','1'],'Selected stop_times.timepoint');
      textValue(row.stop_id,'Selected stop_id');
      if(!stops.has(row.stop_id)) fail(`Selected stop_time references unknown stop ${JSON.stringify(row.stop_id)}.`);
      row.arrival=minute(row.arrival_time,'arrival_time');row.departure=minute(row.departure_time,'departure_time');
      if(row.departure<row.arrival) fail('Departure precedes arrival at a selected stop; dwell cannot be negative.');
      usedStops.add(row.stop_id);
      calls.push({tripId:trip.trip_id,stopSequence:row.sequence,stopId:row.stop_id,arrival:row.arrival,departure:row.departure});
    }
    for(let i=1;i<rows.length;i++) {
      const a=rows[i-1],b=rows[i];
      if(a.stop_id===b.stop_id) fail('Consecutive identical stops cannot be represented; intermediate stops are never removed.');
      if(b.arrival<=a.departure) fail('Each adjacent selected leg must have positive travel time; no zero-duration or backward legs.');
      const id=`gtfs-leg-${connections.length+1}`;
      connections.push({id,tripId:trip.trip_id,from:a.stop_id,to:b.stop_id,departure:a.departure,arrival:b.arrival});
      connectionMap.push({connectionId:id,tripId:trip.trip_id,fromStopSequence:a.sequence,toStopSequence:b.sequence});
    }
  }
  textValue(template.pantryStop,'Template.pantryStop');usedStops.add(template.pantryStop);
  for(const origin of template.origins) {textValue(origin.stopId,'Template origin stopId');usedStops.add(origin.stopId);}
  const stopEvidence=[];
  const scenarioStops=sorted(usedStops).map(id=>{
    const row=stops.get(id);if(!row) fail(`Template or selected trip references unknown exact stop ${JSON.stringify(id)}.`);
    enumValue(row.location_type,['','0'],'Selected location_type');
    textValue(row.stop_name,'Selected stop_name',160);
    // Parent IDs remain distinct. Only use ancestry to verify timezone metadata.
    let inherited=row.stop_timezone||template.timeZone;
    if(row.parent_station) {
      const parent=stops.get(row.parent_station);
      if(!parent||parent.location_type!=='1'||parent.parent_station) fail('Selected stop has invalid parent station.');
      inherited=parent.stop_timezone||template.timeZone;
    }
    zone(inherited,'Selected stop timezone');
    stopEvidence.push({stopId:id,parentStation:row.parent_station||null,localTimezone:inherited});
    return {id,name:row.stop_name};
  });
  const scenario=validateScenario({version:1,title:template.title,serviceDay:options.serviceDay,dataKind:'user-supplied',stops:scenarioStops,pantryStop:template.pantryStop,origins:template.origins,connections,settings:template.settings});
  // Match the browser's complete backup/import size contract as well as the model.
  const scenarioText=exportScenarioJson(scenario)+'\n';
  const receipt={
    format:'openreturn-gtfs-subset-receipt',version:separate?2:1,adapterVersion:separate?'1.1.0':'1.0.0',
    reference:'https://gtfs.org/documentation/schedule/reference/',referenceReviewed:'2026-11-08',
    serviceDay:options.serviceDay,timeZone:template.timeZone,timeBasis:template.timeBasis,
    selection:{kind:mode,ids:scope,selectedTripIds:selected.map(t=>t.trip_id),inactiveScopedTripIds:inactive,outOfScopeTripCount:trips.size-scoped.length},
    services:sorted(new Set([...scoped.map(t=>t.service_id),...membershipServices])).map(id=>serviceEvidence.get(id)??{serviceId:id,calendarActive:false,exception:null,active:false}),
    routes:routeEvidence,stops:stopEvidence,inputs,
    templateHash:{encoding:'JSON.stringify of supplied template object, UTF-8',sha256:hash(JSON.stringify(template))},
    output:{file:'scenario.json',encoding:'exportScenarioJson plus LF, UTF-8',bytes:bytes(scenarioText),sha256:hash(scenarioText),stops:scenario.stops.length,trips:selected.length,connections:scenario.connections.length,origins:scenario.origins.length},
    connectionMap,stopCalls:calls,limitations:[...limitations]
  };
  if(separate) {
    receipt.blockProjection={
      policy:blockPolicy,
      selectedTripBlocks:selected.map(t=>({tripId:t.trip_id,blockId:t.block_id||null})),
      touchedBlocks:touchedBlocks.map(blockId=>({blockId,members:blockMembers.get(blockId).sort((a,b)=>cmp(a.tripId,b.tripId))}))
    };
    receipt.limitations[5]='Only regular scheduled pickup/drop-off, exact whole-minute times and positive-duration adjacent legs are supported. Selected frequency service, flexible service and unsupported files/fields are rejected.';
    receipt.limitations.push('Explicit separate-trips is a lossy scheduled-service projection, not onboard or block support. Original trip IDs remain separate: every trip change requires the same-stop template transfer buffer and transfer count, including changes within a block. No inter-trip in-seat permission or block continuation is inferred; adjacent legs within an original trip retain normal onboard continuation.');
    receipt.limitations.push('Touched block memberships and service activation cover all supplied trips, including inactive and out-of-scope members, but do not prove archive completeness. Unselected trips are not projected or certified valid; omitted inter-trip onboard links may change coverage and rankings. Block chronology and vehicle allocation are not validated. Membership does not prove vehicle availability, physical feasibility or real-world usability.');
  }
  return {scenario,receipt};
}
