import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPublicClient, http, keccak256 } from 'viem';
import { deploymentSchema, paymentGuardAbi, demoTokenAbi, derivePolicy, type Deployment } from '../packages/chain/src/index.js';

export async function preflight(manifest: Deployment, rpcUrl = manifest.rpcUrl) {
  const m=deploymentSchema.parse(manifest); const client=createPublicClient({transport:http(rpcUrl,{timeout:10000,retryCount:1})});
  const checks:Array<{check:string;pass:boolean;actual:string}>=[];
  const check=(name:string,pass:boolean,actual:unknown)=>checks.push({check:name,pass,actual:String(actual)});
  const chainId=await client.getChainId(); check('RPC chain matches pin and P0 allowlist',String(chainId)===m.chainId&&[31337,43113].includes(chainId),chainId);
  if(!checks[0]!.pass)throw new Error('Wrong RPC chain; no signing or broadcasting permitted');
  const [code,tokenCode,block]=await Promise.all([client.getCode({address:m.vault}),client.getCode({address:m.token}),client.getBlock()]);
  check('Vault runtime bytecode',!!code&&keccak256(code)===m.runtimeCodeHash,code?keccak256(code):'missing');
  check('Token runtime bytecode',!!tokenCode&&keccak256(tokenCode)===m.tokenRuntimeCodeHash,tokenCode?keccak256(tokenCode):'missing');
  const expected={token:m.token,approver:m.approver,maxPerPaymentAtomic:m.maxPerPaymentAtomic,maxAuthorizationTTL:m.maxAuthorizationTTL,registryHash:m.registryHash,policyId:m.policyId};
  for(const name of Object.keys(expected) as Array<keyof typeof expected>){const value=await client.readContract({address:m.vault,abi:paymentGuardAbi,functionName:name});check(name,String(value).toLowerCase()===expected[name],value);}
  const policy=derivePolicy(m);check('TypeScript policy',policy.policyId===m.policyId&&policy.registryHash===m.registryHash,policy.policyId);
  for(const row of m.registry){const actual=await client.readContract({address:m.vault,abi:paymentGuardAbi,functionName:'supplierRecipient',args:[row.supplierKey]});check('supplier '+row.supplierKey,actual.toLowerCase()===row.recipient,actual);}
  const [decimals,supply,balance,relayerGas,approverGas]=await Promise.all([
    client.readContract({address:m.token,abi:demoTokenAbi,functionName:'decimals'}),client.readContract({address:m.token,abi:demoTokenAbi,functionName:'totalSupply'}),
    client.readContract({address:m.token,abi:demoTokenAbi,functionName:'balanceOf',args:[m.vault]}),client.getBalance({address:m.roles.relayer}),client.getBalance({address:m.approver})]);
  check('DEMO decimals',decimals===6,decimals);check('DEMO fixed supply',supply===1000000000000n,supply);
  check('Vault has liquidity',balance>0n,balance);check('Relayer gas funded',relayerGas>0n,relayerGas);check('Approver cancellation gas funded',approverGas>0n,approverGas);
  return {passed:checks.every(c=>c.pass),chainId:String(chainId),blockNumber:block.number.toString(),observedChainTimestamp:block.timestamp.toString(),vaultBalanceAtomic:balance.toString(),checks};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const fuji=process.argv.includes('--fuji');const file=fuji?(process.env.FUJI_DEPLOYMENT_MANIFEST_PATH??'deployments/fuji.json'):(process.env.DEPLOYMENT_MANIFEST_PATH??'deployments/local.json');
  try{const m=deploymentSchema.parse(JSON.parse(await readFile(file,'utf8')));if(fuji&&m.chainId!=='43113')throw new Error('Fuji preflight refuses a local manifest');const result=await preflight(m,fuji?(process.env.FUJI_RPC_URL??m.rpcUrl):(process.env.RPC_URL??m.rpcUrl));console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;}
  catch(e){console.error(`Preflight blocked: ${e instanceof Error?e.message:String(e)}. Fuji requires separate deployer/approver/relayer/supplier addresses, funded test AVAX wallets and a receipt-derived Fuji manifest.`);process.exitCode=1;}
}
