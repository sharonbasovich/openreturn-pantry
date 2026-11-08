import assert from 'node:assert/strict';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const candidateRoot = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../../', import.meta.url));
const {evaluateWindow,optimizeWindows} = await import(pathToFileURL(join(candidateRoot, 'src/model.mjs')).href);
const s={version:1,title:'Synthetic alias regression',serviceDay:'2026-11-08',dataKind:'synthetic',stops:[{id:'A',name:'A'},{id:'P',name:'P'}],pantryStop:'P',origins:['a','b'].map(id=>({id,label:id,stopId:'A',leaveAfter:0,homeBy:150,maxAwayMinutes:150})),connections:[{id:'out',tripId:'out',from:'A',to:'P',departure:20,arrival:30},{id:'back',tripId:'back',from:'P',to:'A',departure:70,arrival:80}],settings:{baselineStart:40,earliestStart:40,latestStart:50,stepMinutes:10,openMinutes:30,visitMinutes:10,transferMinutes:3,maxTransfers:2}};
for(const make of [()=>evaluateWindow(s,40),()=>optimizeWindows(s).windows[0]]){
 const r=make(),peer=structuredClone(r.results[1]);
 assert.notStrictEqual(r.results[0].journey.outbound,r.results[1].journey.outbound);
 assert.notStrictEqual(r.results[0].journey.return,r.results[1].journey.return);
 r.results[0].journey.outbound.push({id:'array mutation'});
 r.results[0].journey.return.splice(0,1);
 assert.deepStrictEqual(r.results[1],peer);
 assert.deepStrictEqual(make().results[1],peer);
}
console.log('PASS: cross-origin outbound and return array mutation isolation, evaluateWindow and optimizeWindows; later invocations unaffected.');
