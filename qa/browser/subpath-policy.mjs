// QA-only policy and mount contract. These are not deployment recommendations.
export const mount='/openreturn/';
export const origin='http://127.0.0.1:4199';
export const runtimeNames=['index.html','src/style.css','src/app.mjs','src/model.mjs','src/journey.mjs','src/sample.mjs','src/import.mjs','src/decision.mjs','src/report.mjs','src/report-text.mjs','src/calculation.mjs','src/calculation-worker.mjs'];
export function policy(blockWorkers=false){
  return "default-src 'none'; script-src 'self'; worker-src "+(blockWorkers?"'none'":"'self'")+"; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
}
export function route(url){
  const parsed=new URL(url,origin);
  if(parsed.pathname==='/favicon.ico')return {kind:'favicon'};
  if(!parsed.pathname.startsWith(mount))return {kind:'reject'};
  const name=parsed.pathname.slice(mount.length)||'index.html';
  if(!runtimeNames.includes(name))return {kind:'reject'};
  const blocked=parsed.search==='?workers=blocked'&&name==='index.html';
  if(parsed.search&&!blocked)return {kind:'reject'};
  return {kind:'runtime',name,blocked};
}
