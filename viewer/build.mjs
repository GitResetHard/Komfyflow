import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {nativePlugin,nativeRoot} from './resolve.mjs';
const root = path.dirname(new URL(import.meta.url).pathname);
const source = path.join(root, 'vendor/litegraph/src');
const out = path.join(root, '../public/viewer');
const hashes = {};
async function audit(dir) {
 for (const e of await readdir(dir, {withFileTypes:true})) {
  const f=path.join(dir,e.name); if(e.isDirectory()){await audit(f);continue;}
  const text=await readFile(f); hashes[path.relative(root,f)]=createHash('sha256').update(text).digest('hex');
  if(!f.endsWith('.ts'))continue;

 }
}
await audit(source);
const result=await build({entryPoints:[path.join(root,'main.ts')],bundle:true,write:false,format:'iife',target:'es2022',define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true','process.env.NODE_ENV':'"production"'},minify:true,plugins:[nativePlugin()],metafile:true});
for(const f of Object.keys(result.metafile.inputs)) {
 const full=path.resolve(f);
 if(full.includes('/node_modules/'))continue;
 if(full.startsWith(source+'/')||full.startsWith(path.join(root,'adapters')+'/')||[path.join(root,'main.ts'),path.join(root,'sanitize.mjs')].includes(full))continue;
 throw Error('Unaudited input outside native/adapter boundary: '+f);
}
const require=createRequire(import.meta.url);
let notices='Native ComfyUI LiteGraph: https://github.com/Comfy-Org/ComfyUI_frontend/tree/a8e134a988495b2e22979458b41f561083cb5d5b/src/lib/litegraph\n\n'+await readFile(path.join(root,'vendor/litegraph/LICENSE'),'utf8');
const dependencyVersions={};
for(const pkg of ['vue','@vue/shared','@vue/reactivity','@vue/runtime-core','@vue/runtime-dom','es-toolkit','dompurify']){
 let dir;try{dir=path.dirname(require.resolve(pkg+'/package.json'));}catch{dir=path.dirname(require.resolve(pkg));while(true){try{const p=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));if(p.name===pkg)break;}catch{}const parent=path.dirname(dir);if(parent===dir)throw Error('Cannot locate package '+pkg);dir=parent;}}const meta=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));dependencyVersions[pkg]={version:meta.version,license:meta.license};
 let license='';for(const name of ['LICENSE','LICENSE.txt','LICENSE.md']){try{license=await readFile(path.join(dir,name),'utf8');break;}catch{}}
 if(!license)throw Error('Missing license notice for '+pkg);notices+='\n\n--- '+pkg+' '+meta.version+' ---\n'+license;
}
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const css='html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#151719;color:#eee;font:12px system-ui}canvas{display:block;width:100%;height:100%}#status{position:absolute;left:12px;bottom:10px;pointer-events:none;background:#151719d9;padding:5px 8px;border-radius:4px;color:#a6abb3}';
const hash=s=>"'sha256-"+createHash('sha256').update(s).digest('base64')+"'";
const csp=`default-src 'none'; script-src ${hash(js)}; style-src ${hash(css)}; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><title>Komfyflow native workflow viewer</title><style>${css}</style></head><body><canvas id="graph"></canvas><div id="status">Loading native ComfyUI graph…</div><script>${js}</script></body></html>`);
await writeFile(path.join(root,'vendor-manifest.json'),JSON.stringify({repository:'https://github.com/Comfy-Org/ComfyUI_frontend',commit:'a8e134a988495b2e22979458b41f561083cb5d5b',subtree:'src/lib/litegraph',license:'MIT',patches:[],hostAdapters:'Original Komfyflow implementations under viewer/adapters',dependencyVersions,hashes},null,2));
await writeFile(path.join(out,'LICENSE.txt'),await readFile(path.join(root,'vendor/litegraph/LICENSE')));
await writeFile(path.join(out,'THIRD_PARTY_NOTICES.txt'),notices);
console.log('Built audited native viewer:',Object.keys(result.metafile.inputs).length,'input files; CSP SHA-256 protected; self-contained runtime bundle.');
