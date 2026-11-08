// Optional Node-only adapter. No network, ZIP extraction, packages or browser changes.
import {constants} from 'node:fs';
import {lstat,open,readdir,mkdir,unlink,rmdir,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {adaptGtfsSubset,GTFS_LIMITS,GTFS_FILE_NAMES} from '../src/gtfs-subset.mjs';
import {exportScenarioJson} from '../src/import.mjs';
import {createHash} from 'node:crypto';
import {strictJson,RECEIPT_LIMITS} from '../src/gtfs-artifact-json.mjs';

const usage='Usage: node scripts/import-gtfs-subset.mjs --feed DIR --date YYYY-MM-DD (--route ID [--route ID ...] | --trip ID [--trip ID ...]) --template FILE --out NEW_DIR';
function argumentsFor(args) {
  const values={},routes=[],trips=[];
  for(let i=0;i<args.length;i+=2) {
    const flag=args[i],value=args[i+1];
    if(!['--feed','--date','--route','--trip','--template','--out'].includes(flag)||value===undefined) throw new Error(usage);
    if(flag==='--route') routes.push(value);
    else if(flag==='--trip') trips.push(value);
    else {if(Object.hasOwn(values,flag)) throw new Error(`Duplicate argument ${flag}.`);values[flag]=value;}
  }
  if(!['--feed','--date','--template','--out'].every(k=>values[k])||Boolean(routes.length)===Boolean(trips.length)) throw new Error(usage);
  return {values,scope:routes.length?{routeIds:routes}:{tripIds:trips}};
}
async function boundedText(path,limit,label) {
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()) throw new Error(`${label} must be a regular file, not a symlink.`);
  // O_NOFOLLOW is defense in depth where provided; always compare inode/device.
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {
    const current=await handle.stat();
    if(!current.isFile()||current.ino!==stat.ino||current.dev!==stat.dev) throw new Error(`${label} changed while opening.`);
    if(current.size>limit) throw new Error(`${label} exceeds its byte limit.`);
    const chunks=[];let total=0;
    while(true) {
      const buffer=Buffer.alloc(Math.min(65536,limit+1-total));
      const {bytesRead}=await handle.read(buffer,0,buffer.length,null);
      if(!bytesRead) break;
      total+=bytesRead;if(total>limit) throw new Error(`${label} exceeds its byte limit.`);
      chunks.push(buffer.subarray(0,bytesRead));
    }
    const data=Buffer.concat(chunks,total);
    // Preserve a UTF-8 BOM in hashes; the CSV/JSON parsers handle it explicitly.
    return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);
  } finally {await handle.close();}
}
async function run(args) {
  if(args.length===1&&args[0]==='--help') {process.stdout.write(usage+'\n');return;}
  const {values,scope}=argumentsFor(args);
  const feed=values['--feed'],out=values['--out'];
  const stat=await lstat(feed);
  if(!stat.isDirectory()||stat.isSymbolicLink()) throw new Error('Feed must be a directory of extracted regular files, not a symlink.');
  const names=(await readdir(feed)).sort();
  if(names.length>GTFS_FILE_NAMES.length) throw new Error('Feed contains too many or unsupported entries.');
  const files=Object.create(null);let total=0;
  for(const name of names) {
    if(!GTFS_FILE_NAMES.includes(name)) throw new Error(`Unsupported feed entry ${JSON.stringify(name)}. Do not strip restrictions to force acceptance.`);
    files[name]=await boundedText(join(feed,name),Math.min(GTFS_LIMITS.fileBytes,GTFS_LIMITS.totalBytes-total),name);
    total+=Buffer.byteLength(files[name],'utf8');
  }
  const templateText=await boundedText(values['--template'],GTFS_LIMITS.templateBytes,'Template');
  const template=strictJson(templateText,GTFS_LIMITS.templateBytes);
  const {scenario,receipt}=adaptGtfsSubset({files,serviceDay:values['--date'],...scope,template});
  receipt.templateInput={bytes:Buffer.byteLength(templateText,'utf8'),sha256:createHash('sha256').update(templateText,'utf8').digest('hex')};
  const outputs=[['scenario.json',exportScenarioJson(scenario)+'\n'],['receipt.json',JSON.stringify(receipt,null,2)+'\n']];
  // Apply the replay reader's JSON/UTF-8 byte contract to the exact serialized
  // pair (including final LF), before any output directory or file is created.
  strictJson(outputs[0][1],RECEIPT_LIMITS.scenarioBytes);
  strictJson(outputs[1][1],RECEIPT_LIMITS.receiptBytes);
  // Validate everything before reserving a fresh directory. Never overwrite it.
  // mkdir is nonrecursive: its existing parent must not be the source feed.
  // Resolve ancestor aliases too; this is not protection against concurrent moves.
  if(await realpath(dirname(out))===await realpath(feed)) throw new Error('Output directory must be outside the source feed.');
  await mkdir(out,{mode:0o700});
  const created=[];
  try {
    for(const [name,content] of outputs) {
      const handle=await open(join(out,name),'wx',0o600);
      created.push(name);
      try {await handle.writeFile(content,'utf8');} finally {await handle.close();}
    }
  } catch(error) {
    // Remove only files this invocation created, never arbitrary directory contents.
    let clean=true;
    for(const name of created) {try {await unlink(join(out,name));} catch {clean=false;}}
    try {await rmdir(out);} catch {clean=false;}
    if(!clean) throw new Error('Output failed and cleanup was incomplete. Inspect the requested output directory; do not use partial files.');
    throw error;
  }
  process.stdout.write(`Created scenario.json and receipt.json: ${scenario.stops.length} stops, ${receipt.output.trips} trips, ${scenario.connections.length} adjacent legs. Restricted schedule projection only; keep the receipt.\n`);
}
try {await run(process.argv.slice(2));} catch(error) {
  // Do not echo host-dependent source/output paths in diagnostics or receipts.
  const detail=error.code?`Local file operation failed (${error.code}); check input files and use a new output directory.`:error.message;
  console.error(`GTFS subset not created: ${detail}`);process.exitCode=1;
}
