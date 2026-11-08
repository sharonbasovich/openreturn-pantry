import {validateScenario} from './model.mjs';
const MAX_JSON_BYTES = 500000;
export function parseScenarioJson(text) {
  if(typeof text !== 'string' || text.length===0) throw new Error('Paste a scenario before importing.');
  if(new TextEncoder().encode(text).length>MAX_JSON_BYTES) throw new Error('Scenario is too large. The limit is 500 KB.');
  let data;
  try { data=JSON.parse(text); } catch { throw new Error('This is not valid JSON. Fix the text and try again.'); }
  return validateScenario(data);
}
export function exportScenarioJson(scenario) { return JSON.stringify(validateScenario(scenario),null,2); }
export function parseTime(value) {
  if(typeof value !== 'string' || !/^(?:[0-3]?\d|4[0-7]):[0-5]\d$/.test(value)) throw new Error('Use HH:MM, from 00:00 to 47:59, for each timetable time.');
  const [h,m]=value.split(':').map(Number); return h*60+m;
}
function readCsv(text) {
  if(typeof text!=='string'||text.length>250000) throw new Error('Timetable CSV must be text under 250 KB.');
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
  const rows=readCsv(text.replace(/^\uFEFF/,''));
  if(rows.length<2||JSON.stringify(rows[0])!==JSON.stringify(headers)) throw new Error('Use these exact CSV columns: '+headers.join(','));
  if(rows.length>1201) throw new Error('A timetable may contain at most 1,200 connections.');
  const ids=new Set();
  return rows.slice(1).map((r,i)=>{
    if(r.length!==6)throw new Error(`CSV row ${i+2} needs exactly six fields.`);
    const [id,tripId,from,to,departure,arrival]=r;
    if([id,tripId,from,to].some(s=>!s||s!==s.trim()||s.length>100||/[\r\n\t]/.test(s)))throw new Error(`CSV row ${i+2} has an empty, oversized or whitespace-padded ID.`);
    if(ids.has(id))throw new Error(`Duplicate connection ID: ${id}`);ids.add(id);
    const d=parseTime(departure), a=parseTime(arrival);
    if(a<=d)throw new Error(`CSV row ${i+2} must arrive after it departs. Use 24:xx for next-day times.`);
    return {id,tripId,from,to,departure:d,arrival:a};
  });
}
const csvCell = v => /[",\r\n]/.test(String(v))?'"'+String(v).replaceAll('"','""')+'"':String(v);
const time = v => String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0');
export function connectionsToCsv(connections) {
  return [headers.join(','),...connections.map(c=>[c.id,c.tripId,c.from,c.to,time(c.departure),time(c.arrival)].map(csvCell).join(','))].join('\r\n')+'\r\n';
}
