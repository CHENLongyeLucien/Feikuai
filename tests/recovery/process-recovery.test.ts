import {beforeAll,describe,it,expect} from 'vitest';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {mnemonicToAccount} from 'viem/accounts';
import {createPublicClient,http} from 'viem';
import {type Deployment,paymentTypedData,demoTokenAbi} from '@secure-finance/chain';
import {loadConfig} from '../../apps/api/src/config.js';
import {openDatabase} from '../../apps/api/src/db/database.js';
import {seed} from '../../apps/api/src/db/seed.js';
import {verifyBundle} from '@secure-finance/evidence';
import {createTestDeployment} from '../support/local-chain.js';
let deployment:Deployment;let manifestPath:string;
beforeAll(async()=>{const directory=mkdtempSync(join(tmpdir(),'sf-recovery-deployment-'));manifestPath=join(directory,'deployment.json');deployment=await createTestDeployment(manifestPath);});
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until<T>(work:()=>Promise<T>,accept:(v:T)=>boolean,timeout=30000){const start=Date.now();let value:T;while(Date.now()-start<timeout){try{value=await work();if(accept(value))return value;}catch{/* process/rpc reconnect is expected */}await delay(200);}throw new Error(`Condition not reached in ${timeout}ms; last value=${JSON.stringify(value!)}`);}
describe('real process termination and durable payment outbox',()=>{
 for(const boundary of ['after-persist','after-broadcast'] as const)it(`recovers a SIGKILL ${boundary} without new authority or double settlement`,async()=>{
  expect(deployment.chainId).toBe('31337');
  const client=createPublicClient({transport:http(deployment.rpcUrl)});expect(await client.getChainId()).toBe(31337);
  // Public Anvil credentials exist exclusively in test tooling. Never sent to the server except account2 relayer key.
  const mnemonic='test test test test test test test test test test test junk';const approver=mnemonicToAccount(mnemonic,{addressIndex:1});const relayer=mnemonicToAccount(mnemonic,{addressIndex:2});
  const root=mkdtempSync(join(tmpdir(),'secure-finance-recovery-'));const port=boundary==='after-persist'?3021:3022;
  const env={...process.env,NODE_ENV:'test',APP_ENV:'local',API_HOST:'127.0.0.1',API_PORT:String(port),WEB_ORIGIN:'http://localhost:5173',CHAIN_ID:'31337',RPC_URL:deployment.rpcUrl,AGENT_MODE:'fixture',ENABLE_DEMO_ROUTES:'true',ENABLE_MAINNET:'false',DATABASE_PATH:join(root,'state.sqlite'),ARTIFACT_ROOT:join(root,'artifacts'),TRUSTED_REGISTRY_PATH:join(root,'registry.json'),DEPLOYMENT_MANIFEST_PATH:manifestPath,RELAYER_PRIVATE_KEY:relayer.getHdKey().privateKey?`0x${Buffer.from(relayer.getHdKey().privateKey!).toString('hex')}`:'',SF_JOB_LEASE_MS:'3000'};
  const config=loadConfig(env);const {db}=openDatabase(config.DATABASE_PATH);const registry=seed(db,config);db.close();const payable=registry.payables.find((p:any)=>p.scenarioId==='BENIGN-01');
  const initial=await client.readContract({address:deployment.token,abi:demoTokenAbi,functionName:'balanceOf',args:[payable.recipient]});
  let child:ChildProcess|undefined;let signal:string|null=null;let logs='';
  const launch=(crash:string)=>{const p=spawn(process.execPath,['--import','tsx','apps/api/src/index.ts'],{cwd:process.cwd(),env:{...env,SF_CRASH_AT:crash},stdio:['ignore','pipe','pipe']});p.stdout?.on('data',b=>{logs+=b});p.stderr?.on('data',b=>{logs+=b});p.on('exit',(_,s)=>{signal=s;});child=p;return p;};
  const base=`http://127.0.0.1:${port}`;let cookies:Record<string,string>={},csrf='';
  const request=async(path:string,body?:unknown,extra:Record<string,string>={})=>{const r=await fetch(base+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{origin:env.WEB_ORIGIN,cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),'content-type':'application/json','x-csrf-token':csrf,'idempotency-key':randomUUID(),...extra},body:body===undefined?undefined:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const [kv]=c.split(';');const [k,...v]=kv!.split('=');cookies[k!]=v.join('=');}const data=await r.json() as any;if(!r.ok)throw new Error(`${r.status} ${path} ${JSON.stringify(data)}`);return data;};
  try{
   launch(boundary);await until(()=>fetch(base+'/health').then(r=>r.ok),Boolean);
   const challenge=await request('/auth/challenge',{address:approver.address.toLowerCase()});const session=await request('/auth/verify',{challengeId:challenge.challengeId,signature:await approver.signMessage({message:challenge.message})});csrf=session.csrfToken;
   const created=await request('/cases',{payableId:payable.id,fixtureId:'BENIGN-01'});const caseId=created.caseId??created.id;
   let c=await until(()=>request(`/cases/${caseId}`),c=>c.workflowStatus==='READY_FOR_REVIEW');
   const frozen=await request(`/cases/${caseId}/proposals`,{expectedVersion:c.version});const packet=frozen.approvalRequest;
   c=await request(`/cases/${caseId}`);const signature=await approver.signTypedData(paymentTypedData(packet.manifest.domain,packet.payment));
   await request(`/proposals/${packet.manifest.proposalId}/authorizations`,{expectedVersion:c.version,signatureFile:{schemaVersion:'secure-finance.approval-signature.v1',proposalId:packet.manifest.proposalId,typedDigest:packet.typedDigest,signer:approver.address.toLowerCase(),signature}});
   c=await request(`/cases/${caseId}`);const key=randomUUID();const execution=await request(`/authorizations/${c.authorization.id}/execute`,{expectedVersion:c.version},{'idempotency-key':key});
   await until(async()=>signal,s=>s==='SIGKILL');expect(signal).toBe('SIGKILL');
   const persisted=openDatabase(config.DATABASE_PATH).db;const before=persisted.prepare('SELECT tx_hash,raw_transaction,relayer_account_nonce FROM tx_outbox WHERE execution_id=?').get(execution.executionId) as any;expect(before.tx_hash).toMatch(/^0x[0-9a-f]{64}$/);expect(before.raw_transaction).toMatch(/^0x/);expect(persisted.prepare('SELECT count(*) n FROM execution_requests').get()).toEqual({n:1});persisted.close();
   signal=null;launch('');await until(()=>fetch(base+'/health').then(r=>r.ok),Boolean);const done=await until(()=>request(`/cases/${caseId}`),c=>c.settlementStatus==='SETTLED',60000);expect(done.latestExecution.status).toBe('CONFIRMED');
   const finalDb=openDatabase(config.DATABASE_PATH).db;const after=finalDb.prepare('SELECT tx_hash,raw_transaction,relayer_account_nonce FROM tx_outbox WHERE execution_id=?').get(execution.executionId);expect(after).toEqual(before);expect(finalDb.prepare('SELECT count(*) n FROM settlements').get()).toEqual({n:1});expect(finalDb.prepare('SELECT count(*) n FROM proposals').get()).toEqual({n:1});finalDb.close();
   const repeated=await request(`/authorizations/${done.authorization.id}/execute`,{expectedVersion:c.version},{'idempotency-key':key});expect(repeated.executionId).toBe(execution.executionId);
   const balance=await client.readContract({address:deployment.token,abi:demoTokenAbi,functionName:'balanceOf',args:[payable.recipient]});expect(balance-initial).toBe(48_000_000_000n);
   const exported=await fetch(base+`/api/v1/cases/${caseId}/evidence`,{headers:{cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ')}});expect(exported.ok).toBe(true);const bytes=new Uint8Array(await exported.arrayBuffer());mkdirSync('var/acceptance-evidence',{recursive:true});writeFileSync(`var/acceptance-evidence/recovery-${boundary}.zip`,bytes);writeFileSync('var/acceptance-evidence/deployment.json',JSON.stringify(deployment,null,2));expect((await verifyBundle(bytes,deployment)).artifactIntegrity).toBe('VALID');
   mkdirSync('docs/results',{recursive:true});writeFileSync(`docs/results/recovery-${boundary}.json`,JSON.stringify({boundary,termination:'SIGKILL',executionId:execution.executionId,transactionHash:before.tx_hash,settlementCount:1,exactSupplierDeltaAtomic:(balance-initial).toString(),outboxPreserved:true,observedAt:new Date().toISOString()},null,2));
  }finally{child?.kill('SIGTERM');await delay(300);if(child?.exitCode===null)child.kill('SIGKILL');mkdirSync('docs/results',{recursive:true});writeFileSync(`docs/results/recovery-${boundary}.log`,logs);}
 },120000);
});
