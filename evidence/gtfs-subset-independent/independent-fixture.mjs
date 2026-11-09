// Reviewer-authored synthetic data. No public agency feed or personal data.
export const csv = (headers, rows) => [headers, ...rows].map(row=>row.map(x=>/[",\r\n]/u.test(String(x))?'"'+String(x).replaceAll('"','""')+'"':String(x)).join(',')).join('\n')+'\n';
export const heads = {
  agency: ['agency_id','agency_name','agency_url','agency_timezone'],
  stops: ['stop_id','stop_name','stop_lat','stop_lon','location_type'],
  routes: ['route_id','agency_id','route_short_name','route_long_name','route_type'],
  trips: ['route_id','service_id','trip_id'],
  stop_times: ['trip_id','arrival_time','departure_time','stop_id','stop_sequence'],
  calendar: ['service_id','monday','tuesday','wednesday','thursday','friday','saturday','sunday','start_date','end_date'],
  calendar_dates: ['service_id','date','exception_type'],
};
export function makeTables(){return {
 agency:[['AG','Synthetic Reviewer Agency','https://example.invalid','Etc/UTC']],
 stops:[['A','Alpha',0,0,0],['B','Bravo',0,0,0],['P','Pantry',0,0,0]],
 routes:[['R','AG','Test','Review route',3]],
 trips:[['R','S','LOOP'],['R','S','BACK']],
 stop_times:[['LOOP','08:00:00','08:00:00','A',0],['LOOP','08:05:00','08:08:00','B',2],['LOOP','08:13:00','08:14:00','A',11],['LOOP','08:19:00','08:19:00','P',22],['BACK','08:40:00','08:40:00','P',1],['BACK','08:50:00','08:50:00','A',2]],
 calendar:[['S',0,0,0,0,0,0,1,'20261101','20261130']],
};}
export function makeFiles(mutate=()=>{}) {const tables=makeTables(), headers=structuredClone(heads); mutate(tables,headers); return Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name+'.txt',csv(headers[name],rows)]));}
export function makeTemplate() {return {
 version:1,title:'Independent GTFS review',serviceDay:'2026-11-08',dataKind:'synthetic',
 stops:[{id:'A',name:'Template A'},{id:'B',name:'Template B'},{id:'P',name:'Template P'}],pantryStop:'P',
 origins:[{id:'anonymous-A',stopId:'A',label:'Synthetic origin',leaveAfter:480,homeBy:540,maxAwayMinutes:90}],
 connections:[{id:'old',tripId:'old',from:'A',to:'P',departure:480,arrival:485}],
 settings:{baselineStart:500,earliestStart:500,latestStart:500,openMinutes:30,visitMinutes:10,stepMinutes:1,transferMinutes:15,maxTransfers:0},
};}
