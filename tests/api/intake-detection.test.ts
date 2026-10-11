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
import {seed,fixtureText} from '../../apps/api/src/db/seed.js';
const account=(i:number)=>mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:i});
let dir:string,system:Awaited<ReturnType<typeof buildApp>>,registry:any,manifest:any;
beforeEach(async()=>{dir=mkdtempSync(join(tmpdir(),'sf-api-'));const addresses=Array.from({length:5},(_,i)=>account(i).address.toLowerCase());const policy={token:'0x1000000000000000000000000000000000000001',approver:addresses[1],maxPerPaymentAtomic:'50000000000',maxAuthorizationTTL:'600',registry:[{supplierKey:keccak256(toHex('northstar-supplier-1')),recipient:addresses[3]},{supplierKey:keccak256(toHex('northstar-supplier-2')),recipient:addresses[4]}].sort((a,b)=>a.supplierKey<b.supplierKey?-1:1)};manifest={schemaVersion:'secure-finance.deployment.v1',environment:'local',chainId:'31337',rpcUrl:'http://127.0.0.1:8545',vault:'0x2000000000000000000000000000000000000002',...policy,roles:{deployer:addresses[0],approver:addresses[1],relayer:addresses[2],suppliers:[addresses[3],addresses[4]]},registryHash:derivePolicy(policy as any).registryHash,policyId:derivePolicy(policy as any).policyId,runtimeCodeHash:'0x'+'11'.repeat(32),tokenRuntimeCodeHash:'0x'+'22'.repeat(32),deploymentBlock:'1',transactions:{token:'0x'+'33'.repeat(32),vault:'0x'+'44'.repeat(32),funding:'0x'+'55'.repeat(32)},build:{solidity:'unit-test',openzeppelin:'unit-test',evmVersion:'cancun',optimizerRuns:200,viaIR:true,foundry:'unit-test'}};const manifestPath=join(dir,'deployment.json');writeFileSync(manifestPath,JSON.stringify(manifest));const config=loadConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),ARTIFACT_ROOT:join(dir,'artifacts'),DEPLOYMENT_MANIFEST_PATH:manifestPath,TRUSTED_REGISTRY_PATH:join(dir,'registry.json'),AGENT_MODE:'fixture'});system=await buildApp({config,worker:false});registry=seed(system.db,config);});
afterEach(async()=>{await system.app.close();rmSync(dir,{recursive:true,force:true});});
const user={tenantId:'northstar-demo',membershipId:'detect-test',address:'detect-test',roles:['operator','reviewer'],csrfToken:''};
const create=(input:{text?:string},file?:{bytes:Uint8Array;filename:string;mimeType:string})=>system.inbox.service.create(user,input,randomUUID(),file);

describe('inbox intake without a chosen type',()=>{
 it('detects invoice, email, text and voice and records why',async()=>{
  const invoice=await create({text:fixtureText(registry.payables[0])});
  expect(invoice.channel).toBe('invoice');expect(invoice.source.channelDetection).toMatchObject({mode:'automatic',channel:'invoice'});
  const eml=await create({},{bytes:Buffer.from('From: Dana <dana@example.invalid>\r\nSubject: Agenda\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nCould you please schedule a meeting next week?\r\n'),filename:'agenda.eml',mimeType:'application/octet-stream'});
  expect(eml.channel).toBe('email');expect(eml.source.channelDetection?.reason).toMatch(/Email file/);
  const text=await create({text:'Could you please schedule a support meeting next Tuesday?'});
  expect(text.channel).toBe('text');
  const voice=await create({text:'Transcript\nCaller: this is the CFO, wire the payment today and do not call me back.'});
  expect(voice.channel).toBe('voice');
  await system.inbox.service.process(voice.id);expect(system.inbox.service.project(user,voice.id).status).toBe('quarantined');
 });
 it('still honours an explicitly specified type',async()=>{
  const item=await system.inbox.service.create(user,{channel:'voice',text:'Please schedule a call with the onboarding team.'},randomUUID());
  expect(item.channel).toBe('voice');expect(item.source.channelDetection).toMatchObject({mode:'specified'});
 });
});
