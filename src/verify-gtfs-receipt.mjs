/** Node-only pure replay verification. No I/O and no authenticity claim. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {adaptGtfsSubset,GTFS_LIMITS} from './gtfs-subset.mjs';
import {exportScenarioJson} from './import.mjs';
import {strictJson,RECEIPT_LIMITS} from './gtfs-artifact-json.mjs';
export {strictJson,RECEIPT_LIMITS} from './gtfs-artifact-json.mjs';
const fail=code=>{throw new Error(code);};
const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');
export function verifyGtfsReceipt({scenarioText,receiptText,templateText,files}) {
  // Even an otherwise matching hash must not admit malformed/ambiguous JSON.
  strictJson(scenarioText,RECEIPT_LIMITS.scenarioBytes);
  const receipt=strictJson(receiptText,RECEIPT_LIMITS.receiptBytes);
  const template=strictJson(templateText,GTFS_LIMITS.templateBytes);
  if(!receipt||receipt.format!=='openreturn-gtfs-subset-receipt'||receipt.version!==1||receipt.adapterVersion!=='1.0.0')fail('UNSUPPORTED_RECEIPT');
  const selection=receipt.selection;
  if(!selection||!['routeIds','tripIds'].includes(selection.kind)||!Array.isArray(selection.ids))fail('INVALID_SELECTION');
  let replay;
  try{replay=adaptGtfsSubset({files,template,serviceDay:receipt.serviceDay,[selection.kind]:selection.ids});}
  catch{fail('REPLAY_REJECTED');}
  replay.receipt.templateInput={bytes:Buffer.byteLength(templateText),sha256:digest(templateText)};
  // This is a full strict schema/content comparison against the pinned adapter,
  // not a check of only output.sha256 or selected metadata.
  if(!isDeepStrictEqual(receipt,replay.receipt))fail('RECEIPT_REPLAY_MISMATCH');
  if(scenarioText!==exportScenarioJson(replay.scenario)+'\n')fail('SCENARIO_BYTES_MISMATCH');
  return {ok:true,check:'local-replay',receiptVersion:1,adapterVersion:'1.0.0',scenarioSha256:digest(scenarioText),receiptSha256:digest(receiptText),assurance:'Exact scenario bytes and all receipt fields match this adapter replay of supplied local inputs. Date/scope are receipt-declared, not confirmed user intent. Hashes are not signatures; source completeness, currentness, licensing and real-world feasibility are not verified.'};
}
