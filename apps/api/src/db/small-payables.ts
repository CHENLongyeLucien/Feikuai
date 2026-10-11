import {createHash,randomUUID} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,renameSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import Database from 'better-sqlite3';
import {z} from 'zod';
import {keccak256,toHex} from 'viem';
import {deploymentSchema,type Deployment} from '@secure-finance/chain';
import {addressSchema,hex32Schema,positiveUintSchema} from '@secure-finance/shared';

export const SMALL_TEST_AMOUNT_ATOMIC='10000000';
export const SMALL_TEST_COUNT=20;
const supplierSchema=z.object({id:z.string().uuid(),supplierKey:hex32Schema,recipient:addressSchema,name:z.string().min(1),version:z.string().min(1)}).passthrough();
const payableSchema=z.object({id:z.string().uuid(),invoiceKey:hex32Schema,invoiceReference:z.string().min(1),canonicalPayableId:z.string().min(1),supplierId:z.string().uuid(),supplierKey:hex32Schema,supplierName:z.string(),recipient:addressSchema,amountAtomic:positiveUintSchema,token:addressSchema,version:z.string().min(1),scenarioId:z.string().min(1)}).passthrough();
const registrySchema=z.object({schemaVersion:z.literal('secure-finance.registry.v1'),tenantId:z.string().min(1),chainId:z.enum(['31337','43113']),vault:addressSchema,token:addressSchema,suppliers:z.array(supplierSchema).min(1),payables:z.array(payableSchema)}).passthrough();
type Registry=z.infer<typeof registrySchema>;
type Payable=z.infer<typeof payableSchema>;
const primaryKey=keccak256(toHex('northstar-supplier-1'));
const fail=(code:string):never=>{throw new Error(code);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Stable UUIDv5 names are scoped to this environment, never existing invoices. */
function uuidFor(name:string){const bytes=createHash('sha1').update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8','hex')).update(name).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|80;bytes[8]=(bytes[8]!&63)|128;const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function checkedRegistry(value:unknown,deployment:Deployment):Registry{
 const r=registrySchema.parse(value);
 if(r.chainId!==deployment.chainId||r.vault!==deployment.vault||r.token!==deployment.token)fail('REGISTRY_DEPLOYMENT_MISMATCH');
 if(BigInt(deployment.maxPerPaymentAtomic)<BigInt(SMALL_TEST_AMOUNT_ATOMIC))fail('TEN_DEMO_EXCEEDS_PAYMENT_POLICY');
 for(const s of r.suppliers)if(!deployment.registry.some(entry=>entry.supplierKey===s.supplierKey&&entry.recipient===s.recipient))fail('SUPPLIER_DEPLOYMENT_MISMATCH');
 for(const field of ['id','invoiceKey','invoiceReference','canonicalPayableId','scenarioId'] as const)if(new Set(r.payables.map(p=>p[field])).size!==r.payables.length)fail(`DUPLICATE_REGISTRY_${field.toUpperCase()}`);
 for(const p of r.payables){const s=r.suppliers.find(candidate=>candidate.id===p.supplierId);if(!s||p.token!==r.token||p.supplierKey!==s.supplierKey||p.recipient!==s.recipient||p.supplierName!==s.name)fail('PAYABLE_SUPPLIER_MISMATCH');}
 return r;
}
/** count > 20 appends further test invoices (NS-TEST10-0021…); identities are deterministic, so existing rows never change. */
export function smallPayablesFor(registry:unknown,deployment:Deployment,count=SMALL_TEST_COUNT):Payable[]{
 const r=checkedRegistry(registry,deployment),supplier=r.suppliers.find(s=>s.supplierKey===primaryKey)??fail('ATLAS_SUPPLIER_REQUIRED');
 if(!Number.isInteger(count)||count<1||count>200)fail('SMALL_PAYABLE_COUNT_INVALID');
 return Array.from({length:count},(_,index)=>{
  const number=String(index+1).padStart(4,'0'),invoiceReference=`NS-TEST10-${number}`,scope=`secure-finance.small-payable.v1:${r.chainId}:${r.vault}:${r.tenantId}:${invoiceReference}`;
  return {id:uuidFor(scope),invoiceKey:keccak256(toHex(scope)),invoiceReference,canonicalPayableId:`AP-TEST10-${number}`,supplierId:supplier.id,supplierKey:supplier.supplierKey,supplierName:supplier.name,recipient:supplier.recipient,amountAtomic:SMALL_TEST_AMOUNT_ATOMIC,token:r.token,version:'1',scenarioId:`SMALL-10-${String(index+1).padStart(2,'0')}`};
 });
}
function additions(r:Registry,expected:Payable[]){return expected.filter(p=>{const collisions=r.payables.filter(old=>['id','invoiceKey','invoiceReference','canonicalPayableId','scenarioId'].some(field=>old[field]===p[field]));if(!collisions.length)return true;if(collisions.length!==1||!Object.keys(p).every(field=>same(collisions[0]![field],p[field])))fail(`EXISTING_SMALL_PAYABLE_CONFLICT:${p.invoiceReference}`);return false;});}
function expectedRow(p:Payable,tenant:string){return {id:p.id,tenant_id:tenant,source_system:'ap-fixture',canonical_payable_id:p.canonicalPayableId,invoice_key:p.invoiceKey,supplier_id:p.supplierId,invoice_reference:p.invoiceReference,amount_atomic:p.amountAtomic,token:p.token,version:p.version,scenario_id:p.scenarioId};}
function inspectDatabase(db:Database.Database,r:Registry,expected:Payable[]){
 if(!db.prepare('SELECT id FROM tenants WHERE id=?').get(r.tenantId))fail('DATABASE_TENANT_NOT_INITIALIZED');
 for(const supplier of r.suppliers){const row=db.prepare('SELECT * FROM supplier_versions WHERE id=? AND tenant_id=?').get(supplier.id,r.tenantId) as any;if(!row||row.supplier_key!==supplier.supplierKey||row.recipient!==supplier.recipient||row.version!==supplier.version||JSON.parse(row.snapshot).name!==supplier.name)fail('DATABASE_SUPPLIER_MISMATCH');}
 // Check all collisions, including older registered invoices. Never repair them
 // with UPDATE/REPLACE or silently repurpose an existing invoice identity.
 for(const p of [...r.payables,...expected]){
  const rows=db.prepare('SELECT * FROM payables WHERE id=? OR (tenant_id=? AND (invoice_key=? OR invoice_reference=? OR (source_system=? AND canonical_payable_id=?)))').all(p.id,r.tenantId,p.invoiceKey,p.invoiceReference,'ap-fixture',p.canonicalPayableId) as any[];
  const wanted=expectedRow(p,r.tenantId);
  if(rows.some(row=>!Object.keys(wanted).every(key=>row[key]===wanted[key as keyof typeof wanted]))||rows.length>1)fail(`DATABASE_PAYABLE_CONFLICT:${p.invoiceReference}`);
 }
 return expected.filter(p=>!db.prepare('SELECT id FROM payables WHERE id=?').get(p.id));
}
function atomicRegistryWrite(path:string,original:Buffer,registry:Registry){
 if(!readFileSync(path).equals(original))fail('REGISTRY_CHANGED_DURING_PREPARATION');
 const temporary=`${path}.${randomUUID()}.tmp`,fd=openSync(temporary,'wx',statSync(path).mode&0o777);
 try{writeFileSync(fd,JSON.stringify(registry,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 try{renameSync(temporary,path);const directory=openSync(dirname(path),'r');try{fsyncSync(directory);}finally{closeSync(directory);}}finally{if(existsSync(temporary))unlinkSync(temporary);}
}
export function smallPayableSource(p:Payable){return `NORTHSTAR LABS — SYNTHETIC TEST INVOICE\nSupplier: ${p.supplierName}\nInvoice reference: ${p.invoiceReference}\nSupplier reference: ${p.supplierKey}\nInvoice date: 2026-10-11\nAmount: 10.00 DEMO\nService: Small-value platform engineering test services.\nTerms: Synthetic demonstration data. DEMO has no monetary value.\n`;}
export type SmallPayablePreparation={count?:number;registryPath:string;deploymentPath:string;databasePath?:string;sourcesDir?:string;backupDir?:string;apply?:boolean};
type PreparationResult={mode:string;chainId:string;tenantId:string;amountAtomic:string;amountDisplay:string;total:number;registryRowsAdded:number;databaseRowsAdded:number;databaseIncluded:boolean;sourceFilesAdded:number;references:string[];historicalRowsChanged:number;onchainActions:number;backups:{registry:string;database?:string}|null};
/** No config/env loading, RPC, signing, worker startup, migrations or payments. */
export function prepareSmallPayables(options:SmallPayablePreparation):PreparationResult{
 const registryPath=resolve(options.registryPath),deployment=deploymentSchema.parse(JSON.parse(readFileSync(options.deploymentPath,'utf8')));
 let lockFd:number|undefined,db:Database.Database|undefined;
 const lockPath=registryPath+'.small-payables.lock';
 try{
  if(options.apply){try{lockFd=openSync(lockPath,'wx',0o600);writeFileSync(lockFd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})+'\n');}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')fail('PREPARATION_LOCKED: verify the other preparation finished before removing its lock file');throw error;}}
  if(options.databasePath){db=new Database(resolve(options.databasePath),{readonly:!options.apply,fileMustExist:true});db.pragma('busy_timeout = 5000');if(options.apply)db.pragma('foreign_keys = ON');}
  const run=()=>{
   const original=readFileSync(registryPath),raw=JSON.parse(original.toString('utf8')),r=checkedRegistry(raw,deployment),expected=smallPayablesFor(r,deployment,options.count),newRegistryRows=additions(r,expected),newDatabaseRows=db?inspectDatabase(db,r,expected):[];
   const sourceFiles=options.sourcesDir?expected.map(p=>({path:resolve(options.sourcesDir!,p.invoiceReference+'.txt'),text:smallPayableSource(p)})):[];
   for(const source of sourceFiles)if(existsSync(source.path)&&readFileSync(source.path,'utf8')!==source.text)fail('SOURCE_FILE_CONFLICT: existing source would be changed');
   const newSources=sourceFiles.filter(source=>!existsSync(source.path));
   if(options.apply){
    // Commit the append-only registry first. A crash before SQLite commit leaves
    // a recoverable registry-ahead state; the next apply inserts the same IDs.
    if(newRegistryRows.length)atomicRegistryWrite(registryPath,original,{...raw,payables:[...raw.payables,...newRegistryRows]});
    if(db)for(const p of newDatabaseRows)db.prepare('INSERT INTO payables(id,tenant_id,source_system,canonical_payable_id,invoice_key,supplier_id,invoice_reference,amount_atomic,token,version,scenario_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(expectedRow(p,r.tenantId)));
    if(newSources.length){mkdirSync(resolve(options.sourcesDir!),{recursive:true,mode:0o700});for(const source of newSources)writeFileSync(source.path,source.text,{flag:'wx',mode:0o600});}
   }
   return {mode:options.apply?'APPLIED':'DRY_RUN',chainId:r.chainId,tenantId:r.tenantId,amountAtomic:SMALL_TEST_AMOUNT_ATOMIC,amountDisplay:'10.00 DEMO',total:options.count??SMALL_TEST_COUNT,registryRowsAdded:newRegistryRows.length,databaseRowsAdded:newDatabaseRows.length,databaseIncluded:!!db,sourceFilesAdded:newSources.length,references:expected.map(p=>p.invoiceReference),historicalRowsChanged:0,onchainActions:0};
  };
  const preview=options.apply?prepareSmallPayables({...options,apply:false}):null;
  let backups:{registry:string;database?:string}|null=null;
  if(options.apply&&preview&&(preview.registryRowsAdded||preview.databaseRowsAdded)){
   const backupDir=resolve(options.backupDir??'var/backups/small-payables');mkdirSync(backupDir,{recursive:true,mode:0o700});
   const prefix=`${deployment.environment}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`;
   backups={registry:join(backupDir,prefix+'-registry.json')};writeFileSync(backups.registry,readFileSync(registryPath),{flag:'wx',mode:0o600});
   if(db){backups.database=join(backupDir,prefix+'-database.sqlite');const fd=openSync(backups.database,'wx',0o600);closeSync(fd);db.prepare('VACUUM INTO ?').run(backups.database);}
  }
  const result=options.apply&&db?db.transaction(run).immediate():run();
  return {...result,backups};
 }finally{db?.close();if(lockFd!==undefined){closeSync(lockFd);unlinkSync(lockPath);}}
}
