/** Node-only pure replay verification. No I/O and no authenticity claim. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {adaptGtfsSubset,GTFS_LIMITS} from './gtfs-subset.mjs';
import {exportScenarioJson,MAX_JSON_BYTES} from './import.mjs';
export const RECEIPT_LIMITS=Object.freeze({receiptBytes:4_000_000,scenarioBytes:MAX_JSON_BYTES+1,jsonDepth:32});
const fail=code=>{throw new Error(code);};
const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');
// Scan JSON containers before parsing: reject duplicate (including escaped) keys,
// excessive nesting and malformed Unicode rather than silently selecting a value.
export function strictJson(text,limit) {
  if(typeof text!=='string'||!text.isWellFormed()||Buffer.byteLength(text)>limit) fail('INVALID_JSON_INPUT');
  text=text.replace(/^\uFEFF/,'');let i=0;
  const ws=()=>{while(/[\x20\t\r\n]/.test(text[i]??'!')) i++;};
  const string=()=>{
    const start=i++;while(i<text.length) {
      const c=text[i++];if(c==='\\'){i++;continue;}
      if(c==='"') {let s;try{s=JSON.parse(text.slice(start,i));}catch{fail('INVALID_JSON');}if(!s.isWellFormed())fail('INVALID_JSON');return s;}
    }fail('INVALID_JSON');
  };
  const value=depth=>{
    if(depth>RECEIPT_LIMITS.jsonDepth)fail('JSON_DEPTH_LIMIT');ws();
    if(text[i]==='"'){string();return;}
    const object=text[i]==='{',array=text[i]==='[';
    if(object||array){i++;ws();const end=object?'}':']',keys=new Set();if(text[i]===end){i++;return;}
      while(i<text.length){if(object){if(text[i]!=='"')fail('INVALID_JSON');const key=string();if(keys.has(key))fail('DUPLICATE_JSON_KEY');keys.add(key);ws();if(text[i++]!==':')fail('INVALID_JSON');}
        value(depth+1);ws();if(text[i]===end){i++;return;}if(text[i++]!==',')fail('INVALID_JSON');ws();
      }fail('INVALID_JSON');
    }
    const match=/^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if(!match)fail('INVALID_JSON');i+=match[0].length;
  };
  value(0);ws();if(i!==text.length)fail('INVALID_JSON');
  try{return JSON.parse(text);}catch{fail('INVALID_JSON');}
}
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
