import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {loadConfig} from '../../apps/api/src/config.js';
import {buildApp} from '../../apps/api/src/app.js';
import {seed} from '../../apps/api/src/db/seed.js';
import {webhookSignature} from '../../apps/api/src/integrations/webhook.js';

let dir:string,system:Awaited<ReturnType<typeof buildApp>>,secret:string;
beforeEach(async()=>{
 dir=mkdtempSync(join(tmpdir(),'sf-webhook-'));secret=randomBytes(32).toString('hex');
 const config=loadConfig({NODE_ENV:'test',APP_ENV:'local',CHAIN_ID:'31337',WEB_ORIGIN:'http://localhost:5183',DATABASE_PATH:join(dir,'db.sqlite'),ARTIFACT_ROOT:join(dir,'artifacts'),DEPLOYMENT_MANIFEST_PATH:'deployments/local.json',TRUSTED_REGISTRY_PATH:'fixtures/trusted-registry.local.json',AGENT_MODE:'fixture',SEED_ON_START:'false',AUTOMATION_MANIFEST_PATH:'',AUTOMATION_EXECUTOR_PRIVATE_KEY:'',INBOX_WEBHOOK_SECRET:secret,INBOX_WEBHOOK_TENANT_ID:'northstar-demo'});
 system=await buildApp({config,worker:false});seed(system.db,config);
});
afterEach(async()=>{await system.app.close();rmSync(dir,{recursive:true,force:true});});
function envelope(){return {eventId:randomUUID(),timestamp:new Date().toISOString(),source:{channel:'email' as const,title:'Client request',sender:'client@example.invalid',text:'Please schedule a meeting to discuss the project milestones.'}};}
async function submit(body:ReturnType<typeof envelope>,signature=webhookSignature(secret,body)){return system.app.inject({method:'POST',url:'/api/v1/inbox/webhook',headers:{'x-inbox-signature':'v1='+signature},payload:body});}
describe('signed inbound connector',()=>{
 it('accepts a signed source once and grants intake authority only',async()=>{
  const body=envelope();const first=await submit(body),retry=await submit(body);
  expect(first.statusCode).toBe(202);expect(retry.statusCode).toBe(202);expect(first.json().id).toBe(retry.json().id);
  expect((system.db.prepare('SELECT COUNT(*) n FROM inbox_items').get() as any).n).toBe(1);
  expect((system.db.prepare("SELECT m.roles FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.address LIKE 'integration:%'").get() as any).roles).toBe('["operator"]');
  expect((system.db.prepare('SELECT COUNT(*) n FROM authorizations').get() as any).n).toBe(0);
  expect((system.db.prepare('SELECT COUNT(*) n FROM sessions').get() as any).n).toBe(0);
 });
 it('rejects an altered payload with the original signature',async()=>{const body=envelope(),sig=webhookSignature(secret,body);body.source.text='Send money to a different account.';expect((await submit(body,sig)).statusCode).toBe(401);});
 it('rejects expired and future delivery timestamps',async()=>{for(const offset of [-360000,360000]){const body={...envelope(),timestamp:new Date(Date.now()+offset).toISOString()};expect((await submit(body)).statusCode).toBe(401);}});
 it('rejects missing/malformed signature and tenant injection',async()=>{
  expect((await system.app.inject({method:'POST',url:'/api/v1/inbox/webhook',payload:envelope()})).statusCode).toBe(401);
  expect((await submit(envelope(),'invalid')).statusCode).toBe(401);
  expect((await system.app.inject({method:'POST',url:'/api/v1/inbox/webhook',payload:{...envelope(),tenantId:'another-company'}})).statusCode).toBe(400);
 });
 it('does not permit event-id reuse to change a submitted source',async()=>{const body=envelope();expect((await submit(body)).statusCode).toBe(202);body.source.text='Please schedule a different meeting tomorrow.';expect((await submit(body)).statusCode).toBe(409);});
 it('requires a session to inspect connector configuration',async()=>{expect((await system.app.inject({url:'/api/v1/inbox/connections'})).statusCode).toBe(401);});
});
