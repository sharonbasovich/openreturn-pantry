import { build, version } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const modules = ['app','decision','import','journey','model','report','sample'].map(n => `src/${n}.mjs`);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const expectedVersion = '0.21.5';
export async function buildOffline(base = root) {
  assert.equal(version, expectedVersion, 'Use the lockfile-pinned builder');
  const inputs = ['index.html', 'src/style.css', ...modules];
  const source = Object.fromEntries(await Promise.all(inputs.map(async p => [p, await readFile(resolve(base,p),'utf8')])));
  const result = await build({absWorkingDir:base,entryPoints:['src/app.mjs'],bundle:true,write:false,
    format:'esm',platform:'browser',target:'es2022',charset:'utf8',minify:false,treeShaking:false,
    sourcemap:false,legalComments:'inline',metafile:true,logLevel:'silent',
    plugins:[{name:'closed-local-module-graph',setup(b){b.onResolve({filter:/.*/},args=>{
      if(args.kind !== 'entry-point' && args.kind !== 'import-statement') throw new Error(`Unsupported module request: ${args.kind}`);
      const absolute=resolve(args.resolveDir,args.path);
      if(!modules.some(p=>resolve(base,p)===absolute)) throw new Error(`Unapproved module: ${args.path}`);
      return {path:absolute};
    });}}]});
  assert.deepEqual(result.warnings,[], 'Warnings require review');
  assert.deepEqual(Object.keys(result.metafile.inputs).sort(), [...modules].sort());
  assert.equal(result.outputFiles.length,1);
  assert.ok(Object.values(result.metafile.outputs).every(o=>o.imports.length===0),'No remaining module requests');
  const js = result.outputFiles[0].text;
  const css = source['src/style.css'];
  // Narrow packaging contract, not a general CSS/HTML parser. Current styles have
  // no URLs/imports; fail closed when future styles introduce either spelling.
  assert.ok(!/@import|url\s*\(|<\/style/i.test(css),'Review new stylesheet resource/HTML syntax');
  assert.ok(!/<\/script/i.test(js),'Unexpected script end tag after bundling');
  const styleTag='<link rel="stylesheet" href="./src/style.css">';
  const scriptTag='<script type="module" src="./src/app.mjs"></script>';
  let html=source['index.html'];
  for(const tag of [styleTag,scriptTag]) assert.equal(html.split(tag).length,2,'Expected exactly one asset tag');
  // Hash-based CSP permits only these exact inline assets. No eval, networking,
  // workers, forms, frames or remote assets. Downloads remain ordinary blob links.
  const hash = s => createHash('sha256').update(s).digest('base64');
  const policy=`default-src 'none'; script-src 'sha256-${hash(js)}'; style-src 'sha256-${hash(css)}'; base-uri 'none'; form-action 'none'; connect-src 'none'; object-src 'none'`;
  html=html.replace(styleTag,`<meta http-equiv="Content-Security-Policy" content="${policy}"><style>${css}</style>`)
    .replace(scriptTag,`<script type="module">${js}</script>`);
  const manifest={schema:1,builder:{name:'esbuild',version,format:'esm',target:'es2022'},
    sourceSha256:Object.fromEntries(inputs.map(p=>[p,sha256(source[p])])),
    artifact:{file:'openreturn-offline.html',bytes:Buffer.byteLength(html),sha256:sha256(html)},
    moduleInputs:Object.keys(result.metafile.inputs).sort(),outputImports:[]};
  return {html,manifest,js,css};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {html,manifest}=await buildOffline();
  await mkdir(resolve(root,'dist'),{recursive:true});
  await writeFile(resolve(root,'dist/openreturn-offline.html'),html);
  await writeFile(resolve(root,'dist/offline-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify(manifest,null,2));
}
