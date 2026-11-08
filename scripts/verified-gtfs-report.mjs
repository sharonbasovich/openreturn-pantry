// Additive read-only report CLI. Bounded loader deliberately mirrors the check-only CLI.
// Keep source files and parent directories unchanged while reading; no snapshot claim.
import {constants} from 'node:fs';
import {lstat,open,opendir} from 'node:fs/promises';
import {join} from 'node:path';
import {GTFS_FILE_NAMES,GTFS_LIMITS} from '../src/gtfs-subset.mjs';
import {RECEIPT_LIMITS} from '../src/verify-gtfs-receipt.mjs';
import {buildVerifiedGtfsReport} from '../src/verified-gtfs-report.mjs';
const usage='Usage: node scripts/verified-gtfs-report.mjs --scenario FILE --receipt FILE --feed DIR --template FILE';
async function read(path,limit) {
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('REGULAR_FILE_REQUIRED');
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try {
    const current=await handle.stat();
    if(!current.isFile()||current.ino!==stat.ino||current.dev!==stat.dev)throw new Error('INPUT_CHANGED');
    if(current.size>limit)throw new Error('INPUT_SIZE_LIMIT');
    const chunks=[];let total=0;
    while(true){const buffer=Buffer.alloc(Math.min(65536,limit+1-total));const {bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;if(total>limit)throw new Error('INPUT_SIZE_LIMIT');chunks.push(buffer.subarray(0,bytesRead));}
    try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks,total));}catch{throw new Error('INVALID_UTF8');}
  }finally{await handle.close();}
}
async function run(args) {
  if(args.length===1&&args[0]==='--help'){console.log(usage);return;}
  const flags=['--scenario','--receipt','--feed','--template'],values={};
  for(let i=0;i<args.length;i+=2){if(!flags.includes(args[i])||!args[i+1]||Object.hasOwn(values,args[i]))throw new Error('INVALID_ARGUMENTS');values[args[i]]=args[i+1];}
  if(flags.some(f=>!values[f]))throw new Error('INVALID_ARGUMENTS');
  const scenarioText=await read(values['--scenario'],RECEIPT_LIMITS.scenarioBytes);
  const receiptText=await read(values['--receipt'],RECEIPT_LIMITS.receiptBytes);
  const templateText=await read(values['--template'],GTFS_LIMITS.templateBytes);
  const feed=values['--feed'],stat=await lstat(feed);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('FEED_DIRECTORY_REQUIRED');
  const files=Object.create(null);let count=0,total=0;
  for await(const entry of await opendir(feed)){
    if(++count>GTFS_FILE_NAMES.length||!GTFS_FILE_NAMES.includes(entry.name))throw new Error('UNSUPPORTED_FEED_ENTRY');
    const text=await read(join(feed,entry.name),Math.min(GTFS_LIMITS.fileBytes,GTFS_LIMITS.totalBytes-total));
    total+=Buffer.byteLength(text);files[entry.name]=text;
  }
  const report=buildVerifiedGtfsReport({scenarioText,receiptText,templateText,files});
  process.stdout.write(report+'\n');
}
try{await run(process.argv.slice(2));}catch(error){
  // Fixed codes only: never echo source content, local paths, IDs or raw errors.
  const allowed=new Set(['REGULAR_FILE_REQUIRED','INPUT_CHANGED','INPUT_SIZE_LIMIT','INVALID_UTF8','INVALID_ARGUMENTS','FEED_DIRECTORY_REQUIRED','UNSUPPORTED_FEED_ENTRY','INVALID_JSON_INPUT','INVALID_JSON','JSON_DEPTH_LIMIT','DUPLICATE_JSON_KEY','UNSUPPORTED_RECEIPT','INVALID_SELECTION','REPLAY_REJECTED','RECEIPT_REPLAY_MISMATCH','SCENARIO_BYTES_MISMATCH']);
  console.error(JSON.stringify({ok:false,error:allowed.has(error.message)?error.message:'VERIFIED_REPORT_FAILED'}));process.exitCode=1;
}
