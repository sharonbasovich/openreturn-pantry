// Local-only QA server. Exact mode serves production runtime bytes unchanged.
// Held/failure modes deliberately change only the NEXT worker module response.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
let next='exact';
const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  res.setHeader('Cache-Control','no-store');
  if(pathname==='/__qa/next'&&req.method==='POST'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>100){res.writeHead(413).end();return;}}
    if(!['exact','held','failure'].includes(body)){res.writeHead(400).end();return;}
    next=body;res.end('ok');return;
  }
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  let relative;try{relative=decodeURIComponent(pathname).replace(/^\/+/, '')||'index.html';}catch{res.writeHead(400).end();return;}
  // Never expose the test harness or arbitrary local files.
  if(!(relative==='index.html'||/^src\/[\w.-]+\.(mjs|css)$/.test(relative))){res.writeHead(404).end();return;}
  try{
    let bytes=await readFile(path.join(root,relative));
    if(relative==='src/calculation-worker.mjs'){
      const mode=next;next='exact';
      res.setHeader('X-OpenReturn-QA-Mode',mode);
      if(mode==='failure'){res.writeHead(404).end('Deliberate QA module load failure');return;}
      if(mode==='held')bytes=Buffer.concat([bytes,Buffer.from('\n// QA ONLY: real module worker, delayed execution for deterministic cancellation.\nself.onmessage = event => { setTimeout(() => self.postMessage(calculateRequest(event.data)), 60000); };\n')]);
    }
    res.setHeader('Content-Type',types[path.extname(relative)]||'application/octet-stream');res.end(bytes);
  }catch{res.writeHead(404).end();}
});
server.listen(4198,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit()));
