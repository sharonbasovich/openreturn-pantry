import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=process.argv[2]||fileURLToPath(new URL('../../', import.meta.url));
const io=await import(pathToFileURL(root+'/src/import.mjs'));
const {validateScenario}=await import(pathToFileURL(root+'/src/model.mjs'));
const {SAMPLE}=await import(pathToFileURL(root+'/src/sample.mjs'));
let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
for(const ch of ['x','"','漢','\u0000','\ud800','🚌']) {
 const id=i=>String(i).padStart(4,'0')+ch.repeat(Math.floor(76/ch.length));
 const s=validateScenario({...SAMPLE,stops:Array.from({length:64},(_,i)=>({id:id(i),name:'N'+ch.repeat(Math.floor(159/ch.length))})),pantryStop:id(0),origins:Array.from({length:24},(_,i)=>({id:id(i),label:'N'+ch.repeat(Math.floor(159/ch.length)),stopId:id(i),leaveAfter:0,homeBy:2879,maxAwayMinutes:2879})),connections:Array.from({length:1200},(_,i)=>({id:id(i),tripId:id(i),from:id(0),to:id(1),departure:0,arrival:2879}))});
 const j=io.exportScenarioJson(s);equal(io.parseScenarioJson(await new Blob([j]).text()),s);
 if(['\0','\ud800'].includes(ch)){assert.throws(()=>io.connectionsToCsv(s.connections),/scenario JSON/);checks++;}
 else {const csv=io.connectionsToCsv(s.connections);equal(io.parseTimetableCsv(await new Blob([csv]).text()),s.connections);}
}
for(const field of ['id','tripId','from','to'])for(const id of [' edge','edge ','a\tb','a\nb','a\0b','a\u0085b','a\ud800b','a\udc00b','=1+1','-1','+1','@SUM(A1)']) {
 const c=structuredClone(SAMPLE.connections);c[0][field]=id;assert.throws(()=>io.connectionsToCsv(c),/scenario JSON/);checks++;
}
for(const id of ['001','1e10','01/02','a,b','a"b','漢','🚌','a b','a\u200bb']) {
 const c=structuredClone(SAMPLE.connections);c[0].id=id;equal(io.parseTimetableCsv(await new Blob([io.connectionsToCsv(c)]).text()),c);
}
const csv=io.connectionsToCsv(SAMPLE.connections), atLimit=csv+'\n'.repeat(io.MAX_CSV_BYTES-Buffer.byteLength(csv));
equal(io.parseTimetableCsv(atLimit),SAMPLE.connections);
assert.throws(()=>io.parseTimetableCsv(atLimit+'\n'),/too large/);checks++;
let bomRejected=false;try{io.parseTimetableCsv('\uFEFF'+atLimit);}catch(e){bomRejected=/too large/.test(e.message);}
equal(bomRejected,true);
console.log(JSON.stringify({checks,bomFileBytes:Buffer.byteLength('\uFEFF'+atLimit),bomRejected,expectedBomRejected:true}));
