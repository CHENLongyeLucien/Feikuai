import { randomUUID,createHash } from 'node:crypto';
import { mkdir, open, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { fail } from '../domain/errors.js';
export type PageText={page:number;text:string};
export const hash=(bytes:Uint8Array|string)=>'0x'+createHash('sha256').update(bytes).digest('hex');
export async function storeArtifact(root:string,bytes:Uint8Array){
 await mkdir(root,{recursive:true,mode:0o700});const id=randomUUID();const final=resolve(root,id+'.blob');const temp=final+'.tmp';const fd=await open(temp,'wx',0o600);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}await rename(temp,final);const dir=await open(root,'r');try{await dir.sync();}finally{await dir.close();}return {path:final,sha256:hash(bytes),size:bytes.length};
}
export function sanitizeFilename(name:string){return name.replace(/[^\p{L}\p{N}_. -]/gu,'_').slice(0,180)||'invoice';}
export async function extract(bytes:Uint8Array,mime:string):Promise<{pages:PageText[];algorithm:string}>{
 mime=mime.split(';')[0]!.trim().toLowerCase();
 if(bytes.length>10*1024*1024)fail('UPLOAD_TOO_LARGE','Invoice exceeds 10 MiB.');
 const head=Buffer.from(bytes.slice(0,5)).toString();
 if(mime==='text/plain'){
  if(head==='%PDF-'||bytes.includes(0))fail('MIME_MISMATCH','Expected a plain UTF-8 text invoice.');
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('INVALID_TEXT','Invoice is not valid UTF-8.');}
  if(text!.length>40000)fail('EXTRACTED_INPUT_TOO_LARGE','Complete invoice exceeds 40,000 characters; nothing was silently truncated.');if(!text!.trim())fail('EMPTY_DOCUMENT','Invoice has no text.');return {pages:[{page:1,text:text!}],algorithm:'utf8-fatal-v1'};
 }
 if(mime!=='application/pdf'||head!=='%PDF-')fail('UNSUPPORTED_DOCUMENT','Only plain text and text-based PDF invoices are supported.');
 const workerSource=`const {parentPort,workerData}=require('node:worker_threads'); (async()=>{const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(workerData),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0});const doc=await loading.promise;if(doc.numPages>20)throw new Error('PDF exceeds 20 pages');const pages=[];for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p);const c=await page.getTextContent();pages.push({page:p,text:c.items.map(i=>(i.str||'')+(i.hasEOL?'\\n':' ')).join('').trimEnd()});}await loading.destroy();parentPort.postMessage({pages});})().catch(e=>parentPort.postMessage({error:e.name==='PasswordException'?'Encrypted PDFs are unsupported':e.message}));`;
 const pages=await new Promise<PageText[]>((resolvePromise,reject)=>{const w=new Worker(workerSource,{eval:true,workerData:bytes,resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32}});const timer=setTimeout(()=>{void w.terminate();reject(new Error('PDF extraction exceeded 15 seconds'));},15000);w.once('message',r=>{clearTimeout(timer);void w.terminate();if(r.error)reject(new Error(r.error));else resolvePromise(r.pages);});w.once('error',e=>{clearTimeout(timer);reject(e);});}).catch(e=>fail('UNSUPPORTED_PDF',String(e.message)));
 const full=pages.map(p=>p.text).join('\n');if(full.length>40000)fail('EXTRACTED_INPUT_TOO_LARGE','Complete extracted PDF exceeds 40,000 characters.');if(!full.trim())fail('SCANNED_PDF_UNSUPPORTED','PDF has no selectable text; provide a text-based invoice.');return {pages,algorithm:'pdfjs-bounded-worker-v2'};
}

/** Bounded cleanup of app-created, unreferenced crash leftovers; never follows symlinks. */
export async function sweepOrphanArtifacts(root:string,referenced:Set<string>,now=Date.now()):Promise<number>{
 const {readdir,lstat,unlink}=await import('node:fs/promises');let removed=0,inspected=0;let names:string[];try{names=await readdir(root);}catch{return 0;}
 for(const name of names.sort()){if(inspected>=100)break;if(!/^[0-9a-f-]{36}\.blob(?:\.tmp)?$/.test(name))continue;inspected++;const path=resolve(root,name);if(referenced.has(path))continue;const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||now-stat.mtimeMs<60*60*1000)continue;await unlink(path);removed++;}return removed;
}
