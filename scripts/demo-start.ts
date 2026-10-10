import {spawn,type ChildProcess} from 'node:child_process';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createPublicClient,createWalletClient,http,keccak256,toHex,type Address} from 'viem';
import {foundry} from 'viem/chains';
import {mnemonicToAccount} from 'viem/accounts';
import {deploymentSchema,derivePolicy,demoTokenAbi,paymentGuardAbi} from '../packages/chain/src/index.js';
import {loadConfig} from '../apps/api/src/config.js';
import {openDatabase} from '../apps/api/src/db/database.js';
import {seed} from '../apps/api/src/db/seed.js';

// This launcher owns a separate local network and private directory. It never
// loads/writes the saved demonstration DB, Fuji environment, or public manifests.
const root=resolve('var/experience-demo');
await mkdir(root,{recursive:true,mode:0o700});
const rpc='http://127.0.0.1:18545',web='http://localhost:5183',approver='http://localhost:5184';
const children:ChildProcess[]=[];
let closing=false;
async function stop(){if(closing)return;closing=true;for(const child of [...children].reverse())child.kill('SIGTERM');}
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void stop().then(()=>setTimeout(()=>process.exit(0),1200));});
function start(args:string[],env:NodeJS.ProcessEnv=process.env,quiet=false){
 const child=spawn(process.execPath,args,{cwd:process.cwd(),env,stdio:quiet?'ignore':'inherit'});children.push(child);
 child.once('error',()=>{console.error('A demo process could not start. Check the local runtime installation.');void stop();process.exitCode=1;});
 child.once('exit',code=>{if(!closing){console.error(`A demo process stopped (${code??'signal'}). Stopping the other demo processes.`);void stop();process.exitCode=code||1;}});return child;
}
async function command(args:string[]){await new Promise<void>((ok,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?ok():reject(new Error('Demo prerequisite build failed.')));});}
async function available(url:string){try{await fetch(url,{signal:AbortSignal.timeout(400)});return true;}catch{return false;}}
for(const url of [rpc,'http://127.0.0.1:3183','http://127.0.0.1:5183','http://127.0.0.1:5184'])if(await available(url))throw new Error('An isolated demo port is already in use. Reuse the running demo or stop its launcher before starting another.');
try{
 await command(['scripts/foundry.mjs','forge','build','--root','contracts','--quiet']);
 start(['scripts/foundry.mjs','anvil','--host','127.0.0.1','--port','18545','--chain-id','31337','--hardfork','cancun','--block-time','1','--state',resolve(root,'anvil-state.json'),'--preserve-historical-states','--state-interval','15'],process.env,true);
 const client=createPublicClient({chain:foundry,transport:http(rpc,{timeout:1000,retryCount:0})});
 let ready=false;for(let n=0;n<50;n++){try{ready=await client.getChainId()===31337;if(ready)break;}catch{/* wait for owned node */}await new Promise(r=>setTimeout(r,200));}
 if(!ready)throw new Error('The isolated local chain did not become ready.');
 const wallet=createWalletClient({chain:foundry,transport:http(rpc)});
 const accounts=(await wallet.getAddresses()).map(a=>a.toLowerCase() as Address);
 const [owner,human,relayer,supplier1,supplier2,automationExecutor]=accounts as [Address,Address,Address,Address,Address,Address];
 const manifestPath=resolve(root,'deployment.json'),registryPath=resolve(root,'registry.json'),automationPath=resolve(root,'automation.json');
 let deployment:ReturnType<typeof deploymentSchema.parse>|undefined;
 try{
  deployment=deploymentSchema.parse(JSON.parse(await readFile(manifestPath,'utf8')));
  const code=await client.getCode({address:deployment.vault});
  if(!code||keccak256(code)!==deployment.runtimeCodeHash)throw new Error('Stored demo deployment does not match its saved chain. Keep its state together; no reset was performed.');
 }catch(error){
  try{await stat(manifestPath);throw error;}catch(statError){if((statError as NodeJS.ErrnoException).code!=='ENOENT')throw statError;}
 }
 if(!deployment){
  const tokenArtifact=JSON.parse(await readFile('contracts/out/DemoToken.sol/DemoToken.json','utf8'));
  const guardArtifact=JSON.parse(await readFile('contracts/out/PaymentGuard.sol/PaymentGuard.json','utf8'));
  const tokenTx=await wallet.deployContract({account:owner,abi:demoTokenAbi,bytecode:tokenArtifact.bytecode.object,args:[owner]});
  const tr=await client.waitForTransactionReceipt({hash:tokenTx});if(tr.status!=='success'||!tr.contractAddress)throw new Error('Demo token deployment failed.');
  const token=tr.contractAddress.toLowerCase() as Address;
  const registry=[{supplierKey:keccak256(toHex('northstar-supplier-1')),recipient:supplier1},{supplierKey:keccak256(toHex('northstar-supplier-2')),recipient:supplier2}].sort((a,b)=>a.supplierKey.localeCompare(b.supplierKey));
  const policy={token,approver:human,maxPerPaymentAtomic:'50000000000',maxAuthorizationTTL:'600',registry};
  const vaultTx=await wallet.deployContract({account:owner,abi:paymentGuardAbi,bytecode:guardArtifact.bytecode.object,args:[token,human,50000000000n,600n,registry.map(r=>r.supplierKey),registry.map(r=>r.recipient)]});
  const vr=await client.waitForTransactionReceipt({hash:vaultTx});if(vr.status!=='success'||!vr.contractAddress)throw new Error('Demo payment vault deployment failed.');
  const vault=vr.contractAddress.toLowerCase() as Address;
  const funding=await wallet.writeContract({account:owner,address:token,abi:demoTokenAbi,functionName:'transfer',args:[vault,300000000000n]});
  if((await client.waitForTransactionReceipt({hash:funding})).status!=='success')throw new Error('Demo funding failed.');
  deployment=deploymentSchema.parse({schemaVersion:'secure-finance.deployment.v1',environment:'local',chainId:'31337',rpcUrl:rpc,...policy,vault,roles:{deployer:owner,approver:human,relayer,suppliers:[supplier1,supplier2]},registryHash:derivePolicy(policy).registryHash,policyId:derivePolicy(policy).policyId,runtimeCodeHash:keccak256((await client.getCode({address:vault}))!),tokenRuntimeCodeHash:keccak256((await client.getCode({address:token}))!),deploymentBlock:String(vr.blockNumber),transactions:{token:tokenTx,vault:vaultTx,funding},build:{solidity:'0.8.37',openzeppelin:'5.7.0',evmVersion:'cancun',optimizerRuns:200,viaIR:true,foundry:'local installed'}});
  await writeFile(manifestPath,JSON.stringify(deployment,null,2)+'\n',{mode:0o600});
 }
 const key=(index:number)=>'0x'+Buffer.from(mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:index}).getHdKey().privateKey!).toString('hex');
 const overrides={NODE_ENV:'development',APP_ENV:'local',CHAIN_ID:'31337',API_HOST:'127.0.0.1',API_PORT:'3183',WEB_ORIGIN:web,APPROVER_ORIGIN:approver,RPC_URL:rpc,DATABASE_PATH:resolve(root,'finance.sqlite'),ARTIFACT_ROOT:resolve(root,'artifacts'),DEPLOYMENT_MANIFEST_PATH:manifestPath,TRUSTED_REGISTRY_PATH:registryPath,AGENT_MODE:'fixture',OPENAI_API_KEY:'',OPENAI_MODEL:'',RELAYER_PRIVATE_KEY:key(2),SESSION_SECRET:randomBytes(32).toString('hex'),ENABLE_DEMO_ROUTES:'true',ENABLE_MAINNET:'false',SEED_ON_START:'false',AUTOMATION_MANIFEST_PATH:automationPath,AUTOMATION_EXECUTOR_PRIVATE_KEY:key(5)};
 const config=loadConfig(overrides),{db}=openDatabase(config.DATABASE_PATH);
 const registry=seed(db,config);db.close();
 // Separate explicit standing authority. Five exact synthetic obligations are
 // registered by the policy owner; the automation executor cannot edit them.
 let automation:any;
 try{automation=JSON.parse(await readFile(automationPath,'utf8'));const code=await client.getCode({address:automation.vault});if(!code||keccak256(code)!==automation.runtimeCodeHash)throw new Error('Saved automation policy does not match the local chain.');}
 catch(error){try{await stat(automationPath);throw error;}catch(statError){if((statError as NodeJS.ErrnoException).code!=='ENOENT')throw statError;}}
 if(!automation){
  const artifact=JSON.parse(await readFile('contracts/out/AutomationGuard.sol/AutomationGuard.json','utf8'));
  const tx=await wallet.deployContract({account:owner,abi:artifact.abi,bytecode:artifact.bytecode.object,args:[deployment.token,owner,automationExecutor,50000000000n,300000000000n,deployment.registry.map(r=>r.supplierKey),deployment.registry.map(r=>r.recipient)]});
  const receipt=await client.waitForTransactionReceipt({hash:tx});if(receipt.status!=='success'||!receipt.contractAddress)throw new Error('Automatic policy deployment failed.');
  const vault=receipt.contractAddress.toLowerCase() as Address;
  const approved=registry.payables.filter((p:any)=>/^BENIGN-0[1-5]$/.test(p.scenarioId));
  const obligations=approved.map((p:any)=>({invoiceKey:p.invoiceKey,supplierKey:p.supplierKey,recipient:p.recipient,amountAtomic:BigInt(p.amountAtomic)}));
  const registrationTx=await wallet.writeContract({account:owner,address:vault,abi:artifact.abi,functionName:'registerObligations',args:[obligations]});
  if((await client.waitForTransactionReceipt({hash:registrationTx})).status!=='success')throw new Error('Standing policy registration failed.');
  const fundingTx=await wallet.writeContract({account:owner,address:deployment.token,abi:demoTokenAbi,functionName:'transfer',args:[vault,300000000000n]});
  if((await client.waitForTransactionReceipt({hash:fundingTx})).status!=='success')throw new Error('Automatic policy funding failed.');
  automation={schemaVersion:'secure-finance.automation.v1',environment:'local',chainId:'31337',rpcUrl:rpc,vault,token:deployment.token,owner,executor:automationExecutor,maxPerPaymentAtomic:'50000000000',totalBudgetAtomic:'300000000000',runtimeCodeHash:keccak256((await client.getCode({address:vault}))!),tokenRuntimeCodeHash:deployment.tokenRuntimeCodeHash,abi:artifact.abi,approvedPayableIds:approved.map((p:any)=>p.id),transactions:{deployment:tx,registration:registrationTx,funding:fundingTx},deploymentBlock:String(receipt.blockNumber)};
  await writeFile(automationPath,JSON.stringify(automation,null,2)+'\n',{mode:0o600});
 }
 const env={...process.env,...overrides,WEB_PORT:'5183',APPROVER_PORT:'5184',API_PROXY_TARGET:'http://127.0.0.1:3183',DEMO_WALLET_AVAILABLE:'true'};
 start(['--import','tsx','apps/api/src/index.ts'],env);
 start(['node_modules/vite/bin/vite.js','--config','apps/web/vite.config.ts'],env);
 start(['node_modules/vite/bin/vite.js','--config','apps/approver/vite.config.ts'],env);
 console.log(`\nSecure Finance demo: ${web}\nIndependent payment review: ${approver}\nChoose “Explore demo”, then try an example in the inbox.\nSynthetic data, fixture agents, valueless local tokens. Five exact invoices have a standing payment policy.\nExisting local and Fuji configurations are untouched. Ctrl+C stops these demo processes.\n`);
}catch(error){console.error(error instanceof Error?error.message:'Could not start the isolated demo.');await stop();process.exitCode=1;}
