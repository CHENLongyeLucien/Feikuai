import 'dotenv/config';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Address, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { deploymentSchema, derivePolicy, paymentGuardAbi, demoTokenAbi } from '../packages/chain/src/index.js';

const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const url = new URL(rpcUrl);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Local deployment requires a loopback RPC');
const client = createPublicClient({chain:foundry,transport:http(rpcUrl)});
if (await client.getChainId() !== 31337) throw new Error('Local deployment requires RPC chain31337');
const wallet = createWalletClient({chain:foundry,transport:http(rpcUrl)});
const accounts = await wallet.getAddresses();
if (accounts.length < 5) throw new Error('Start an isolated Anvil with at least five unlocked local accounts');
const [deployer,approver,relayer,supplier1,supplier2] = accounts.map(a => a.toLowerCase() as Address) as [Address,Address,Address,Address,Address];
await mkdir('deployments',{recursive:true}); await mkdir('var',{recursive:true});
const manifestPath='deployments/local.json';
try {
  const existing=deploymentSchema.parse(JSON.parse(await readFile(manifestPath,'utf8')));
  const code=await client.getCode({address:existing.vault});
  if(code && keccak256(code)===existing.runtimeCodeHash) { console.log(`Existing local deployment verified: ${existing.vault}. No new deployment or funding.`); process.exit(0); }
} catch { /* Missing manifest or new isolated local chain. Never applies to Fuji. */ }
type Journal={token?:Hex;vault?:Hex;funding?:Hex};
let journal:Journal={};
try { journal=JSON.parse(await readFile('var/local-deployment-journal.json','utf8')); } catch { /* first deploy */ }
if(journal.token) { try { await client.getTransactionReceipt({hash:journal.token}); } catch { journal={}; } }
async function persist() { await writeFile('var/local-deployment-journal.json.tmp',JSON.stringify(journal)); await rename('var/local-deployment-journal.json.tmp','var/local-deployment-journal.json'); }
async function receipt(hash:Hex) { const r=await client.waitForTransactionReceipt({hash}); if(r.status!=='success') throw new Error(`Deployment transaction reverted: ${hash}`); return r; }
const tokenArtifact=JSON.parse(await readFile('contracts/out/DemoToken.sol/DemoToken.json','utf8'));
const guardArtifact=JSON.parse(await readFile('contracts/out/PaymentGuard.sol/PaymentGuard.json','utf8'));
if(!journal.token){ journal.token=await wallet.deployContract({account:deployer,abi:demoTokenAbi,bytecode:tokenArtifact.bytecode.object,args:[deployer]}); await persist(); }
const tokenReceipt=await receipt(journal.token); const token=tokenReceipt.contractAddress!.toLowerCase() as Address;
const registry=[{supplierKey:keccak256(toHex('northstar-supplier-1')),recipient:supplier1},{supplierKey:keccak256(toHex('northstar-supplier-2')),recipient:supplier2}].sort((a,b)=>a.supplierKey.localeCompare(b.supplierKey));
const config={token,approver,maxPerPaymentAtomic:'50000000000',maxAuthorizationTTL:'600',registry};
if(!journal.vault){journal.vault=await wallet.deployContract({account:deployer,abi:paymentGuardAbi,bytecode:guardArtifact.bytecode.object,args:[token,approver,50000000000n,600n,registry.map(r=>r.supplierKey),registry.map(r=>r.recipient)]});await persist();}
const vaultReceipt=await receipt(journal.vault); const vault=vaultReceipt.contractAddress!.toLowerCase() as Address;
if(!journal.funding){journal.funding=await wallet.writeContract({account:deployer,address:token,abi:demoTokenAbi,functionName:'transfer',args:[vault,300000000000n]});await persist();}
await receipt(journal.funding);
const policy=derivePolicy(config);
const chainPolicy=await client.readContract({address:vault,abi:paymentGuardAbi,functionName:'policyId'});
if(chainPolicy!==policy.policyId)throw new Error('Solidity/TypeScript policy mismatch');
const openzeppelin=JSON.parse(await readFile('node_modules/@openzeppelin/contracts/package.json','utf8')).version;
const manifest=deploymentSchema.parse({schemaVersion:'secure-finance.deployment.v1',environment:'local',chainId:'31337',rpcUrl,vault,...config,roles:{deployer,approver,relayer,suppliers:[supplier1,supplier2]},registryHash:policy.registryHash,policyId:policy.policyId,runtimeCodeHash:keccak256((await client.getCode({address:vault}))!),tokenRuntimeCodeHash:keccak256((await client.getCode({address:token}))!),deploymentBlock:vaultReceipt.blockNumber.toString(),transactions:{token:journal.token,vault:journal.vault,funding:journal.funding},build:{solidity:'0.8.37',openzeppelin,evmVersion:'cancun',optimizerRuns:200,viaIR:true,foundry:'1.8.1'}});
await writeFile(manifestPath+'.tmp',JSON.stringify(manifest,null,2)+'\n');await rename(manifestPath+'.tmp',manifestPath);
console.log(JSON.stringify({manifest:manifestPath,vault,token,policyId:policy.policyId,transactions:manifest.transactions},null,2));
