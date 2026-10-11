/**
 * Runs every manual-test file through the real intake, workers, agents, checks and audit
 * against a temporary copy of the Fuji database. The live database is only read (backup API).
 * Usage: tsx scripts/manual-tests/validate.ts
 */
import Database from 'better-sqlite3';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildApp} from '../../apps/api/src/app.js';
import {envSchema} from '../../apps/api/src/config.js';
import {DomainError} from '../../apps/api/src/domain/errors.js';
import {tests} from './generate.js';

const root=resolve('fixtures/manual-tests'),dir=await mkdtemp(join(tmpdir(),'feikuai-manual-'));
const source=new Database(resolve('var/fuji/secure-finance.sqlite'),{readonly:true});await source.backup(join(dir,'fuji.sqlite'));source.close();
const deployment=JSON.parse(await readFile('deployments/fuji.json','utf8'));deployment.rpcUrl='http://127.0.0.1:9';await writeFile(join(dir,'deployment.json'),JSON.stringify(deployment));
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('NETWORK_DISABLED_IN_VALIDATION');};
const config=envSchema.parse({NODE_ENV:'test',APP_ENV:'fuji',CHAIN_ID:'43113',RPC_URL:deployment.rpcUrl,DATABASE_PATH:join(dir,'fuji.sqlite'),ARTIFACT_ROOT:join(dir,'artifacts'),DEPLOYMENT_MANIFEST_PATH:join(dir,'deployment.json'),TRUSTED_REGISTRY_PATH:resolve('fixtures/trusted-registry.fuji.json'),AGENT_MODE:'fixture',OPENAI_API_KEY:'',OPENAI_MODEL:'',SESSION_SECRET:'manual-test-validation-only-not-a-runtime-secret',RELAYER_PRIVATE_KEY:'',AUTOMATION_MANIFEST_PATH:'',AUTOMATION_EXECUTOR_PRIVATE_KEY:'',INBOX_WEBHOOK_SECRET:'',SEED_ON_START:'false',ENABLE_DEMO_ROUTES:'false',ENABLE_MAINNET:'false',WEB_ORIGIN:'http://localhost:5173'});
const system=await buildApp({config,worker:false});
system.chain.scan=async()=>{};system.chain.submit=async()=>{throw new Error('PAYMENT_FORBIDDEN');};system.chain.reconcile=async()=>{throw new Error('PAYMENT_FORBIDDEN');};
const tenantId=(system.db.prepare('SELECT tenant_id FROM payables LIMIT 1').get() as {tenant_id:string}).tenant_id;
const user={tenantId,membershipId:'manual-validation',address:'manual-validation',roles:['operator','reviewer'],csrfToken:''};
const rows:Array<{id:string;expected:string;observed:string;reason:string;ok:boolean}>=[],ids=new Map<string,string>();
// Invoices already paid on the live platform correctly become "already paid"; expect that instead.
const paid=new Set((system.db.prepare('SELECT p.invoice_reference r FROM settlements s JOIN payables p ON p.invoice_key=s.invoice_key AND p.tenant_id=s.tenant_id').all() as {r:string}[]).map(x=>x.r));
const invoiceOf=(file:string)=>{const m=/-(\d{4})\.(?:pdf|eml)$/.exec(file);return m?`NS-TEST10-${m[1]}`:null;};
const expected=(test:typeof tests[number])=>{const ref=invoiceOf(test.file);return ref&&paid.has(ref)&&test.expect==='Approved'?'Needs review':test.expect;};
for(const test of tests){
 const bytes=await readFile(join(root,test.file));
 try{
  const file=test.kind==='txt'?undefined:{bytes:new Uint8Array(bytes),filename:test.file.split('/').at(-1)!,mimeType:test.kind==='eml'?'message/rfc822':'application/pdf'};
  const item=await system.inbox.service.create(user,{channel:test.channel,...(file?{}:{text:bytes.toString('utf8').trim()})},`manual:${test.id}`,file);ids.set(test.id,item.id);
 }catch(error){rows.push({id:test.id,expected:test.expect,observed:'Rejected at upload',reason:error instanceof DomainError?`${error.code}: ${error.message}`:String(error),ok:test.expect==='Rejected at upload'});}
}
const pending=()=>(system.db.prepare("SELECT COUNT(*) n FROM inbox_jobs WHERE status IN ('QUEUED','RUNNING','WAITING')").get() as {n:number}).n+(system.db.prepare("SELECT COUNT(*) n FROM jobs WHERE status IN ('QUEUED','RUNNING') AND kind='ANALYZE'").get() as {n:number}).n;
for(let tick=0;tick<500&&(pending()||system.worker.analyses.size);tick++){system.db.prepare("UPDATE inbox_jobs SET next_retry=0 WHERE status IN ('QUEUED','WAITING')").run();system.db.prepare("UPDATE jobs SET next_retry=0 WHERE status='QUEUED'").run();await system.inbox.worker.tick();await system.worker.tick();await Promise.all([...system.worker.analyses]);}
const label:Record<string,string>={approved:'Approved',needs_review:'Needs review',quarantined:'Quarantined',processing:'Still processing',rejected:'Rejected'};
for(const test of tests){const id=ids.get(test.id);if(!id)continue;const item=system.inbox.service.project(user,id);const observed=label[item.status]??item.status;const want=expected(test),note=want!==test.expect?' (already paid on the platform)':'';rows.push({id:test.id,expected:want+note,observed,reason:item.approval.reason,ok:observed===want&&(!note||item.approval.reason.includes('already been paid'))});}
rows.sort((a,b)=>a.id.localeCompare(b.id));
await system.app.close();globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});
const passed=rows.filter(r=>r.ok).length;
await writeFile(join(root,'VALIDATION.md'),`# Manual test pack: automated check\n\nRun ${new Date().toISOString().slice(0,10)}. Each file went through the real intake, both workers, fixture agents, trusted-record checks and the final audit, using a **temporary copy** of the Fuji database (live data untouched, no network, no payment).\n\n**${passed}/${rows.length} files behaved as documented.**\n\n| ID | Expected | Observed | Reason shown to the user |\n| --- | --- | --- | --- |\n${rows.map(r=>`| ${r.id} | ${r.expected} | ${r.ok?'':'❌ '}${r.observed} | ${r.reason.replace(/\|/g,'/').replace(/\n/g,' ')} |`).join('\n')}\n\nThe live platform runs the same rules. On the real platform the payment step for group 1 also needs your approver wallet signature and a Fuji transaction, which this check does not perform.\n`);
console.log(`${passed}/${rows.length} as documented`);for(const r of rows.filter(r=>!r.ok))console.log(`${r.id}: expected ${r.expected}, observed ${r.observed} — ${r.reason}`);
if(passed!==rows.length)process.exitCode=1;
