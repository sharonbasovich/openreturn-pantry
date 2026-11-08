import { SAMPLE } from './sample.mjs';
import { validateScenario, optimizeWindows, formatTime } from './model.mjs';
import { parseScenarioJson, exportScenarioJson, parseTimetableCsv, connectionsToCsv } from './import.mjs';

const $ = id => document.getElementById(id);
const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
const clone = value => JSON.parse(JSON.stringify(value));
const fields = [
  ['baselineStart','Current start','time'], ['openMinutes','Staffed minutes','number'],
  ['earliestStart','Earliest start','time'], ['latestStart','Latest start','time'],
  ['visitMinutes','Visit minutes','number'], ['stepMinutes','Search step (min)','number'],
  ['transferMinutes','Transfer buffer (min)','number'], ['maxTransfers','Max transfers / leg','number']
];
let scenario, comparison, selectedStart, selectedOrigin, settingsDirty = false, dataDirty = false, workingChanged = false, inputKind = 'json';
const range = w => `${formatTime(w.start)}–${formatTime(w.end)}`;
const status = (id, message, error = false) => { $(id).textContent = message; $(id).classList.toggle('error', error); };
function timeInput(value) { return `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`; }
function readField(key, type) {
  const input = $(`field-${key}`); const value = input.value.trim();
  if (type === 'time') {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
    if (!match || Number(match[1]) > 47) throw new Error(`${fields.find(f=>f[0]===key)[1]} must be a time from 00:00 to 47:59.`);
    return Number(match[1])*60+Number(match[2]);
  }
  if (!/^\d+$/.test(value)) throw new Error(`${fields.find(f=>f[0]===key)[1]} must be a whole number.`);
  return Number(value);
}
for (const [key,label,type] of fields) {
  const wrap=node('div'); const l=node('label',label); l.htmlFor=`field-${key}`;
  const input=node('input'); input.id=l.htmlFor; input.name=key; input.type='text'; input.inputMode=type==='time'?'text':'numeric'; input.autocomplete='off';
  input.addEventListener('input',()=>{settingsDirty=true;status('settings-status','Unapplied changes. Results still show the last applied settings.');});
  wrap.append(l,input); $('fields').append(wrap);
}
function populateFields() { for(const [key,,type] of fields) $(`field-${key}`).value=type==='time'?timeInput(scenario.settings[key]):scenario.settings[key]; settingsDirty=false; }
function currentInput() { return inputKind==='json'?exportScenarioJson(scenario):connectionsToCsv(scenario.connections); }
function populateData() { $('import-text').value=currentInput();dataDirty=false; }
async function prepare(value, returnFocus = document.activeElement) {
  const normalized=validateScenario(value);
  const controls=[...document.querySelectorAll('button,input,select,textarea')];
  const previous=controls.map(el=>el.disabled); controls.forEach(el=>{el.disabled=true;});
  $('planner').setAttribute('aria-busy','true');status('settings-status','Calculating scheduled return journeys…');
  try {
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const result=optimizeWindows(normalized); return {normalized,result};
  } finally {
    controls.forEach((el,i)=>{el.disabled=previous[i];});$('planner').removeAttribute('aria-busy');
    // Disabling the focused control sends focus to body. Restore it only if the
    // user has not moved elsewhere and no modal has taken ownership of focus.
    const active=document.activeElement;
    if (returnFocus?.isConnected && !returnFocus.disabled &&
        (!active || active===document.body || active===document.documentElement) &&
        !document.querySelector('dialog[open]')) returnFocus.focus({preventScroll:true});
  }
}
function commit(prepared, { replaceDraft = true } = {}) {
  scenario=prepared.normalized;comparison=prepared.result;selectedStart=comparison.best.start;
  if(!scenario.origins.some(o=>o.id===selectedOrigin))selectedOrigin=scenario.origins[0]?.id;
  populateFields();if(replaceDraft)populateData();render();
}
function renderCard(title, window, best) {
  const card=node('article',undefined,`compare-card${best?' best':''}`);card.append(node('p',title,'card-label'),node('p',range(window),'card-time'));
  const count=node('div',String(window.reachable),'card-count');count.append(node('span',` / ${window.total} origins`));
  card.append(count,node('p',`${scenario.settings.openMinutes} staffed minutes · complete return trips`,'card-explainer'));const inspect=node('button','Inspect journeys →','inspect-button');inspect.type='button';inspect.addEventListener('click',()=>{selectedStart=window.start;renderSelection();$('journey-title').scrollIntoView({block:'start'});});card.append(inspect);return card;
}
function originLabels(entries) { return entries.map(item=>{const id=typeof item==='string'?item:item.originId??item.id;return scenario.origins.find(o=>o.id===id)?.label??String(id);}).join(', ') || 'None'; }
function render() {
  $('data-badge').textContent=scenario.dataKind==='synthetic'?'Synthetic demo':'User-supplied · unverified';
  $('scenario-meta').textContent=`${scenario.title} · Service day ${scenario.serviceDay}`;
  $('comparison').replaceChildren(renderCard('Current opening',comparison.baseline,false),renderCard('Best tested window',comparison.best,true));
  const gained=node('p');gained.append(node('strong','Gained'),document.createTextNode(originLabels(comparison.gained)));
  const lost=node('p',undefined,'loss');lost.append(node('strong','Lost'),document.createTextNode(originLabels(comparison.lost)));
  const net=comparison.best.reachable-comparison.baseline.reachable;
  $('tradeoffs').replaceChildren(node('p',`${net>0?'+':''}${net} net origins versus current hours. Gains do not cancel out the importance of losses.`),gained,lost);
  $('window-chart').replaceChildren();
  for(const window of comparison.windows) {
    const button=node('button',undefined,'window-bar');button.type='button';button.dataset.start=String(window.start);button.setAttribute('aria-label',`${range(window)}: ${window.reachable} of ${window.total} origins reachable`);
    const track=node('span',undefined,'bar-track');const fill=node('span',undefined,'bar-fill');fill.style.height=`${window.total?100*window.reachable/window.total:0}%`;track.append(fill,node('span',String(window.reachable),'bar-count'));
    button.append(track,node('span',formatTime(window.start)));button.addEventListener('click',()=>{selectedStart=window.start;renderSelection();});$('window-chart').append(button);
  }
  renderSelection();
}
function renderSelection() {
  const focusedOrigin=$('origin-list').contains(document.activeElement)?document.activeElement.dataset.originId:undefined;
  const window=(selectedStart===comparison.baseline.start?comparison.baseline:comparison.windows.find(w=>w.start===selectedStart))??comparison.best;
  $('window-selection').textContent=`Inspecting ${range(window)} · ${window.reachable} of ${window.total} origins. The current window above may fall between tested start times.`;
  $('selected-window').textContent=`Selected window ${range(window)}`;
  for(const button of $('window-chart').children)button.setAttribute('aria-pressed',String(Number(button.dataset.start)===window.start));
  $('origin-list').replaceChildren();
  for(const origin of scenario.origins) {
    const result=window.results.find(r=>r.originId===origin.id);const button=node('button',origin.label,'origin-button');button.type='button';button.dataset.originId=origin.id;button.setAttribute('aria-pressed',String(origin.id===selectedOrigin));
    button.append(node('span',result?.reachable?'✓ Return possible':'× No complete trip'));button.addEventListener('click',()=>{selectedOrigin=origin.id;renderSelection();});$('origin-list').append(button);
  }
  if(focusedOrigin!==undefined){const replacement=[...$('origin-list').children].find(button=>button.dataset.originId===focusedOrigin);replacement?.focus({preventScroll:true});}
  const origin=scenario.origins.find(o=>o.id===selectedOrigin), result=window.results.find(r=>r.originId===selectedOrigin);
  const detail=$('journey-detail');detail.replaceChildren();
  if(!origin||!result){detail.append(node('p','No origin available to inspect.','empty'));return;}
  detail.append(node('h3',origin.label),node('p',`Leave no earlier than ${formatTime(origin.leaveAfter)} · Home by ${formatTime(origin.homeBy)} · Up to ${origin.maxAwayMinutes} minutes away`,'journey-meta'));
  if(!result.reachable||!result.journey){detail.append(node('p',result.reason||'No complete scheduled return journey meets these constraints.','failure'));return;}
  const j=result.journey;const list=node('ol',undefined,'timeline');
  const stopName=id=>scenario.stops.find(s=>s.id===id)?.name??id;
  const add=(title,text,cls='')=>{const li=node('li',undefined,cls);li.append(node('strong',title),node('span',text));list.append(li);};
  let previousEnd=null, previousTrip=null;
  for(const c of j.outbound){if(previousEnd!==null&&c.departure>previousEnd)add(`${formatTime(previousEnd)}–${formatTime(c.departure)} · ${previousTrip===c.tripId?'On-board dwell':'Transfer / wait'}`,`${c.departure-previousEnd} scheduled minutes at ${stopName(c.from)}`);add(`${formatTime(c.departure)}–${formatTime(c.arrival)} · Outbound`,`${stopName(c.from)} → ${stopName(c.to)} · Trip ${c.tripId}`);previousEnd=c.arrival;previousTrip=c.tripId;}
  if(previousEnd!==null&&j.pickupStart>previousEnd)add(`${formatTime(previousEnd)}–${formatTime(j.pickupStart)} · Wait before visit`,`${j.pickupStart-previousEnd} minutes at the pantry stop`);
  add(`${formatTime(j.pickupStart)}–${formatTime(j.pickupEnd)} · Pantry visit`,`${scenario.settings.visitMinutes} minutes, inside the selected opening window`,'visit');previousEnd=j.pickupEnd;previousTrip=null;
  for(const c of j.return){if(c.departure>previousEnd)add(`${formatTime(previousEnd)}–${formatTime(c.departure)} · ${previousTrip===c.tripId?'On-board dwell':'Wait / connection'}`,`${c.departure-previousEnd} scheduled minutes at ${stopName(c.from)}`);add(`${formatTime(c.departure)}–${formatTime(c.arrival)} · Return`,`${stopName(c.from)} → ${stopName(c.to)} · Trip ${c.tripId}`);previousEnd=c.arrival;previousTrip=c.tripId;}
  add(`${formatTime(j.arrive)} · Back at origin stop`,`${j.awayMinutes} minutes away · ${j.waitMinutes} scheduled wait minutes`);
  detail.append(list,node('p','One feasible scheduled witness, not a guaranteed or personally recommended itinerary.','hint'));
}
function confirmReplace(message, returnFocus = document.activeElement) {
  const dialog=$('confirm-dialog');const previous=returnFocus;$('confirm-description').textContent=message;
  return new Promise(resolve=>{
    let finished=false;
    const finish=value=>{if(finished)return;finished=true;dialog.close();$('confirm-accept').removeEventListener('click',accept);$('confirm-cancel').removeEventListener('click',cancel);dialog.removeEventListener('cancel',cancel);previous?.focus();resolve(value);};
    const accept=()=>finish(true);const cancel=event=>{event?.preventDefault();finish(false);};
    $('confirm-accept').addEventListener('click',accept);$('confirm-cancel').addEventListener('click',cancel);dialog.addEventListener('cancel',cancel);dialog.showModal();$('confirm-cancel').focus();
  });
}
$('settings-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try {const next=clone(scenario);for(const [key,,type]of fields)next.settings[key]=readField(key,type);const prepared=await prepare(next,event.submitter??document.activeElement);commit(prepared,{replaceDraft:!dataDirty});workingChanged=true;status('settings-status','Applied. Comparison and journey witnesses updated.');if(dataDirty)status('import-status','Your unapplied data draft is preserved; it may contain older settings.');}
  catch(error){status('settings-status',error.message,true);}
});
$('import-text').addEventListener('input',()=>{dataDirty=true;status('import-status','Unapplied draft. Your current comparison is unchanged.');});
$('import-kind').addEventListener('change',async()=>{
  const next=$('import-kind').value;$('import-kind').value=inputKind;
  if(dataDirty&&!await confirmReplace('Changing formats replaces the unapplied text draft. Your applied scenario stays unchanged.',$('import-kind')))return;
  inputKind=next;$('import-kind').value=next;populateData();$('import-help').textContent=next==='json'?'JSON includes stops, origins, timetable and opening constraints. Times are integer minutes from service-day midnight.':'CSV replaces timetable connections only. Use existing stop IDs and HH:MM times (00:00–47:59). Export CSV for the exact columns.';status('import-status','Current data loaded in the selected format.');
});
$('load-current').addEventListener('click',async()=>{if(dataDirty&&!await confirmReplace('Loading current data replaces your unapplied text draft. Your applied scenario stays unchanged.',$('load-current')))return;populateData();status('import-status','Current applied data loaded.');});
$('import-apply').addEventListener('click',async()=>{
  const returnFocus=$('import-apply'); // Preserve the initiator before prepare temporarily disables controls.
  let prepared;
  try{const next=inputKind==='json'?parseScenarioJson($('import-text').value):{...clone(scenario),connections:parseTimetableCsv($('import-text').value),dataKind:'user-supplied'};prepared=await prepare(next,returnFocus);}
  catch(error){status('settings-status',settingsDirty?'Unapplied settings remain. Results still show the last applied settings.':'');status('import-status',`Not imported: ${error.message} Your draft and current comparison are preserved.`,true);return;}
  if(!await confirmReplace(`Replace the current scenario with this validated ${inputKind.toUpperCase()} input?${settingsDirty?' Unapplied settings edits will be discarded.':''} Export first if you want to keep the current scenario.`,returnFocus)){status('settings-status',settingsDirty?'Unapplied settings remain. Results still show the last applied settings.':'');status('import-status','Import cancelled. Draft and current work preserved.');return;}
  commit(prepared);workingChanged=true;status('settings-status','');status('import-status','Validated and imported. Review all assumptions before using these results.');
});
$('reset').addEventListener('click',async()=>{if((workingChanged||settingsDirty||dataDirty)&&!await confirmReplace('Resetting replaces the applied scenario and all unapplied edits with the synthetic example. Export first to keep your current scenario.',$('reset')))return;try{commit(await prepare(clone(SAMPLE),$('reset')));workingChanged=false;status('settings-status','Synthetic example restored.');status('import-status','');}catch(error){status('settings-status',error.message,true);}});
function decisionSheet() {
  const lines=['OPENRETURN / DECISION SHEET',scenario.title,`Service day: ${scenario.serviceDay}`,`Data: ${scenario.dataKind}. Unverified scheduled stop-to-stop scenarios, not travel advice.`, '', `Current: ${range(comparison.baseline)} — ${comparison.baseline.reachable}/${comparison.baseline.total} origins`, `Best tested: ${range(comparison.best)} — ${comparison.best.reachable}/${comparison.best.total} origins`, `Gained: ${originLabels(comparison.gained)}`, `Lost: ${originLabels(comparison.lost)}`, '', 'APPLIED CONSTRAINTS'];
  for(const [key,label,type] of fields)lines.push(`${label}: ${type==='time'?formatTime(scenario.settings[key]):scenario.settings[key]}`);
  const stop=id=>scenario.stops.find(s=>s.id===id)?.name??id;
  for(const [label,window] of [['CURRENT',comparison.baseline],['BEST TESTED',comparison.best]]) {
    lines.push('',`${label}: ${range(window)}`);
    for(const origin of scenario.origins) {
      const r=window.results.find(x=>x.originId===origin.id);
      lines.push('',`${origin.label} (${origin.id})`, `Origin stop: ${stop(origin.stopId)}; leave after ${formatTime(origin.leaveAfter)}; home by ${formatTime(origin.homeBy)}; maximum away ${origin.maxAwayMinutes} min.`);
      if(!r?.reachable||!r.journey){lines.push(`NO COMPLETE TRIP: ${r?.reason||'No feasible return witness.'}`);continue;}
      const j=r.journey;
      for(const c of j.outbound)lines.push(`Outbound ${formatTime(c.departure)}–${formatTime(c.arrival)}: ${stop(c.from)} → ${stop(c.to)} [trip ${c.tripId}, connection ${c.id}]`);
      lines.push(`Visit ${formatTime(j.pickupStart)}–${formatTime(j.pickupEnd)} at ${stop(scenario.pantryStop)}`);
      for(const c of j.return)lines.push(`Return ${formatTime(c.departure)}–${formatTime(c.arrival)}: ${stop(c.from)} → ${stop(c.to)} [trip ${c.tripId}, connection ${c.id}]`);
      lines.push(`Back ${formatTime(j.arrive)}; ${j.awayMinutes} minutes away; ${j.waitMinutes} scheduled wait minutes.`);
    }
  }
  lines.push('', 'LIMITATIONS', 'Counts represent origins, not people served or real-world impact. Equal staffed duration does not establish fairness. Review every lost origin.', 'Best means highest reachable count among tested start times only, then closest to current start, then earlier start; a coarse step may miss better windows. One feasible witness is shown per origin, not a guaranteed itinerary.', 'One supplied service-day timetable. No walking, live delays, cancellations, fares, wheelchair accessibility, capacity, demand, or automatic service-calendar / GTFS verification.', 'Verify the date, timetable, stop access and local assumptions with operators and the community before changing real opening hours.', 'No accounts, telemetry or autosave. This export contains applied data only; unapplied drafts are excluded.');
  return lines.join('\n');
}
function exportData(kind) {
  const text=kind==='txt'?decisionSheet():kind==='json'?exportScenarioJson(scenario):connectionsToCsv(scenario.connections);$('export-text').value=text;$('export-fallback').open=true;
  const blob=new Blob([text],{type:kind==='json'?'application/json':kind==='txt'?'text/plain;charset=utf-8':'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=node('a');a.href=url;a.download=`openreturn-scenario.${kind}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  status('import-status',`Export prepared from applied data.${settingsDirty||dataDirty?' Unapplied drafts are not included.':''} Copyable content is also available below.`);
}
$('export-report').addEventListener('click',()=>exportData('txt'));
$('export-json').addEventListener('click',()=>exportData('json'));$('export-csv').addEventListener('click',()=>exportData('csv'));
window.addEventListener('beforeunload',event=>{if(workingChanged||settingsDirty||dataDirty){event.preventDefault();event.returnValue='';}});
try {commit(await prepare(clone(SAMPLE)));status('settings-status','');} catch(error) {status('settings-status',`Unable to initialize the scenario: ${error.message}`,true);}
