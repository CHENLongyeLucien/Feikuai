import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {buildApp} from '../../apps/api/src/app.js';
import {loadConfig} from '../../apps/api/src/config.js';
import {seed} from '../../apps/api/src/db/seed.js';
import {projectDashboard} from '../../apps/api/src/dashboard/index.js';
import type {Identity} from '../../apps/api/src/security/auth.js';
import type {DashboardDTO} from '@secure-finance/shared';

let dir:string,system:Awaited<ReturnType<typeof buildApp>>,registry:any,manifest:any,cookie:string,user:Identity;
const now=new Date('2026-10-11T12:00:00.000Z'),h=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
beforeEach(async()=>{
 dir=mkdtempSync(join(tmpdir(),'sf-dashboard-'));const deployment=join(dir,'deployment.json');writeFileSync(deployment,readFileSync('deployments/local.json'));manifest=JSON.parse(readFileSync(deployment,'utf8'));
 const config=loadConfig({NODE_ENV:'test',APP_ENV:'local',CHAIN_ID:'31337',RPC_URL:'http://127.0.0.1:1',WEB_ORIGIN:'http://localhost:5173',DATABASE_PATH:join(dir,'db.sqlite'),ARTIFACT_ROOT:join(dir,'artifacts'),DEPLOYMENT_MANIFEST_PATH:deployment,TRUSTED_REGISTRY_PATH:join(dir,'registry.json'),SEED_ON_START:'false',ENABLE_DEMO_ROUTES:'true',AGENT_MODE:'fixture',OPENAI_API_KEY:'',OPENAI_MODEL:'',RELAYER_PRIVATE_KEY:'',AUTOMATION_MANIFEST_PATH:'',AUTOMATION_EXECUTOR_PRIVATE_KEY:'',INBOX_WEBHOOK_SECRET:''});
 system=await buildApp({config,worker:false});registry=seed(system.db,config);const login=await system.app.inject({method:'POST',url:'/api/v1/auth/demo',headers:{origin:config.WEB_ORIGIN}});expect(login.statusCode).toBe(200);cookie=`sf_session=${login.cookies[0]!.value}`;user={tenantId:'northstar-demo',membershipId:'dashboard-test',address:manifest.approver,roles:['operator','reviewer','auditor'],csrfToken:login.json().csrfToken};
});
afterEach(async()=>{vi.restoreAllMocks();await system.app.close();rmSync(dir,{recursive:true,force:true});});
const get=(query='',authenticated=true)=>system.app.inject({url:'/api/v1/dashboard'+query,headers:authenticated?{cookie}:{}});
const project=(days:7|30|90=30)=>projectDashboard(system.db,system.config,user,days,now);
async function source(channel:'invoice'|'email'|'voice'|'text'='text',status='approved',created='2026-10-10T23:59:59.000Z'){
 const item=await system.inbox.service.create(user,{channel,text:'Please schedule a support meeting next week.'},randomUUID());system.db.prepare('UPDATE inbox_items SET status=?,created_at=?,updated_at=? WHERE id=?').run(status,created,created,item.id);return item;
}
// Synthetic recorded-receipt fixtures test the read model, not real chain execution.
function human(p:any,index=1,extra:Record<string,unknown>={}){
 const details={chainId:manifest.chainId,vault:manifest.vault,invoiceKey:p.invoiceKey,token:p.token,supplierKey:p.supplierKey,recipient:p.recipient,amountAtomic:p.amountAtomic,txHash:h(index),blockHash:h(100),blockNumber:'12',logIndex:0,observedAt:'2026-10-10T23:59:59.000Z',receipt:{status:'success',transactionHash:h(index)},...extra};
 const id=randomUUID();system.db.prepare('INSERT INTO settlements VALUES(?,?,NULL,NULL,NULL,?,?,?,?,?,?,?, ?,?)').run(id,user.tenantId,manifest.chainId,manifest.vault,p.invoiceKey,h(index+300),String(index),h(index),0,JSON.stringify(details),'2026-10-10T23:59:59.000Z');return id;
}
async function automatic(p:any,index=2,status='CONFIRMED',extra:Record<string,unknown>={}){
 const item=await source(),vault='0x'+'7'.repeat(40),receipt={chainId:manifest.chainId,vault,invoiceKey:p.invoiceKey,token:p.token,supplierKey:p.supplierKey,recipient:p.recipient,amountAtomic:p.amountAtomic,transactionHash:h(index),blockHash:h(100),blockNumber:'12',logIndex:0,termsHash:h(400),evidenceCommitment:h(401),verifiedAt:'2026-10-11T01:00:00.000Z',...extra};
 system.db.prepare(`INSERT INTO automation_payments(id,tenant_id,item_id,item_version,payable_id,invoice_key,chain_id,vault,token,supplier_key,recipient,amount_atomic,terms_hash,evidence_commitment,evidence,executor_address,tx_hash,status,receipt,created_at,updated_at) VALUES(@id,@tenant,@item,1,@payable,@invoice,@chain,@vault,@token,@supplier,@recipient,@amount,@terms,@evidence,'{}',@executor,@tx,@status,@receipt,@created,@created)`).run({id:randomUUID(),tenant:user.tenantId,item:item.id,payable:p.id,invoice:p.invoiceKey,chain:manifest.chainId,vault,token:p.token,supplier:p.supplierKey,recipient:p.recipient,amount:p.amountAtomic,terms:h(400),evidence:h(401),executor:manifest.roles.relayer,tx:h(index),status,receipt:JSON.stringify(receipt),created:'2026-10-11T01:00:00.000Z'});
 return item;
}
describe('tenant finance dashboard',()=>{
 it('requires authentication, validates time windows and exposes no secrets',async()=>{
  expect((await get('',false)).statusCode).toBe(401);
  for(const q of ['?days=0','?days=31','?days=30.5','?tenantId=other','?days=7&extra=1'])expect((await get(q)).statusCode).toBe(400);
  for(const days of [7,30,90]){const response=await get(`?days=${days}`);expect(response.statusCode).toBe(200);const d=response.json<DashboardDTO>();expect(d.daily).toHaveLength(days);expect(d.window.timeZone).toBe('UTC');expect(d.workspace.name).toBe('Northstar Labs');expect(response.body).not.toMatch(/source_path|raw_transaction|csrfToken|signature|private_key/i);}
 });
 it('returns zero source/payment charts for an empty tenant with no cross-tenant leakage',async()=>{
  await source();human(registry.payables[0]);system.db.prepare("INSERT INTO tenants VALUES('other-dashboard','Other workspace')").run();system.db.prepare("UPDATE memberships SET tenant_id='other-dashboard' WHERE user_id=(SELECT id FROM users WHERE address=?)").run(user.address);
  const d=(await get()).json<DashboardDTO>();expect(d.workspace.name).toBe('Other workspace');expect(d.totals.inboxCount).toBe(0);expect(d.totals.verifiedPaidAtomic).toBe('0');expect(d.totals.registeredPayablesCount).toBe(0);expect(d.recentActivity).toEqual([]);expect(d.daily.every(day=>day.inboxCount===0&&day.verifiedPaidAtomic==='0')).toBe(true);
 });
 it('uses exact atomic arithmetic and counts a business invoice once across receipt routes',async()=>{
  const p={...registry.payables[0],amountAtomic:'9007199254740993123456789'};system.db.prepare('UPDATE payables SET amount_atomic=? WHERE id=?').run(p.amountAtomic,p.id);human(p);await automatic(p);
  const d=project();expect(d.totals.verifiedPaidCount).toBe(1);expect(d.totals.verifiedPaidAtomic).toBe(p.amountAtomic);expect(d.totals.registeredPayablesAtomic).toBe((BigInt(p.amountAtomic)+BigInt(registry.payables.length-1)*10000000n).toString());expect(d.totals.unpaidRegisteredCount).toBe(registry.payables.length-1);expect(d.totals.unpaidRegisteredAtomic).toBe((BigInt(registry.payables.length-1)*10000000n).toString());expect(d.daily.find(x=>x.date==='2026-10-10')!.verifiedPaidAtomic).toBe(p.amountAtomic);expect(d.daily.find(x=>x.date==='2026-10-11')!.verifiedPaidCount).toBe(0);expect(d.suppliers[0]!.verifiedPaidAtomic).toBe(p.amountAtomic);expect(d.coverage.limitations.some(s=>s.includes('duplicate'))).toBe(true);
 });
 it('never promotes an approval, pending attempt, malformed receipt or mismatch into paid money',async()=>{
  await source('invoice','approved');await automatic(registry.payables[0],2,'UNKNOWN');human(registry.payables[1],3,{amountAtomic:'1'});await automatic(registry.payables[2],4,'CONFIRMED',{transactionHash:h(99)});
  const d=project();expect(d.totals.verifiedPaidCount).toBe(0);expect(d.totals.verifiedPaidAtomic).toBe('0');expect(d.coverage.excludedUnverifiedCount).toBe(2);expect(d.totals.unresolvedPaymentCount).toBe(1);expect(d.daily.every(day=>day.verifiedPaidCount===0)).toBe(true);
 });
 it('scopes asset totals and makes missing deployment coverage explicit',()=>{
  system.db.prepare('UPDATE payables SET token=? WHERE id=?').run('0x'+'f'.repeat(40),registry.payables[0].id);expect(project().totals.registeredPayablesCount).toBe(registry.payables.length-1);
  system.config.DEPLOYMENT_MANIFEST_PATH=join(dir,'not-configured.json');const d=project();expect(d.coverage.financialsAvailable).toBe(false);expect(d.totals.registeredPayablesAtomic).toBe('0');expect(d.coverage.limitations.join(' ')).toContain('unavailable');
 });
 it('charts recorded workflow clearances on their event date without inferring payment or inventing missing history',async()=>{
  const item=await source('text','rejected','2026-10-11T01:00:00.000Z');
  system.db.prepare('INSERT INTO inbox_notifications VALUES(?,?,?,?,?,?,0,?)').run(randomUUID(),user.tenantId,item.id,'workflow_approved','Synthetic clearance','Synthetic test event','2026-10-08T23:59:59.000Z');
  await source('text','approved');
  const d=project(7);expect(d.daily.find(day=>day.date==='2026-10-08')!.workflowApprovedCount).toBe(1);expect(d.daily.reduce((sum,day)=>sum+day.workflowApprovedCount,0)).toBe(1);expect(d.totals.verifiedPaidAtomic).toBe('0');
 });
 it('aggregates all source rows, preserves UTC windows and is strictly read only',async()=>{
  for(let i=0;i<105;i++)await source(['invoice','email','voice','text'][i%4] as any,i%3===0?'needs_review':i%3===1?'quarantined':'approved',i===0?'2026-10-04T23:59:59.999Z':'2026-10-10T23:59:59.000Z');
  const changes=()=>Number((system.db.prepare('SELECT total_changes() n').get() as {n:number}).n),before=changes();const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network reads allowed'));const d=project(7);
  expect(changes()).toBe(before);expect(fetch).not.toHaveBeenCalled();expect(d.daily[0]!.date).toBe('2026-10-05');expect(d.daily.reduce((sum,day)=>sum+day.inboxCount,0)).toBe(104);expect(d.totals.inboxCount).toBe(105);expect(d.channels.reduce((sum,c)=>sum+c.count,0)).toBe(105);expect(d.totals.needsReviewCount).toBe(35);expect(d.totals.securityHoldCount).toBe(35);expect(d.recentActivity).toHaveLength(12);
 });
});
