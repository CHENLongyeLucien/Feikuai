import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildApp} from '../../apps/api/src/app.js';
import {loadConfig} from '../../apps/api/src/config.js';
import {seed,fixtureText} from '../../apps/api/src/db/seed.js';
import {extract} from '../../apps/api/src/security/artifacts.js';
import type {Identity} from '../../apps/api/src/security/auth.js';

let dir:string,system:Awaited<ReturnType<typeof buildApp>>,registry:any,manifest:any,cookie:string,user:Identity;
const h=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
beforeEach(async()=>{
 dir=mkdtempSync(join(tmpdir(),'sf-invoice-reuse-'));const deployment=join(dir,'deployment.json');writeFileSync(deployment,readFileSync('deployments/local.json'));manifest=JSON.parse(readFileSync(deployment,'utf8'));
 const config=loadConfig({NODE_ENV:'test',APP_ENV:'local',CHAIN_ID:'31337',RPC_URL:'http://127.0.0.1:1',WEB_ORIGIN:'http://localhost:5173',DATABASE_PATH:join(dir,'db.sqlite'),ARTIFACT_ROOT:join(dir,'artifacts'),DEPLOYMENT_MANIFEST_PATH:deployment,TRUSTED_REGISTRY_PATH:join(dir,'registry.json'),SEED_ON_START:'false',ENABLE_DEMO_ROUTES:'true',AGENT_MODE:'fixture',OPENAI_API_KEY:'',OPENAI_MODEL:'',RELAYER_PRIVATE_KEY:'',AUTOMATION_MANIFEST_PATH:'',AUTOMATION_EXECUTOR_PRIVATE_KEY:'',INBOX_WEBHOOK_SECRET:''});
 system=await buildApp({config,worker:false});registry=seed(system.db,config);const login=await system.app.inject({method:'POST',url:'/api/v1/auth/demo',headers:{origin:config.WEB_ORIGIN}});expect(login.statusCode).toBe(200);cookie=`sf_session=${login.cookies[0]!.value}`;user={tenantId:'northstar-demo',membershipId:'invoice-reuse-test',address:manifest.approver,roles:['operator','reviewer'],csrfToken:login.json().csrfToken};
});
afterEach(async()=>{vi.restoreAllMocks();await system.app.close();rmSync(dir,{recursive:true,force:true});});
const small=()=>registry.payables.filter((p:any)=>p.scenarioId.startsWith('SMALL-10-'));
const headers=()=>({cookie,origin:system.config.WEB_ORIGIN,'x-csrf-token':user.csrfToken,'idempotency-key':randomUUID()});
const download=()=>system.app.inject({url:'/api/v1/inbox/test-invoice.pdf',headers:{cookie}});
// Synthetic receipt row represents a prior verified payment; no transaction is submitted.
function settled(p:any,index=1){system.db.prepare('INSERT INTO settlements VALUES(?,?,NULL,NULL,NULL,?,?,?,?,?,?,?,?,?)').run(randomUUID(),user.tenantId,manifest.chainId,manifest.vault,p.invoiceKey,h(index+300),String(index),h(index),0,'{}',new Date().toISOString());}
async function upload(bytes:Uint8Array,filename='invoice.pdf'){return system.inbox.service.create(user,{channel:'invoice'},randomUUID(),{bytes,filename,mimeType:'application/pdf'});}
async function finish(id:string){await system.inbox.service.process(id);const linked=system.inbox.service.project(user,id).linkedCaseId;if(linked)await system.service.analyze(user.tenantId,linked);await system.inbox.service.process(id);return system.inbox.service.project(user,id);}

describe('paid invoice reuse and fresh test source',()=>{
 it('clears the exact user PDF on an unpaid trusted record and explains its reuse after settlement',async()=>{
  const pdf=readFileSync('fixtures/user-tests/invoices/01-matching-invoice.pdf'),created=await upload(pdf),first=await finish(created.id);
  expect(first.status).toBe('approved');expect(first.reviewBlock).toBeUndefined();expect(first.payableId).toBe(small()[0].id);
  settled(small()[0]);const duplicate=await upload(pdf),item=await finish(duplicate.id);
  expect(item.status).toBe('needs_review');expect(item.reviewBlock).toMatchObject({code:'INVOICE_ALREADY_SETTLED',title:'Already paid'});expect(item.stages.find(s=>s.id==='client_finance')!.summary).toContain('already been paid');expect(item.approval.reason).toContain('already been paid');expect(item.payment!.settlementStatus).toBe('SETTLED');
  expect(item.nextActions).toEqual(expect.arrayContaining([{id:'open_case',label:'View recorded payment receipt',href:`/workspace/${item.linkedCaseId}`},{id:'review',label:'Dismiss this duplicate'},{id:'provide_information',label:'Submit a different unpaid invoice for your next test'}]));
  expect(item.nextActions.some(action=>/missing information|Review and decide/.test(action.label))).toBe(false);
  expect(system.inbox.service.project({...user,roles:['operator']},item.id).nextActions.some(action=>action.id==='review')).toBe(false);
  const response=await system.app.inject({method:'POST',url:`/api/v1/inbox/${item.id}/review`,headers:headers(),payload:{expectedVersion:item.version,decision:'approve',note:'already done'}});
  expect(response.statusCode).toBe(409);expect(response.json().error.code).toBe('INVOICE_ALREADY_SETTLED');expect(response.json().error.message).toContain('different unpaid invoice');expect((system.db.prepare('SELECT COUNT(*) n FROM execution_requests').get() as any).n).toBe(0);expect((system.db.prepare('SELECT COUNT(*) n FROM authorizations').get() as any).n).toBe(0);
 });
 it('projects a useful current block without rewriting an old reviewer note or audit evidence',async()=>{
  settled(small()[0]);const created=await upload(readFileSync('fixtures/user-tests/invoices/01-matching-invoice.pdf')),item=await finish(created.id);
  const decision=await system.app.inject({method:'POST',url:`/api/v1/inbox/${item.id}/review`,headers:headers(),payload:{expectedVersion:item.version,decision:'request_information',note:'Historical human note'}});expect(decision.statusCode).toBe(200);
  const row=system.db.prepare('SELECT * FROM inbox_items WHERE id=?').get(item.id),stages=system.db.prepare('SELECT * FROM inbox_stages WHERE item_id=?').all(item.id),reviews=system.db.prepare('SELECT * FROM inbox_reviews WHERE item_id=?').all(item.id);
  const current=system.inbox.service.project(user,item.id);expect(current.reviewBlock!.title).toBe('Already paid');expect(current.approval.reason).toBe('Historical human note');expect(current.reviewHistory[0]!.note).toBe('Historical human note');expect(system.db.prepare('SELECT * FROM inbox_items WHERE id=?').get(item.id)).toEqual(row);expect(system.db.prepare('SELECT * FROM inbox_stages WHERE item_id=?').all(item.id)).toEqual(stages);expect(system.db.prepare('SELECT * FROM inbox_reviews WHERE item_id=?').all(item.id)).toEqual(reviews);
 });
 it('downloads an authenticated read-only PDF for the next unused 10-DEMO record and that PDF clears intake',async()=>{
  settled(small()[0]);const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network allowed')),changes=(system.db.prepare('SELECT total_changes() n').get() as any).n,response=await download();
  expect(response.statusCode).toBe(200);expect(response.headers['content-type']).toBe('application/pdf');expect(response.headers['content-disposition']).toContain('test-invoice-NS-TEST10-0002.pdf');expect(response.headers['cache-control']).toBe('no-store');expect(response.rawPayload.subarray(0,5).toString()).toBe('%PDF-');expect((system.db.prepare('SELECT total_changes() n').get() as any).n).toBe(changes);expect(fetch).not.toHaveBeenCalled();
  const extracted=await extract(response.rawPayload,'application/pdf'),text=extracted.pages.map(p=>p.text).join('\n');expect(extracted.pages).toHaveLength(1);expect(text).toMatch(/Invoice reference:\s+NS-TEST10-0002/);expect(text).toContain('Amount: 10.00 DEMO');expect(text).toContain(small()[1].supplierKey);
  const item=await finish((await upload(response.rawPayload)).id);expect(item.status).toBe('approved');expect(item.payableId).toBe(small()[1].id);expect(item.payment!.settlementStatus).toBe('UNSETTLED');expect((system.db.prepare('SELECT COUNT(*) n FROM execution_requests').get() as any).n).toBe(0);
 });
 it('skips used, queued, wrong-token and standing-policy records without inventing a payable',async()=>{
  const p=small();settled(p[0]);await system.inbox.service.create(user,{channel:'invoice',text:fixtureText(p[1])},randomUUID());
  await system.service.upload(user,p[2].id,{bytes:Buffer.from(fixtureText(p[2])),filename:'case.txt',mimeType:'text/plain'},randomUUID());
  system.db.prepare('INSERT INTO automation_policy_obligations VALUES(?,?,?,?,?,?,?)').run(user.tenantId,p[3].id,p[3].invoiceKey,'31337',manifest.vault,h(400),new Date().toISOString());system.db.prepare('UPDATE payables SET token=? WHERE id=?').run('0x'+'f'.repeat(40),p[4].id);
  const before=system.db.prepare('SELECT * FROM payables').all(),response=await download();expect(response.statusCode).toBe(200);expect(response.headers['content-disposition']).toContain('NS-TEST10-0006');expect(system.db.prepare('SELECT * FROM payables').all()).toEqual(before);
 });
 it('requires authorized membership, rejects selectors and reports exhausted test records',async()=>{
  expect((await system.app.inject('/api/v1/inbox/test-invoice.pdf')).statusCode).toBe(401);expect((await system.app.inject({url:'/api/v1/inbox/test-invoice.pdf?amount=1',headers:{cookie}})).statusCode).toBe(400);
  const member=(system.db.prepare('SELECT membership_id FROM sessions LIMIT 1').get() as any).membership_id;system.db.prepare('UPDATE memberships SET roles=? WHERE id=?').run('["auditor"]',member);expect((await download()).statusCode).toBe(403);system.db.prepare('UPDATE memberships SET roles=? WHERE id=?').run('["reviewer"]',member);
  for(const p of small())system.db.prepare('INSERT INTO cases(id,tenant_id,payable_id,workflow_status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),user.tenantId,p.id,'RECEIVED',new Date().toISOString(),new Date().toISOString());const response=await download();expect(response.statusCode).toBe(409);expect(response.json().error.code).toBe('NO_UNUSED_TEST_INVOICE');expect(system.db.prepare('SELECT COUNT(*) n FROM payables').get()).toEqual({n:registry.payables.length});
 });
 it('isolates tenant selection and permits a Fuji test PDF with convenience demo routes disabled',async()=>{
  const member=(system.db.prepare('SELECT membership_id FROM sessions LIMIT 1').get() as any).membership_id;system.db.prepare("INSERT INTO tenants VALUES('other-test','Other')").run();system.db.prepare("UPDATE memberships SET tenant_id='other-test' WHERE id=?").run(member);expect((await download()).json().error.code).toBe('NO_UNUSED_TEST_INVOICE');system.db.prepare('UPDATE memberships SET tenant_id=? WHERE id=?').run(user.tenantId,member);
  system.config.APP_ENV='fuji';system.config.CHAIN_ID='43113';system.config.ENABLE_DEMO_ROUTES=false;const fuji={...manifest,chainId:'43113',environment:'fuji'};writeFileSync(system.config.DEPLOYMENT_MANIFEST_PATH,JSON.stringify(fuji));const response=await download();expect(response.statusCode).toBe(200);expect(response.headers['content-type']).toBe('application/pdf');
 });
});
