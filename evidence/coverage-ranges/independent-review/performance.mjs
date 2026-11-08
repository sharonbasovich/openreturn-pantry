import {performance} from 'node:perf_hooks';
import {analyzeCoverageRanges} from '../../../src/model.mjs';
const s={version:1,title:'Independent bounded performance probe',serviceDay:'2026-11-08',dataKind:'synthetic',stops:[{id:'a',name:'A'},{id:'p',name:'P'}],pantryStop:'p',origins:Array.from({length:24},(_,i)=>({id:`o${i}`,label:`O${i}`,stopId:'a',leaveAfter:0,homeBy:2879,maxAwayMinutes:2879})),connections:[],settings:{earliestStart:0,latestStart:2759,baselineStart:600,openMinutes:120,visitMinutes:15,stepMinutes:60,transferMinutes:5,maxTransfers:3}};
for(let i=0;i<600;i++){s.connections.push({id:`o${i}`,tripId:`o${i}`,from:'a',to:'p',departure:i*2,arrival:i*2+1},{id:`r${i}`,tripId:`r${i}`,from:'p',to:'a',departure:i*2+2,arrival:i*2+3});}
for(const kind of ['shared-constraints','distinct-constraints']){
 if(kind==='distinct-constraints')s.origins.forEach((o,i)=>{o.leaveAfter=i;o.homeBy=2600+i;o.maxAwayMinutes=100+i*20;});
 const start=performance.now(),a=analyzeCoverageRanges(s);console.log(JSON.stringify({kind,milliseconds:performance.now()-start,connections:s.connections.length,origins:s.origins.length,integerStarts:s.settings.latestStart+1,...a.diagnostics,ranges:a.ranges.length,node:process.version}));
}
console.log('Synthetic Node measurements only, not a worst-case runtime bound or browser responsiveness claim.');
