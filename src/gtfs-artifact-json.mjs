/** Node-only pure JSON contract shared by artifact generation and replay. No I/O. */
import {MAX_JSON_BYTES} from './import.mjs';
export const RECEIPT_LIMITS=Object.freeze({receiptBytes:4_000_000,scenarioBytes:MAX_JSON_BYTES+1,jsonDepth:32});
const fail=code=>{throw new Error(code);};
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
