import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createPublicClient, http, keccak256, toHex, type Address, type Hex } from 'viem';
import { deploymentSchema, derivePolicy } from '../packages/chain/src/index.js';
import { preflight } from './chain-preflight.js';

const required=['FUJI_DEPLOYER_ADDRESS','FUJI_APPROVER_ADDRESS','FUJI_RELAYER_ADDRESS','FUJI_SUPPLIER_1_ADDRESS','FUJI_SUPPLIER_2_ADDRESS'] as const;
const missing=required.filter(name=>!process.env[name]);
if(missing.length)throw new Error(`Fuji deployment blocked: configure public roles ${missing.join(', ')}. Import sf-fuji-deployer into Foundry encrypted keystore; fund deployer, relayer and approver with test AVAX. Never supply the approver private key to this process.`);
const roles=required.map(name=>process.env[name]!.toLowerCase() as Address);
if(roles.some(a=>!/^0x[0-9a-f]{40}$/.test(a)||BigInt(a)===0n)||new Set(roles).size!==5)throw new Error('Distinct, valid nonzero role addresses required');
const knownLocal=['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266','0x70997970c51812dc3a010c7d01b50e0d17dc79c8','0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc','0x90f79bf6eb2c4f870365e785982e1f101e93b906','0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'];
if(roles.some(a=>knownLocal.includes(a)))throw new Error('Known local Anvil roles forbidden on Fuji');
const [deployer,approver,relayer,supplier1,supplier2]=roles as [Address,Address,Address,Address,Address];
const rpcUrl=process.env.FUJI_RPC_URL??'https://api.avax-test.network/ext/bc/C/rpc';
const client=createPublicClient({transport:http(rpcUrl,{timeout:15000,retryCount:1})});
if(await client.getChainId()!==43113)throw new Error('Fuji deployment refuses non43113 RPC');
if(existsSync('deployments/fuji.json')){const m=deploymentSchema.parse(JSON.parse(await readFile('deployments/fuji.json','utf8')));console.log(JSON.stringify(await preflight(m,rpcUrl),null,2));console.log('Existing deployment retained. No new deployment.');process.exit(0);}
const runFile='contracts/broadcast/DeployFuji.s.sol/43113/run-latest.json';
const broadcast=process.argv.includes('--broadcast'),resume=process.argv.includes('--resume'),recover=process.argv.includes('--recover-manifest');
if(existsSync(runFile)&&!resume&&!recover)throw new Error('Prior Fuji broadcast journal exists. Use --recover-manifest to recover receipts or --resume to resume existing transactions after inspection; refusing duplicate vault.');
if(!recover){
  const args=['scripts/foundry.mjs','forge','script','--root','contracts','contracts/script/DeployFuji.s.sol:DeployFuji','--rpc-url',rpcUrl,'--account','sf-fuji-deployer','--sender',deployer];
  if(broadcast)args.push('--broadcast');if(resume)args.push('--resume');
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});if(result.status!==0)process.exit(result.status??1);
  if(!broadcast){console.log('Simulation only; no Fuji manifest or deployment claimed. Review roles and rerun with --broadcast to deploy synthetic DEMO.');process.exit(0);}
}
const journal=JSON.parse(await readFile(runFile,'utf8')) as {transactions:Array<{hash:Hex;transactionType:string;contractName:string;contractAddress:Address}>};
const tokenTx=journal.transactions.find(t=>t.transactionType==='CREATE'&&t.contractName==='DemoToken');const vaultTx=journal.transactions.find(t=>t.transactionType==='CREATE'&&t.contractName==='PaymentGuard');const fundingTx=journal.transactions.find(t=>t.transactionType==='CALL');
if(!tokenTx||!vaultTx||!fundingTx)throw new Error('Incomplete deployment journal: recover existing receipts before any redeployment');
const receipts=await Promise.all([tokenTx,vaultTx,fundingTx].map(t=>client.getTransactionReceipt({hash:t.hash})));
if(receipts.some(r=>r.status!=='success'))throw new Error('Deployment/funding receipt missing or reverted; inspect journal');
const token=tokenTx.contractAddress.toLowerCase() as Address,vault=vaultTx.contractAddress.toLowerCase() as Address;
const registry=[{supplierKey:keccak256(toHex('northstar-supplier-1')),recipient:supplier1},{supplierKey:keccak256(toHex('northstar-supplier-2')),recipient:supplier2}].sort((a,b)=>a.supplierKey.localeCompare(b.supplierKey));
const config={token,approver,maxPerPaymentAtomic:'50000000000',maxAuthorizationTTL:'600',registry};const policy=derivePolicy(config);
const manifest=deploymentSchema.parse({schemaVersion:'secure-finance.deployment.v1',environment:'fuji',chainId:'43113',rpcUrl,vault,...config,roles:{deployer,approver,relayer,suppliers:[supplier1,supplier2]},registryHash:policy.registryHash,policyId:policy.policyId,runtimeCodeHash:keccak256((await client.getCode({address:vault}))!),tokenRuntimeCodeHash:keccak256((await client.getCode({address:token}))!),deploymentBlock:receipts[1]!.blockNumber.toString(),transactions:{token:tokenTx.hash,vault:vaultTx.hash,funding:fundingTx.hash},build:{solidity:'0.8.37',openzeppelin:JSON.parse(await readFile('node_modules/@openzeppelin/contracts/package.json','utf8')).version,evmVersion:'cancun',optimizerRuns:200,viaIR:true,foundry:'1.8.1'}});
const check=await preflight(manifest,rpcUrl);await mkdir('deployments',{recursive:true});await writeFile('deployments/fuji.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('docs/fuji-deployment-checks.json',JSON.stringify(check,null,2)+'\n');console.log(JSON.stringify({manifest:'deployments/fuji.json',...check},null,2));if(!check.passed)process.exitCode=1;
