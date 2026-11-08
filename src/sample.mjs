// Original, intentionally synthetic service-day fixture. Not a real transit feed.
const leg = (id, tripId, from, to, departure, arrival) => ({id,tripId,from,to,departure,arrival});
const origin = (id, stopId, label) => ({id,stopId,label,leaveAfter:480,homeBy:960,maxAwayMinutes:180});
export const SAMPLE = {
  version:1, title:'The Thursday pantry window', serviceDay:'2026-11-12', dataKind:'synthetic',
  stops:[['P','Community pantry'],['A','Maple Court'],['B','Hilltop'],['C','Willow'],['D','West End'],['E','Orchard'],['F','Eastbank'],['G','South Wharf'],['HB','Hilltop interchange'],['HW','West End interchange']].map(([id,name])=>({id,name})),
  pantryStop:'P', origins:[origin('maple','A','Maple Court'),origin('hilltop','B','Hilltop'),origin('willow','C','Willow'),origin('west','D','West End'),origin('orchard','E','Orchard'),origin('east','F','Eastbank'),origin('wharf','G','South Wharf')],
  connections:[
    leg('a-out','A1','A','P',525,540),leg('a-home','A2','P','A',600,615),
    leg('b-out-1','B1','B','HB',580,590),leg('b-out-2','B1','HB','P',593,605),
    leg('b-home-1','B2','P','HB',645,660),leg('b-home-2','B2','HB','B',663,675),
    leg('c-out','C1','C','P',580,600),leg('c-home','C2','P','C',730,750),
    leg('d-out-1','D1','D','HW',630,645),leg('d-out-2','D2','HW','P',651,670),
    leg('d-home-1','D3','P','HW',700,710),leg('d-home-2','D4','HW','D',716,730),
    leg('e-out','E1','E','P',680,700),leg('e-home','E2','P','E',730,750),
    leg('f-out','F1','F','P',705,725),leg('f-home','F2','P','F',755,775),
    leg('g-out','G1','G','P',610,630)
  ],
  settings:{baselineStart:540,openMinutes:120,visitMinutes:15,earliestStart:540,latestStart:780,stepMinutes:15,transferMinutes:5,maxTransfers:2}
};
