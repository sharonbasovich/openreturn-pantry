// Separate origin: root runtime fallback is impossible. Production bytes unchanged.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {route,policy} from './subpath-policy.mjs';
let records=[];
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/__qa/evidence'){
    if(req.method==='POST'){records=[];res.end('reset');return;}
    if(req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(records));return;}
  }
  if(req.url==='/__qa/health'&&req.method==='GET'){res.end('ready');return;}
  const entry={url:req.url,method:req.method};records.push(entry);
  const match=route(req.url);
  if(req.method!=='GET'||match.kind==='reject'){entry.status=404;res.writeHead(404).end('No root runtime fallback');return;}
  // A browser may request its default icon at the origin root. It gets no file,
  // no runtime fallback and no redirect; this explicit auxiliary URL is journaled.
  if(match.kind==='favicon'){entry.status=204;entry.auxiliary=true;res.writeHead(204).end();return;}
  try{
    const bytes=await readFile(new URL('../../'+match.name,import.meta.url));
    entry.status=200;entry.name=match.name;entry.sha256=createHash('sha256').update(bytes).digest('hex');entry.policy=policy(match.blocked);
    res.setHeader('Content-Security-Policy',entry.policy);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Type',match.name.endsWith('.html')?'text/html':match.name.endsWith('.css')?'text/css':'text/javascript');
    res.end(bytes);
  }catch{entry.status=404;res.writeHead(404).end();}
});
server.listen(4199,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit()));
