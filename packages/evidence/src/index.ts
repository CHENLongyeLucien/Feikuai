import canonicalize from 'canonicalize';
import { z } from 'zod';
import { zipSync, Unzip, UnzipInflate } from 'fflate';
import { hashTypedData, recoverTypedDataAddress } from 'viem';
import { domainSchema, hex32Schema, paymentSchema, positiveUintSchema, signatureFileSchema, uint256Schema, type Hex32 } from '@secure-finance/shared';
import { paymentTypedData } from '@secure-finance/chain';

export const MAX_PACKET_BYTES=32*1024*1024;
const MAX_ARTIFACTS=128;
const utf8=new TextEncoder();
export function canonicalBytes(value:unknown):Uint8Array { const result=canonicalize(value); if(result===undefined)throw new Error('Not JSON'); return utf8.encode(result); }
export async function sha256(bytes:Uint8Array):Promise<Hex32> {const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)); return `0x${Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')}`;}
export const safePathSchema=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine(p=>!p.split('/').some(s=>s==='..'||s==='.'||s===''),'Unsafe relative path');
const artifactSchema=z.object({path:safePathSchema,kind:z.enum(['SOURCE','EXTRACTION','REGISTRY','AGENT','TOOL','CHECKS']),mediaType:z.string().min(1).max(100),sizeBytes:uint256Schema,sha256:hex32Schema}).strict();
export const manifestSchema=z.object({schemaVersion:z.literal('secure-finance.evidence.v1'),caseId:z.string().uuid(),proposalId:z.string().uuid(),proposalVersion:positiveUintSchema,caseSalt:hex32Schema,domain:domainSchema,payment:paymentSchema.omit({evidenceCommitment:true}),deployment:z.object({runtimeCodeHash:hex32Schema,registryHash:hex32Schema,deploymentBlock:uint256Schema}).strict(),recordVersions:z.object({payableId:z.string().min(1).max(200),payableVersion:positiveUintSchema,supplierId:z.string().min(1).max(200),supplierVersion:positiveUintSchema,documentVersion:positiveUintSchema}).strict(),artifacts:z.array(artifactSchema).min(1).max(MAX_ARTIFACTS)}).strict().superRefine((m,ctx)=>{const paths=m.artifacts.map(a=>a.path);if(new Set(paths).size!==paths.length)ctx.addIssue({code:'custom',message:'Duplicate inventory path'});if(paths.some((p,i)=>i>0&&p<=paths[i-1]!))ctx.addIssue({code:'custom',message:'Inventory must be sorted by ASCII bytes'});});
export type FrozenManifest=z.infer<typeof manifestSchema>;
export const approvalRequestSchema=z.object({schemaVersion:z.literal('secure-finance.approval-request.v1'),manifest:manifestSchema,payment:paymentSchema,typedDigest:hex32Schema,artifacts:z.array(z.object({path:safePathSchema,bytesBase64:z.string().max(MAX_PACKET_BYTES)}).strict()).max(MAX_ARTIFACTS)}).strict();
export type ApprovalRequestFile=z.infer<typeof approvalRequestSchema>;
export type ArtifactBytes={path:string;bytesBase64:string};
export type DeploymentPin={chainId:string|number;vault:string;token:string;approver:string;policyId:string;runtimeCodeHash:string;registryHash:string;deploymentBlock?:string;registry?:Array<{supplierKey:string;recipient:string}>};
export function encodeBase64(bytes:Uint8Array):string {let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);}
export function decodeBase64(text:string):Uint8Array {if(text.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))throw new Error('Invalid canonical base64');const binary=atob(text);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(encodeBase64(bytes)!==text)throw new Error('Noncanonical base64');return bytes;}
export async function buildApprovalRequest(manifest:FrozenManifest,artifacts:ArtifactBytes[]):Promise<ApprovalRequestFile>{const validated=manifestSchema.parse(manifest);const payment=paymentSchema.parse({...validated.payment,evidenceCommitment:await sha256(canonicalBytes(validated))});const packet=approvalRequestSchema.parse({schemaVersion:'secure-finance.approval-request.v1',manifest:validated,payment,typedDigest:hashTypedData(paymentTypedData(validated.domain,payment)),artifacts});const result=await verifyApprovalRequest(packet);if(!result.integrityValid)throw new Error(result.errors.join('; '));return packet;}
export async function verifyApprovalRequest(input:unknown,pin?:DeploymentPin){
  const errors:string[]=[];let packet:ApprovalRequestFile|undefined;const coverage={included:[] as string[],missing:[] as string[],redacted:[] as string[],unsupported:[] as string[]};
  try {
    if(utf8.encode(JSON.stringify(input)).byteLength>MAX_PACKET_BYTES)throw new Error('Packet exceeds 32 MiB');
    packet=approvalRequestSchema.parse(input);
    const commitment=await sha256(canonicalBytes(packet.manifest));
    const expected=paymentSchema.parse({...packet.manifest.payment,evidenceCommitment:commitment});
    if(canonicalize(packet.payment)!==canonicalize(expected))errors.push('PAYMENT_MANIFEST_MISMATCH');
    if(hashTypedData(paymentTypedData(packet.manifest.domain,expected))!==packet.typedDigest)errors.push('TYPED_DIGEST_MISMATCH');
    const map=new Map<string,Uint8Array>();let total=0;
    for(const artifact of packet.artifacts){if(map.has(artifact.path))throw new Error('DUPLICATE_ARTIFACT');const bytes=decodeBase64(artifact.bytesBase64);total+=bytes.byteLength;if(total>24*1024*1024)throw new Error('Decoded artifact limit');map.set(artifact.path,bytes);}
    const inventory=new Set(packet.manifest.artifacts.map(a=>a.path));
    for(const path of map.keys())if(!inventory.has(path))errors.push(`UNINVENTORIED_ARTIFACT:${path}`);
    for(const entry of packet.manifest.artifacts){const bytes=map.get(entry.path);if(!bytes){coverage.missing.push(entry.path);errors.push(`MISSING_ARTIFACT:${entry.path}`);continue;}coverage.included.push(entry.path);if(BigInt(entry.sizeBytes)!==BigInt(bytes.byteLength)||await sha256(bytes)!==entry.sha256)errors.push(`ARTIFACT_HASH_MISMATCH:${entry.path}`);}
    if(pin){const m=packet.manifest,p=packet.payment; if(String(pin.chainId)!==m.domain.chainId||pin.vault.toLowerCase()!==m.domain.verifyingContract||pin.token.toLowerCase()!==p.token||pin.policyId!==p.policyId||pin.runtimeCodeHash!==m.deployment.runtimeCodeHash||pin.registryHash!==m.deployment.registryHash||(pin.deploymentBlock!==undefined&&pin.deploymentBlock!==m.deployment.deploymentBlock))errors.push('WRONG_DEPLOYMENT');if(pin.registry&&!pin.registry.some(r=>r.supplierKey===p.supplierKey&&r.recipient.toLowerCase()===p.recipient))errors.push('WRONG_REGISTRY_RECIPIENT');}
  }catch(error){errors.push(error instanceof Error?error.message:'Invalid packet');}
  return {integrityValid:errors.length===0,errors,typedDigest:packet?.typedDigest,payment:packet?.payment,manifest:packet?.manifest,packet,coverage};
}
export type ExportExtras={signature?:unknown;deployment?:unknown;attempts?:unknown;receipts?:unknown;verification?:unknown;[key:string]:unknown};
export async function exportBundle(packet:ApprovalRequestFile,extras:ExportExtras={}):Promise<Uint8Array>{
  const check=await verifyApprovalRequest(packet);if(!check.integrityValid)throw new Error('Cannot export invalid approval packet');
  const files:Record<string,Uint8Array>={'manifest.json':canonicalBytes(packet.manifest),'payment.json':canonicalBytes(packet.payment),'request.json':canonicalBytes(packet)};
  for(const a of packet.artifacts)files[`artifacts/${a.path}`]=decodeBase64(a.bytesBase64);
  for(const name of ['signature','deployment','attempts','receipts','verification'])if(extras[name]!==undefined)files[`${name}.json`]=canonicalBytes(extras[name]);
  const inventory=await Promise.all(Object.keys(files).sort().map(async path=>({path,sizeBytes:String(files[path]!.byteLength),sha256:await sha256(files[path]!)})));
  files['export-index.json']=canonicalBytes({schemaVersion:'secure-finance.export.v1',files:inventory,coverage:'Only manifest artifacts are bound by the payment signature. Later export checksums are not signatures.'});
  return zipSync(files,{level:6});
}
function validateZipDirectory(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('ZIP end record missing');
 if(view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)throw new Error('Multidisk archive unsupported');
 if(view.getUint16(end+8,true)!==view.getUint16(end+10,true))throw new Error('ZIP entry count mismatch');
 if(end>=20&&view.getUint32(end-20,true)===0x07064b50)throw new Error('ZIP64 unsupported');
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
 if(count>MAX_ARTIFACTS+16||count===65535||size===0xffffffff||start+size>end)throw new Error('Archive directory limit');
 let offset=start,total=0;const entries=new Map<string,{size:number;method:number}>();
 for(let i=0;i<count;i++){
  if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw new Error('Invalid ZIP directory');
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),original=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),attributes=view.getUint32(offset+38,true);
  if(view.getUint16(offset+34,true)!==0||flags&1||![0,8].includes(method)||((attributes>>>16)&0o170000)===0o120000)throw new Error('Encrypted, symlink or unsupported archive entry');
  const path=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset+46,offset+46+nameLength));safePathSchema.parse(path);
  if(entries.has(path))throw new Error('Duplicate archive entry');entries.set(path,{size:original,method});total+=original;
  if(original>MAX_PACKET_BYTES||total>96*1024*1024)throw new Error('Archive decoded size limit');
  offset+=46+nameLength+extra+comment;
 }
 if(offset!==start+size)throw new Error('ZIP directory size mismatch');return entries;
}
export function readBundle(bytes:Uint8Array):Record<string,Uint8Array>{
 if(bytes.byteLength>MAX_PACKET_BYTES*2)throw new Error('Archive limit');const directory=validateZipDirectory(bytes);
 const paths=new Set<string>(),files:Record<string,Uint8Array>={};let total=0,completed=0;
 const unzip=new Unzip(file=>{
  safePathSchema.parse(file.name);if(paths.has(file.name)||paths.size>=MAX_ARTIFACTS+16)throw new Error('Duplicate/excess archive entries');paths.add(file.name);
  const expected=directory.get(file.name);if(!expected||file.compression!==expected.method||(file.originalSize!==undefined&&file.originalSize!==expected.size))throw new Error('Local entry differs from ZIP directory');
  if(file.originalSize!==undefined&&file.originalSize>MAX_PACKET_BYTES)throw new Error('Entry too large');
  const chunks:Uint8Array[]=[];let size=0;
  file.ondata=(error,data,final)=>{if(error)throw error;size+=data.length;total+=data.length;
   if(size>MAX_PACKET_BYTES||total>96*1024*1024||size>expected.size){file.terminate();throw new Error('Actual decoded archive size exceeds bounds');}
   chunks.push(data);if(final){if(size!==expected.size)throw new Error('Archive entry size mismatch');const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}files[file.name]=joined;completed++;}
  };file.start();
 });unzip.register(UnzipInflate);
 for(let offset=0;offset<bytes.length;offset+=4096)unzip.push(bytes.subarray(offset,offset+4096),offset+4096>=bytes.length);
 if(completed!==paths.size||completed!==directory.size)throw new Error('Truncated archive or directory entry missing');return files;
}

export async function verifyBundle(bytes:Uint8Array,pin?:DeploymentPin){
  try{const files=readBundle(bytes);const parse=(name:string)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(files[name]??new Uint8Array()));const packet=approvalRequestSchema.parse(parse('request.json'));const result=await verifyApprovalRequest(packet,pin);const errors=[...result.errors];
    if(!files['manifest.json']||canonicalize(parse('manifest.json'))!==canonicalize(packet.manifest))errors.push('MANIFEST_COPY_MISMATCH');
    if(!files['payment.json']||canonicalize(parse('payment.json'))!==canonicalize(packet.payment))errors.push('PAYMENT_COPY_MISMATCH');
    for(const a of packet.manifest.artifacts){const b=files[`artifacts/${a.path}`];if(!b||await sha256(b)!==a.sha256)errors.push(`ARCHIVE_ARTIFACT_MISMATCH:${a.path}`);}
    const idx=z.object({schemaVersion:z.literal('secure-finance.export.v1'),files:z.array(z.object({path:safePathSchema,sizeBytes:uint256Schema,sha256:hex32Schema}).strict()).max(MAX_ARTIFACTS+12),coverage:z.string()}).strict().parse(parse('export-index.json'));
    const paths=new Set<string>();for(const e of idx.files){if(paths.has(e.path))errors.push('DUPLICATE_EXPORT_INDEX');paths.add(e.path);const b=files[e.path];if(!b||String(b.byteLength)!==e.sizeBytes||await sha256(b)!==e.sha256)errors.push(`EXPORT_CHECKSUM_MISMATCH:${e.path}`);}for(const path of Object.keys(files))if(path!=='export-index.json'&&!paths.has(path))errors.push(`UNINDEXED_FILE:${path}`);
    let signatureCorrespondence:'VALID'|'INVALID'|'MISSING'='MISSING',signerEligibility:'VERIFIED_CONFIGURATION'|'UNVERIFIED_CONFIGURATION'|'INVALID'='UNVERIFIED_CONFIGURATION';
    if(files['signature.json']){try{const sig=signatureFileSchema.parse(parse('signature.json'));const signer=(await recoverTypedDataAddress({...paymentTypedData(packet.manifest.domain,packet.payment),signature:sig.signature as `0x${string}`})).toLowerCase();signatureCorrespondence=sig.typedDigest===packet.typedDigest&&sig.proposalId===packet.manifest.proposalId&&signer===sig.signer?'VALID':'INVALID';if(pin)signerEligibility=signer===pin.approver.toLowerCase()&&result.integrityValid?'VERIFIED_CONFIGURATION':'INVALID';}catch{signatureCorrespondence='INVALID';}}
    return {artifactIntegrity:errors.length===0?'VALID':result.coverage.missing.length?'INCOMPLETE':'INVALID',signatureCorrespondence,signerEligibility,settlement:'UNVERIFIED_OFFLINE',businessFacts:'APPLICATION_REPORTED',coverage:result.coverage,errors,packet,limitations:['Offline receipt JSON is not a consensus proof.','Eligibility requires independently trusted deployment pins.','Business facts are application-reported.']};
  }catch(error){return {artifactIntegrity:'INVALID',signatureCorrespondence:'MISSING',signerEligibility:'UNVERIFIED_CONFIGURATION',settlement:'UNVERIFIED_OFFLINE',businessFacts:'APPLICATION_REPORTED',errors:[error instanceof Error?error.message:'Invalid bundle'],coverage:{included:[],missing:[],redacted:[],unsupported:[]},packet:undefined,limitations:['Bundle could not be parsed safely.']};}
}
