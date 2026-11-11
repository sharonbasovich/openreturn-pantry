// Same bounded synthetic workload as scripts/verify-worker-threads.mjs.
export function capacityFixture() {
  const large={version:1,title:'Independent capacity fixture',serviceDay:'2026-11-09',dataKind:'synthetic',stops:[{id:'a',name:'Origin'},{id:'p',name:'Pantry'}],pantryStop:'p',origins:Array.from({length:24},(_,i)=>({id:`o${i}`,stopId:'a',label:`Origin ${i}`,leaveAfter:0,homeBy:2879,maxAwayMinutes:2879})),connections:[],settings:{baselineStart:600,earliestStart:0,latestStart:1410,openMinutes:120,visitMinutes:15,stepMinutes:30,transferMinutes:5,maxTransfers:3}};
  for(let i=0;i<600;i++){const d=2*i;large.connections.push({id:`out${i}`,tripId:`out${i}`,from:'a',to:'p',departure:d,arrival:d+1},{id:`back${i}`,tripId:`back${i}`,from:'p',to:'a',departure:d+2,arrival:d+3});}
  return large;
}

// Separate stress case: identities are synthetic constraint scenarios, not people.
// Deliberately stagger availability and away budgets, not merely origin labels.
export function distinctConstraintFixture() {
  const fixture=capacityFixture();
  fixture.title='Synthetic distinct-constraint QA workload';
  fixture.settings.baselineStart=900;
  fixture.origins.forEach((origin,i)=>{
    origin.label=`Synthetic constraint ${i+1}`;
    origin.leaveAfter=30*i;
    origin.homeBy=480+30*i;
    origin.maxAwayMinutes=18+i;
  });
  return fixture;
}
