import {validateScenario} from './model.mjs';
// Conservative UTF-8 bounds exceed every normalized v1 scenario at the
// model's maximum field lengths/counts. JSON is the complete, exact backup.
export const MAX_JSON_BYTES = 4000000;
export const MAX_CSV_BYTES = 2000000;
const bytes = text => new TextEncoder().encode(text).length;
const sizeLimit = (text, limit, kind) => {
  if (bytes(text) > limit) throw new Error(`${kind} is too large. The limit is ${limit.toLocaleString('en-US')} UTF-8 bytes.`);
  return text;
};
const loneSurrogate = text => [...text].some(char => { const cp=char.codePointAt(0);return cp>=0xD800&&cp<=0xDFFF; });
function csvIds(ids, label) {
  if(ids.some(s=>typeof s!=='string'||!s||s!==s.trim()||s.length>80||/[\u0000-\u001f\u007f-\u009f]/.test(s)||loneSurrogate(s)))
    throw new Error(`${label} needs nonempty IDs of at most 80 characters, without edge whitespace, control characters or unpaired surrogates. Use scenario JSON to preserve other IDs exactly.`);
  // Quoting alone does not stop spreadsheet formula interpretation. Refuse
  // this optional export instead of prefixing a character and changing IDs.
  if(ids.some(s=>/^[=+@-]/.test(s)))
    throw new Error(`${label} has a formula-leading ID. CSV cannot be used because spreadsheet software may interpret it as a formula. Use scenario JSON to preserve exact IDs.`);
}
export function parseScenarioJson(text) {
  if(typeof text !== 'string' || text.length===0) throw new Error('Paste a scenario before importing.');
  sizeLimit(text,MAX_JSON_BYTES,'Scenario JSON');
  let data;
  try { data=JSON.parse(text); } catch { throw new Error('This is not valid JSON. Fix the text and try again.'); }
  return validateScenario(data);
}
export function exportScenarioJson(scenario) { return sizeLimit(JSON.stringify(validateScenario(scenario),null,2),MAX_JSON_BYTES,'Scenario JSON'); }
export function parseTime(value) {
  if(typeof value !== 'string' || !/^(?:[0-3]?\d|4[0-7]):[0-5]\d$/.test(value)) throw new Error('Use HH:MM, from 00:00 to 47:59, for each timetable time.');
  const [h,m]=value.split(':').map(Number); return h*60+m;
}
function readCsv(text) {
  if(typeof text!=='string') throw new Error('Timetable CSV must be text.');
  sizeLimit(text,MAX_CSV_BYTES,'Timetable CSV');
  const rows=[]; let row=[], cell='', inQuote=false, afterQuote=false;
  for(let i=0;i<=text.length;i++) {
    const c=text[i];
    if(inQuote) { if(c===undefined) throw new Error('Unclosed quote in timetable CSV.'); if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{inQuote=false;afterQuote=true;}}else{cell+=c;} continue; }
    if(c==='"') { if(cell!==''||afterQuote) throw new Error('Unexpected quote in timetable CSV.'); inQuote=true;continue; }
    if(c===','||c==='\n'||c==='\r'||c===undefined){row.push(cell);cell='';afterQuote=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x!==''))rows.push(row);row=[];}continue;}
    if(afterQuote) throw new Error('Unexpected text after a CSV quoted field.');
    cell+=c;
  }
  return rows;
}
const headers=['id','trip_id','from_stop_id','to_stop_id','departure','arrival'];
export function parseTimetableCsv(text) {
  if(typeof text!=='string') throw new Error('Timetable CSV must be text.');
  sizeLimit(text,MAX_CSV_BYTES,'Timetable CSV');
  const rows=readCsv(text.replace(/^\uFEFF/,''));
  if(rows.length<2||JSON.stringify(rows[0])!==JSON.stringify(headers)) throw new Error('Use these exact CSV columns: '+headers.join(','));
  if(rows.length>1201) throw new Error('A timetable may contain at most 1,200 connections.');
  const ids=new Set();
  return rows.slice(1).map((r,i)=>{
    if(r.length!==6)throw new Error(`CSV row ${i+2} needs exactly six fields.`);
    const [id,tripId,from,to,departure,arrival]=r;
    csvIds([id,tripId,from,to],`CSV row ${i+2}`);
    if(ids.has(id))throw new Error(`Duplicate connection ID: ${id}`);ids.add(id);
    const d=parseTime(departure), a=parseTime(arrival);
    if(a<=d)throw new Error(`CSV row ${i+2} must arrive after it departs. Use 24:xx for next-day times.`);
    return {id,tripId,from,to,departure:d,arrival:a};
  });
}
const csvCell = v => /[",\r\n]/.test(String(v))?'"'+String(v).replaceAll('"','""')+'"':String(v);
const time = v => String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0');
export function connectionsToCsv(connections) {
  if(!Array.isArray(connections)||connections.length<1||connections.length>1200)throw new Error('A timetable must contain 1 to 1,200 connections.');
  for(const [i,c] of connections.entries()) {
    if(!c||typeof c!=='object')throw new Error(`Connection ${i+1} must be a record.`);
    csvIds([c.id,c.tripId,c.from,c.to],`Connection ${i+1}`);
    if(!Number.isInteger(c.departure)||!Number.isInteger(c.arrival)||c.departure<0||c.arrival>2879||c.arrival<=c.departure)
      throw new Error(`Connection ${i+1} needs valid increasing service-day minutes.`);
  }
  const text=[headers.join(','),...connections.map(c=>[c.id,c.tripId,c.from,c.to,time(c.departure),time(c.arrival)].map(csvCell).join(','))].join('\r\n')+'\r\n';
  sizeLimit(text,MAX_CSV_BYTES,'Timetable CSV');
  // Enforce the helper's own import contract before exposing download bytes.
  parseTimetableCsv(text);
  return text;
}
