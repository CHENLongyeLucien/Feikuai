import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {mnemonicToAccount} from 'viem/accounts';
import {keccak256,toHex} from 'viem';
import {derivePolicy} from '@secure-finance/chain';
import {loadConfig} from '../../apps/api/src/config.js';
import {buildApp} from '../../apps/api/src/app.js';
import {seed} from '../../apps/api/src/db/seed.js';
import {issueIntegrationToken,revokeIntegrationToken} from '../../apps/api/src/integrations/api.js';
const account=(i:number)=>mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:i});
let dir:string,system:Awaited<ReturnType<typeof buildApp>>,registry:any,manifest:any;
beforeEach(async()=>{dir=mkdtempSync(join(tmpdir(),'sf-api-'));const addresses=Array.from({length:5},(_,i)=>account(i).address.toLowerCase());const policy={token:'0x1000000000000000000000000000000000000001',approver:addresses[1],maxPerPaymentAtomic:'50000000000',maxAuthorizationTTL:'600',registry:[{supplierKey:keccak256(toHex('northstar-supplier-1')),recipient:addresses[3]},{supplierKey:keccak256(toHex('northstar-supplier-2')),recipient:addresses[4]}].sort((a,b)=>a.supplierKey<b.supplierKey?-1:1)};manifest={schemaVersion:'secure-finance.deployment.v1',environment:'local',chainId:'31337',rpcUrl:'http://127.0.0.1:8545',vault:'0x2000000000000000000000000000000000000002',...policy,roles:{deployer:addresses[0],approver:addresses[1],relayer:addresses[2],suppliers:[addresses[3],addresses[4]]},registryHash:derivePolicy(policy as any).registryHash,policyId:derivePolicy(policy as any).policyId,runtimeCodeHash:'0x'+'11'.repeat(32),tokenRuntimeCodeHash:'0x'+'22'.repeat(32),deploymentBlock:'1',transactions:{token:'0x'+'33'.repeat(32),vault:'0x'+'44'.repeat(32),funding:'0x'+'55'.repeat(32)},build:{solidity:'unit-test',openzeppelin:'unit-test',evmVersion:'cancun',optimizerRuns:200,viaIR:true,foundry:'unit-test'}};const manifestPath=join(dir,'deployment.json');writeFileSync(manifestPath,JSON.stringify(manifest));const config=loadConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),ARTIFACT_ROOT:join(dir,'artifacts'),DEPLOYMENT_MANIFEST_PATH:manifestPath,TRUSTED_REGISTRY_PATH:join(dir,'registry.json'),AGENT_MODE:'fixture'});system=await buildApp({config,worker:false});registry=seed(system.db,config);});
afterEach(async()=>{await system.app.close();rmSync(dir,{recursive:true,force:true});});

const supplierKey=keccak256(toHex('northstar-supplier-1'));
const payableBody=(n=1,overrides:Record<string,unknown>={})=>({externalId:`payable-${n}`,sourceSystem:'acme-erp',invoiceReference:`ACME-INV-${n}`,supplier:{externalId:'sup-atlas',name:'Atlas Cloud Services',recipient:account(3).address,version:'1',supplierKey},amount:{atomic:'1250000',token:'DEMO'},...overrides});
const invoice=(n=1,recipient=account(3).address.toLowerCase(),key=supplierKey)=>`ACME ERP EXPORT\nInvoice reference: ACME-INV-${n}\nSupplier reference: ${key}\nAmount: 1.25 DEMO\nRecipient: ${recipient}\n`;
function token(tenant='northstar-demo'){return issueIntegrationToken(system.db,tenant,'acme-erp');}
const auth=(t:string,key?:string)=>({authorization:`Bearer ${t}`,...(key?{'idempotency-key':key}:{})});
function multipart(fields:Record<string,string>,text:string){const boundary='int-'+randomUUID();const parts=Object.entries(fields).map(([k,v])=>`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join('')+`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="invoice.txt"\r\nContent-Type: text/plain\r\n\r\n${text}\r\n--${boundary}--\r\n`;return {payload:Buffer.from(parts),contentType:`multipart/form-data; boundary=${boundary}`};}
async function importPayable(t:string,n=1,overrides:Record<string,unknown>={},key=`payable-${n}-${randomUUID()}`){return system.app.inject({method:'POST',url:'/api/v1/integrations/payables',headers:auth(t,key),payload:payableBody(n,overrides)});}
async function submitInvoice(t:string,n=1,text=invoice(n)){const body=multipart({sourceSystem:'acme-erp',payableExternalId:`payable-${n}`},text);return system.app.inject({method:'POST',url:'/api/v1/integrations/cases',headers:{...auth(t,`case-${n}-${randomUUID()}`),'content-type':body.contentType},payload:body.payload});}

describe('integration API for ERPs',()=>{
 it('rejects missing, malformed and revoked tokens with the common error format',async()=>{
  const none=await system.app.inject({method:'GET',url:'/api/v1/integrations/cases/'+randomUUID()});expect(none.statusCode).toBe(401);expect(none.json()).toEqual({error:{code:'UNAUTHENTICATED',message:expect.any(String)}});
  const t=token();revokeIntegrationToken(system.db,t.id);expect((await importPayable(t.token)).statusCode).toBe(401);
  expect((await system.app.inject({method:'GET',url:'/api/v1/integrations/cases/'+randomUUID(),headers:{authorization:'Bearer sfk_not-a-real-token-value-000000'}})).statusCode).toBe(401);
 });
 it('imports a payable idempotently and keeps its identity immutable',async()=>{
  const t=token().token,key='acme-payable-1';
  const first=await importPayable(t,1,{},key);expect(first.statusCode).toBe(201);expect(first.json()).toMatchObject({externalId:'payable-1',sourceSystem:'acme-erp',invoiceReference:'ACME-INV-1',amount:{atomic:'1250000',token:'DEMO'},supplier:{supplierKey,recipient:account(3).address.toLowerCase()}});
  const replay=await importPayable(t,1,{},key);expect(replay.statusCode).toBe(201);expect(replay.json().id).toBe(first.json().id);
  const conflict=await system.app.inject({method:'POST',url:'/api/v1/integrations/payables',headers:auth(t,key),payload:payableBody(1,{amount:{atomic:'9999999',token:'DEMO'}})});expect(conflict.statusCode).toBe(409);expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  const missing=await system.app.inject({method:'POST',url:'/api/v1/integrations/payables',headers:auth(t),payload:payableBody(1)});expect(missing.json().error.code).toBe('IDEMPOTENCY_REQUIRED');
  const again=await importPayable(t,1,{amount:{atomic:'2000000',token:'DEMO'}});expect(again.statusCode).toBe(409);expect(again.json().error.code).toBe('PAYABLE_EXISTS');
  const bad=await importPayable(t,2,{amount:{atomic:'1.5',token:'DEMO'}});expect(bad.json().error.code).toBe('SCHEMA_INVALID');
  const lookup=await system.app.inject({method:'GET',url:'/api/v1/integrations/payables/acme-erp/payable-1',headers:auth(t)});expect(lookup.json().id).toBe(first.json().id);
 });
 it('runs an ERP invoice through the same checks and stops at human approval',async()=>{
  const t=token().token;await importPayable(t);
  const created=await submitInvoice(t);expect(created.statusCode).toBe(201);expect(created.json().status).toBe('PROCESSING');
  await system.service.analyze('northstar-demo',created.json().id);
  const view=(await system.app.inject({method:'GET',url:`/api/v1/integrations/cases/${created.json().id}`,headers:auth(t)})).json();
  expect(view).toMatchObject({status:'READY_FOR_APPROVAL',payable:{externalId:'payable-1',sourceSystem:'acme-erp'},proposal:null,execution:null,approval:{required:true}});
  expect(view.checks.length).toBeGreaterThan(5);expect(view.checks.every((c:{passed:boolean})=>c.passed)).toBe(true);expect(view.approval.approvalUrl).toContain(`/workflow?case=${view.id}`);
  const analysis=await system.app.inject({method:'POST',url:`/api/v1/integrations/cases/${view.id}/analysis`,headers:auth(t,'rerun-1'),payload:{}});expect(analysis.statusCode).toBe(202);expect(analysis.json().status).toBe('ACCEPTED');
 });
 it('holds a redirected recipient and a supplier unknown to the payment contract',async()=>{
  const t=token().token;await importPayable(t,1);await importPayable(t,2,{supplier:{externalId:'sup-new',name:'New Supplier',recipient:account(7).address,version:'1'}});
  const redirected=await submitInvoice(t,1,invoice(1,account(9).address.toLowerCase()));await system.service.analyze('northstar-demo',redirected.json().id);
  const r=(await system.app.inject({method:'GET',url:`/api/v1/integrations/cases/${redirected.json().id}`,headers:auth(t)})).json();expect(r.status).toBe('NEEDS_REVIEW');expect(r.holdReason).toMatch(/payout wallet differs/);
  const p2=(await system.app.inject({method:'GET',url:'/api/v1/integrations/payables/acme-erp/payable-2',headers:auth(t)})).json();
  const unknown=await submitInvoice(t,2,invoice(2,account(7).address.toLowerCase(),p2.supplier.supplierKey));await system.service.analyze('northstar-demo',unknown.json().id);
  const u=(await system.app.inject({method:'GET',url:`/api/v1/integrations/cases/${unknown.json().id}`,headers:auth(t)})).json();expect(u.status).toBe('NEEDS_REVIEW');expect(u.checks.find((c:{code:string})=>c.code==='VAULT_MAPPING').passed).toBe(false);
 });
 it('isolates tenants and cannot reach payment authority routes',async()=>{
  const t=token().token;await importPayable(t);const created=(await submitInvoice(t)).json();
  system.db.prepare('INSERT INTO tenants VALUES(?,?)').run('other-co','Other company');const other=token('other-co').token;
  expect((await system.app.inject({method:'GET',url:`/api/v1/integrations/cases/${created.id}`,headers:auth(other)})).statusCode).toBe(404);
  expect((await system.app.inject({method:'GET',url:'/api/v1/integrations/payables/acme-erp/payable-1',headers:auth(other)})).statusCode).toBe(404);
  // Bearer tokens are not sessions: proposal, signature import and execution routes stay closed.
  for(const url of [`/api/v1/cases/${created.id}/proposals`,`/api/v1/authorizations/${randomUUID()}/execute`])expect((await system.app.inject({method:'POST',url,headers:{...auth(t,'x'),origin:'http://localhost:5173'},payload:{expectedVersion:1}})).statusCode).toBe(401);
  expect((await system.app.inject({method:'GET',url:`/api/v1/integrations/executions/${randomUUID()}`,headers:auth(t)})).statusCode).toBe(404);
 });
});
