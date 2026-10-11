import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mnemonicToAccount} from 'viem/accounts';
import {buildApp} from '../../apps/api/src/app.js';
import {envSchema} from '../../apps/api/src/config.js';
import type {InboxDTO} from '../../apps/api/src/inbox/types.js';
import {supplier,type Sample} from './corpus.js';

const root=resolve('fixtures/workflow-validation'),origin='http://localhost:5173',tenant='northstar-demo';
type Entry=Omit<Sample,'body'>&{sha256:string};
export type Result={id:string;channel:string;name:string;file:string;expected:Sample['expected'];httpStatus:number;observed?:{classification:string|null;status:string;risks:string[];linked:boolean;stageStatuses:Record<string,string>;failedChecks:string[];workerStatus:string;paymentExecution:string|null;notificationKinds:string[]};failures:string[]};
export type ValidationReport={schemaVersion:string;generatedAt:string;scope:string;results:Result[];summary:{total:number;accepted:number;passed:number;failed:number;byChannel:Record<string,number>;byOutcome:Record<string,number>;analysisRuns:number;workerTicks:number;chainScansReplaced:number;networkAttempts:number;paymentWriteAttempts:number};invariants:string[];limitations:string[]};
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function multipart(fields:Record<string,string>,filename:string,mime:string,bytes:Buffer){
 const boundary='sf-validation-'+randomUUID(),parts:Buffer[]=[];
 for(const [name,value] of Object.entries(fields))parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
 parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`));return {bytes:Buffer.concat(parts),contentType:`multipart/form-data; boundary=${boundary}`};
}
export async function runWorkflowValidation(reportDirectory?:string):Promise<ValidationReport>{
 const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')) as {samples:Entry[]};
 if(manifest.samples.length!==100||new Set(manifest.samples.map(s=>s.id)).size!==100)throw new Error('Exactly 100 unique fixture IDs are required.');
 const directory=await mkdtemp(join(tmpdir(),'sf-workflow-validation-'));
 let system:Awaited<ReturnType<typeof buildApp>>|undefined,networkAttempts=0,paymentWriteAttempts=0,chainScansReplaced=0,workerTicks=0;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{networkAttempts++;throw new Error('WORKFLOW_VALIDATION_NETWORK_DISABLED');};
 try{
  const deployment=JSON.parse(await readFile('deployments/local.json','utf8'));deployment.rpcUrl='http://127.0.0.1:9';
  const deploymentPath=join(directory,'deployment.json');await writeFile(deploymentPath,JSON.stringify(deployment));
  const config=envSchema.parse({NODE_ENV:'test',APP_ENV:'local',CHAIN_ID:'31337',RPC_URL:deployment.rpcUrl,DATABASE_PATH:join(directory,'database.sqlite'),ARTIFACT_ROOT:join(directory,'artifacts'),DEPLOYMENT_MANIFEST_PATH:deploymentPath,TRUSTED_REGISTRY_PATH:join(directory,'registry.json'),AGENT_MODE:'fixture',OPENAI_API_KEY:'',OPENAI_MODEL:'',SESSION_SECRET:'synthetic-validation-session-only-not-a-runtime-credential',RELAYER_PRIVATE_KEY:'',AUTOMATION_MANIFEST_PATH:'',AUTOMATION_EXECUTOR_PRIVATE_KEY:'',INBOX_WEBHOOK_SECRET:'',SEED_ON_START:'false',ENABLE_DEMO_ROUTES:'false',ENABLE_MAINNET:'false',WEB_ORIGIN:origin});
  system=await buildApp({config,worker:false});const {app,db,inbox,worker}=system;
  // Only transport boundaries are substituted: both durable workers and all
  // intake/extraction/agent/check/audit code execute unchanged against this DB.
  system.chain.scan=async()=>{chainScansReplaced++;};
  system.chain.submit=async()=>{paymentWriteAttempts++;throw new Error('PAYMENT_WRITES_FORBIDDEN_IN_VALIDATION');};
  system.chain.reconcile=async()=>{paymentWriteAttempts++;throw new Error('UNEXPECTED_EXECUTION_RECONCILIATION');};
  const account=mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:1});
  const userId=randomUUID(),memberId=randomUUID();db.prepare('INSERT INTO tenants VALUES(?,?)').run(tenant,'Synthetic validation tenant');db.prepare('INSERT INTO users VALUES(?,?)').run(userId,account.address.toLowerCase());db.prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(memberId,userId,tenant,JSON.stringify(['operator','reviewer','auditor']));
  db.prepare('INSERT INTO supplier_versions VALUES(?,?,?,?,?,?)').run(supplier.id,tenant,supplier.supplierKey,supplier.recipient,supplier.version,JSON.stringify(supplier));
  const payables=[...new Map(manifest.samples.filter(s=>s.payable).map(s=>[s.payable!.id,s.payable!])).values()];
  for(const p of payables)db.prepare('INSERT INTO payables VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(p.id,tenant,'workflow-validation',p.reference,'0x'+digest(p.reference),supplier.id,p.reference,'10000000',deployment.token,'1','VALIDATION-'+p.reference);
  await writeFile(config.TRUSTED_REGISTRY_PATH,JSON.stringify({scope:'ISOLATED_SYNTHETIC_ONLY',suppliers:[supplier],payables}));
  const challenge=await app.inject({method:'POST',url:'/api/v1/auth/challenge',headers:{origin},payload:{address:account.address.toLowerCase()}});
  if(challenge.statusCode!==200)throw new Error(`Synthetic login challenge failed: ${challenge.statusCode}`);
  const c=challenge.json(),pre=challenge.cookies[0]!;
  const login=await app.inject({method:'POST',url:'/api/v1/auth/verify',headers:{origin,cookie:`${pre.name}=${pre.value}`},payload:{challengeId:c.challengeId,signature:await account.signMessage({message:c.message})}});
  if(login.statusCode!==200)throw new Error(`Synthetic login verification failed: ${login.statusCode}`);
  const session=login.cookies.find(c=>c.name==='sf_session')!,auth={origin,cookie:`sf_session=${session.value}`,'x-csrf-token':login.json().csrfToken};
  const results:Result[]=[],ids=new Map<string,string>();
  for(const [index,entry] of manifest.samples.entries()){
   const bytes=await readFile(join(root,entry.file));if(digest(bytes)!==entry.sha256)throw new Error(`Fixture hash changed: ${entry.id}. Regenerate only after reviewing authored expectations.`);
   const headers={...auth,'idempotency-key':`workflow-validation:${entry.id}`},remoteAddress=`192.0.2.${Math.floor(index/10)+1}`;
   const fields:Record<string,string>={channel:entry.channel};if(entry.selectPayable)fields.payableId=entry.payable!.id;
   const file=entry.channel==='invoice'||entry.channel==='email'?multipart(fields,basename(entry.file),entry.mime,bytes):null;
   const response=await app.inject({method:'POST',url:'/api/v1/inbox',remoteAddress,headers:file?{...headers,'content-type':file.contentType}:headers,payload:file?file.bytes:{...fields,text:bytes.toString('utf8')}});
   const result:Result={id:entry.id,channel:entry.channel,name:entry.name,file:entry.file,expected:entry.expected,httpStatus:response.statusCode,failures:[]};
   if(response.statusCode!==201)result.failures.push(`Intake returned ${response.statusCode}: ${response.json().error?.code??'unknown error'}`);
   else ids.set(entry.id,(response.json() as InboxDTO).id);results.push(result);
  }
  const pending=()=>Number((db.prepare("SELECT COUNT(*) n FROM inbox_jobs WHERE status IN ('QUEUED','RUNNING','WAITING')").get() as {n:number}).n)+Number((db.prepare("SELECT COUNT(*) n FROM jobs WHERE status IN ('QUEUED','RUNNING')").get() as {n:number}).n);
  while((pending()||worker.analyses.size)&&workerTicks<1000){
   // Advance retry eligibility only in the temporary DB; no production clock,
   // source, decision, or worker result is rewritten by the harness.
   db.prepare("UPDATE inbox_jobs SET next_retry=0 WHERE status IN ('QUEUED','WAITING')").run();db.prepare("UPDATE jobs SET next_retry=0 WHERE status='QUEUED'").run();
   await inbox.worker.tick();await worker.tick();await Promise.all([...worker.analyses]);await system.automation.tick();workerTicks++;
  }
  for(const result of results){
   const id=ids.get(result.id);if(!id)continue;
   const response=await app.inject({method:'GET',url:`/api/v1/inbox/${id}`,headers:auth});
   if(response.statusCode!==200){result.failures.push(`Persisted input could not be read: HTTP ${response.statusCode}`);continue;}
   const item=response.json() as InboxDTO,job=db.prepare('SELECT status,error FROM inbox_jobs WHERE item_id=?').get(id) as {status:string;error:string|null};
   const linked=item.linkedCaseId?system.service.project({tenantId:tenant,membershipId:memberId,address:account.address.toLowerCase(),roles:['operator','reviewer','auditor'],csrfToken:auth['x-csrf-token']},item.linkedCaseId):null;
   result.observed={classification:item.classification?.category??null,status:item.status,risks:item.risks.map(r=>r.code),linked:!!item.linkedCaseId,stageStatuses:Object.fromEntries(item.stages.map(s=>[s.id,s.status])),failedChecks:(linked?.checks??[]).filter((check:{passed:boolean})=>!check.passed).map((check:{code:string})=>check.code),workerStatus:job.status,paymentExecution:item.payment?.executionStatus??null,notificationKinds:item.notifications.map(n=>n.kind)};
   const o=result.observed,e=result.expected;
   if(o.classification!==e.classification)result.failures.push(`Classification: expected ${e.classification}, observed ${o.classification}`);
   if(o.status!==e.status)result.failures.push(`Outcome: expected ${e.status}, observed ${o.status}`);
   if(e.linked!==undefined&&o.linked!==e.linked)result.failures.push(`Trusted payable linkage: expected ${e.linked}, observed ${o.linked}`);
   for(const risk of e.risks??[])if(!o.risks.includes(risk))result.failures.push(`Required security finding missing: ${risk}`);
   if(e.failedCheck&&!o.failedChecks.includes(e.failedCheck))result.failures.push(`Expected failed business check missing: ${e.failedCheck}`);
   if(job.status!=='COMPLETED')result.failures.push(`Inbox worker did not complete: ${job.status}${job.error?' '+job.error:''}`);
   if(item.stages.length!==5||item.stages.some(s=>s.status==='pending'||s.status==='running'))result.failures.push('One or more specialist stages remain pending/running or absent.');
   if(!item.notifications.length)result.failures.push('No durable result notification exists.');
   if(item.approval.scope!=='WORKFLOW_ONLY')result.failures.push('Inbox decision exceeded workflow-only scope.');
   if(item.payment&&!['NONE','REVERTED'].includes(item.payment.executionStatus))result.failures.push(`Unexpected payment execution: ${item.payment.executionStatus}`);
   if(item.status==='approved'&&item.stages.some(s=>s.status!=='passed'))result.failures.push('Approved workflow has a specialist stage that did not pass.');
   if(item.status==='quarantined'&&item.stages.find(s=>s.id==='client_finance')?.status!=='not_applicable')result.failures.push('Quarantined source continued into financial processing.');
  }
  const invariants:string[]=[];
  for(const table of ['authorizations','proposals','execution_requests','settlements','automation_payments','tx_outbox']){const count=(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {n:number}).n;if(count)invariants.push(`${table}: expected zero, found ${count}`);}
  if(pending())invariants.push(`${pending()} jobs remain queued/running/waiting after ${workerTicks} ticks.`);
  if((db.prepare('SELECT COUNT(*) n FROM inbox_items').get() as {n:number}).n!==ids.size)invariants.push('Persisted input count does not equal accepted intake count.');
  if(new Set(ids.values()).size!==ids.size)invariants.push('Distinct submissions collapsed into duplicate inbox IDs.');
  if(networkAttempts)invariants.push(`${networkAttempts} network requests were attempted and blocked.`);
  if(paymentWriteAttempts)invariants.push(`${paymentWriteAttempts} payment operations were attempted and blocked.`);
  const listing=await app.inject({method:'GET',url:'/api/v1/inbox?limit=100',headers:auth});if(listing.statusCode!==200||listing.json().items.length!==ids.size)invariants.push('The inbox list does not expose every accepted input.');
  const by=(key:'channel'|'outcome')=>results.reduce<Record<string,number>>((all,r)=>{const value=key==='channel'?r.channel:r.observed?.status??'intake_failed';all[value]=(all[value]??0)+1;return all;},{});
  const report:ValidationReport={schemaVersion:'workflow-validation-result.v1',generatedAt:new Date().toISOString(),scope:'Actual authenticated API intake, file extraction, durable inbox worker, payment analysis worker, deterministic fixture agents, trusted-record checks, independent audit, persisted notifications and API result reads. Isolated temporary database/artifacts. No live provider or blockchain execution.',results,summary:{total:results.length,accepted:ids.size,passed:results.filter(r=>!r.failures.length).length,failed:results.filter(r=>r.failures.length).length,byChannel:by('channel'),byOutcome:by('outcome'),analysisRuns:(db.prepare('SELECT COUNT(*) n FROM analysis_runs').get() as {n:number}).n,workerTicks,chainScansReplaced,networkAttempts,paymentWriteAttempts},invariants,limitations:['Authored synthetic corpus, not a statistical measure of production fraud-detection accuracy.','Invoice agents run their deterministic fixture implementations; live model quality, outages, latency and cost are not measured.','Voice inputs are manual transcripts; audio transcription and speaker authentication are not tested.','URLs are never fetched; no malware-browser or sender-authentication guarantee is made.','Read-only chain scans are replaced by an explicit offline stub; no wallet transfer, transaction confirmation or settlement is exercised.','No standing payment policy is installed; approved items must not create payment authority.','Rate limiting is preserved, with reserved test IPs distributed in groups of ten.']};
  if(reportDirectory){await mkdir(reportDirectory,{recursive:true});await writeFile(join(reportDirectory,'results.json'),JSON.stringify(report,null,2)+'\n');const rows=results.map(r=>`| ${r.id} | ${r.channel} | ${r.observed?.classification??'-'} | ${r.observed?.status??`HTTP ${r.httpStatus}`} | ${r.failures.length?'FAIL: '+r.failures.join('; '):'PASS'} |`).join('\n');await writeFile(join(reportDirectory,'results.md'),`# Workflow validation results\n\n${report.generatedAt}\n\n${report.summary.passed}/${report.summary.total} authored scenarios passed; ${report.summary.accepted} accepted. ${report.summary.analysisRuns} specialist analysis runs. Network attempts: ${networkAttempts}. Payment write attempts: ${paymentWriteAttempts}.\n\nInvariant failures: ${invariants.length?invariants.join('; '):'none'}.\n\n${report.scope}\n\n| ID | Channel | Classification | Outcome | Result |\n| --- | --- | --- | --- | --- |\n${rows}\n\n## Limitations\n\n${report.limitations.map(l=>'- '+l).join('\n')}\n`);}
  return report;
 }finally{
  try{if(system)await system.app.close();}
  finally{globalThis.fetch=originalFetch;await rm(directory,{recursive:true,force:true});}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=await runWorkflowValidation(resolve('var/workflow-validation'));console.log(JSON.stringify(report.summary,null,2));
 for(const row of report.results.filter(r=>r.failures.length))console.log(`${row.id}: ${row.failures.join('; ')}`);
 for(const failure of report.invariants)console.log(`INVARIANT: ${failure}`);
 if(report.summary.failed||report.invariants.length)process.exitCode=1;
}
