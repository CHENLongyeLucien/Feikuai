import 'dotenv/config';
import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createPublicClient,http,keccak256} from 'viem';
import {deploymentSchema,demoTokenAbi,paymentGuardAbi} from '@secure-finance/chain';
import {loadConfig} from '../apps/api/src/config.js';
let failures=0;
function report(name:string,state:'PASS'|'MISSING'|'BLOCKED'|'INFO',detail:string){console.log(`${state.padEnd(8)} ${name}: ${detail}`);if(state==='BLOCKED')failures++;}
report('Runtime',process.version==='v24.14.0'?'PASS':'BLOCKED',`${process.version}; required v24.14.0`);
const foundry=spawnSync(process.execPath,['scripts/foundry.mjs','forge','--version'],{encoding:'utf8'});report('Foundry',foundry.status===0?'PASS':'BLOCKED',foundry.stdout.trim().split('\n')[0]??'unavailable');
try{const config=loadConfig();report('Environment','PASS',`${config.APP_ENV} / ${config.AGENT_MODE} / synthetic; mainnet disabled`);
 for(const name of ['OPENAI_API_KEY','OPENAI_MODEL','RELAYER_PRIVATE_KEY','SESSION_SECRET'] as const)report(name,config[name]?'PASS':(name==='RELAYER_PRIVATE_KEY'||name==='SESSION_SECRET'||name.startsWith('OPENAI')&&config.AGENT_MODE==='live')?'BLOCKED':'MISSING',config[name]?'configured (value hidden)':'not configured');
 if(!existsSync(config.DEPLOYMENT_MANIFEST_PATH)){report('Deployment','BLOCKED','Run contracts:deploy:local or configure a real Fuji manifest');}else{
 const manifest=deploymentSchema.parse(JSON.parse(readFileSync(config.DEPLOYMENT_MANIFEST_PATH,'utf8')));const client=createPublicClient({transport:http(config.RPC_URL,{timeout:5000,retryCount:0})});const chainId=await client.getChainId();if(String(chainId)!==config.CHAIN_ID||String(chainId)!==manifest.chainId)throw new Error('RPC/config/manifest chain mismatch');const code=await client.getCode({address:manifest.vault});if(!code||keccak256(code)!==manifest.runtimeCodeHash)throw new Error('Vault runtime code mismatch');const policy=await client.readContract({address:manifest.vault,abi:paymentGuardAbi,functionName:'policyId'});if(policy!==manifest.policyId)throw new Error('Onchain policy mismatch');report('Deployment','PASS',`chain ${chainId}; vault ${manifest.vault}`);const balance=await client.readContract({address:manifest.token,abi:demoTokenAbi,functionName:'balanceOf',args:[manifest.vault]});report('Vault liquidity',balance>0n?'PASS':'BLOCKED',`${balance} atomic DEMO`);
 const relayerBalance=await client.getBalance({address:manifest.roles.relayer});report('Relayer gas',relayerBalance>0n?'PASS':'BLOCKED',`${relayerBalance} wei`);
 }
 report('Trusted registry',existsSync(config.TRUSTED_REGISTRY_PATH)?'PASS':'BLOCKED',config.TRUSTED_REGISTRY_PATH);
 report('Local relayer configuration','INFO','Set RELAYER_PRIVATE_KEY to the dedicated local-only account 2 key in private .env, or use documented local fixture configuration. Never configure the approver key on the server.');
}catch(e){report('Configuration/RPC','BLOCKED',e instanceof Error?e.message:'unavailable');}
report('Fuji/live acceptance','INFO','No claim of live model execution or Fuji settlement follows from local tests.');
process.exitCode=failures?1:0;
