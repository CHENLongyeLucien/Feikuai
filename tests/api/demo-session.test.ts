import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig} from '../../apps/api/src/config.js';
import {buildApp} from '../../apps/api/src/app.js';
import {seed} from '../../apps/api/src/db/seed.js';
import {demoLoginAvailable} from '../../apps/api/src/security/demo.js';

let dir:string,system:Awaited<ReturnType<typeof buildApp>>;
beforeEach(async()=>{
 dir=mkdtempSync(join(tmpdir(),'sf-demo-session-'));
 const config=loadConfig({NODE_ENV:'test',APP_ENV:'local',CHAIN_ID:'31337',API_HOST:'127.0.0.1',RPC_URL:'http://127.0.0.1:18545',WEB_ORIGIN:'http://localhost:5183',DATABASE_PATH:join(dir,'db.sqlite'),ARTIFACT_ROOT:join(dir,'artifacts'),DEPLOYMENT_MANIFEST_PATH:'deployments/local.json',TRUSTED_REGISTRY_PATH:'fixtures/trusted-registry.local.json',AGENT_MODE:'fixture',SEED_ON_START:'false',ENABLE_DEMO_ROUTES:'true',AUTOMATION_MANIFEST_PATH:'',AUTOMATION_EXECUTOR_PRIVATE_KEY:''});
 system=await buildApp({config,worker:false});seed(system.db,config);
});
afterEach(async()=>{await system.app.close();rmSync(dir,{recursive:true,force:true});});
describe('deliberate local demo access',()=>{
 it('opens the preseeded local workspace without creating a payment signature',async()=>{
  const response=await system.app.inject({method:'POST',url:'/api/v1/auth/demo',headers:{origin:system.config.WEB_ORIGIN},payload:{}});
  expect(response.statusCode).toBe(200);expect(response.json().authenticated).toBe(true);expect(response.json().user.roles).toContain('reviewer');
  const cookie=response.cookies.find(c=>c.name==='sf_session')!;
  const session=await system.app.inject({url:'/api/v1/session',headers:{cookie:`sf_session=${cookie.value}`}});
  expect(session.json().authenticated).toBe(true);expect(session.json().csrfToken).toBe(response.json().csrfToken);
  expect((system.db.prepare('SELECT COUNT(*) count FROM authorizations').get() as any).count).toBe(0);
  expect(response.headers['set-cookie']).toContain('HttpOnly');
 });
 it('rejects cross-origin and nonlocal clients',async()=>{
  expect((await system.app.inject({method:'POST',url:'/api/v1/auth/demo',headers:{origin:'https://untrusted.example'},payload:{}})).statusCode).toBe(403);
  expect((await system.app.inject({method:'POST',url:'/api/v1/auth/demo',remoteAddress:'192.0.2.10',headers:{origin:system.config.WEB_ORIGIN},payload:{}})).statusCode).toBe(403);
 });
 it.each([
  {APP_ENV:'fuji',CHAIN_ID:'43113',ENABLE_DEMO_ROUTES:false},
  {NODE_ENV:'production'},
  {ENABLE_DEMO_ROUTES:false},
  {RPC_URL:'https://api.avax-test.network/ext/bc/C/rpc'},
  {API_HOST:'0.0.0.0'},
  {WEB_ORIGIN:'https://finance.example'},
 ])('cannot enable convenience access outside the isolated scope: %o',override=>{expect(demoLoginAvailable({...system.config,...override} as any)).toBe(false);});
 it('still requires session-bound CSRF for subsequent mutations',async()=>{
  const response=await system.app.inject({method:'POST',url:'/api/v1/auth/demo',headers:{origin:system.config.WEB_ORIGIN},payload:{}});
  const cookie=response.cookies.find(c=>c.name==='sf_session')!;
  const result=await system.app.inject({method:'POST',url:'/api/v1/inbox',headers:{origin:system.config.WEB_ORIGIN,cookie:`sf_session=${cookie.value}`,'idempotency-key':'no-csrf'},payload:{channel:'text',text:'Please confirm receipt of the invoice.'}});
  expect(result.statusCode).toBe(403);expect(result.json().error.code).toBe('CSRF_INVALID');
 });
});
