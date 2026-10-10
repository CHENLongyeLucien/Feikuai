import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {dirname,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createPublicClient,createWalletClient,http,keccak256,type Address} from 'viem';
import {foundry} from 'viem/chains';
import {deploymentSchema,derivePolicy,paymentGuardAbi,demoTokenAbi,type Deployment} from '@secure-finance/chain';

/** Isolated, valueless test deployments. Does not reset the demo or mutate its manifest. */
export async function createTestDeployment(path:string):Promise<Deployment>{
 const templatePath=process.env.SF_INTEGRATION_MANIFEST_PATH??'var/experience-demo/deployment.json';
 const source=deploymentSchema.parse(JSON.parse(readFileSync(templatePath,'utf8')));
 const template=deploymentSchema.parse({...source,rpcUrl:process.env.SF_INTEGRATION_RPC_URL??source.rpcUrl});
 const rpc=new URL(template.rpcUrl);
 if(template.environment!=='local'||template.chainId!=='31337'||rpc.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(rpc.hostname)||rpc.username||rpc.password)throw new Error('Integration tests require an explicit loopback Anvil deployment');
 if(!realpathSync(dirname(path)).startsWith(realpathSync(tmpdir())+sep)||resolve(path)===resolve(templatePath))throw new Error('Integration output must be a new manifest inside the temporary directory');
 const client=createPublicClient({chain:foundry,transport:http(template.rpcUrl,{timeout:10000,retryCount:0})});if(await client.getChainId()!==31337)throw new Error('Integration test mainnet/public-chain guard');
 const wallet=createWalletClient({chain:foundry,transport:http(template.rpcUrl)}),account=template.roles.deployer;
 const tokenArtifact=JSON.parse(readFileSync('contracts/out/DemoToken.sol/DemoToken.json','utf8')),vaultArtifact=JSON.parse(readFileSync('contracts/out/PaymentGuard.sol/PaymentGuard.json','utf8'));
 const tokenTx=await wallet.deployContract({account,abi:demoTokenAbi,bytecode:tokenArtifact.bytecode.object,args:[account]});const tokenReceipt=await client.waitForTransactionReceipt({hash:tokenTx});if(tokenReceipt.status!=='success'||!tokenReceipt.contractAddress)throw new Error('Test token deployment failed');const token=tokenReceipt.contractAddress.toLowerCase() as Address;
 const vaultTx=await wallet.deployContract({account,abi:paymentGuardAbi,bytecode:vaultArtifact.bytecode.object,args:[token,template.approver,BigInt(template.maxPerPaymentAtomic),BigInt(template.maxAuthorizationTTL),template.registry.map(r=>r.supplierKey),template.registry.map(r=>r.recipient)]});const vaultReceipt=await client.waitForTransactionReceipt({hash:vaultTx});if(vaultReceipt.status!=='success'||!vaultReceipt.contractAddress)throw new Error('Test vault deployment failed');const vault=vaultReceipt.contractAddress.toLowerCase() as Address;
 const funding=await wallet.writeContract({account,address:token,abi:demoTokenAbi,functionName:'transfer',args:[vault,300_000_000_000n]});if((await client.waitForTransactionReceipt({hash:funding})).status!=='success')throw new Error('Test funding failed');
 const policy=derivePolicy({...template,token});const deployment=deploymentSchema.parse({...template,token,vault,policyId:policy.policyId,registryHash:policy.registryHash,runtimeCodeHash:keccak256((await client.getCode({address:vault}))!),tokenRuntimeCodeHash:keccak256((await client.getCode({address:token}))!),deploymentBlock:String(vaultReceipt.blockNumber),transactions:{token:tokenTx,vault:vaultTx,funding}});
 writeFileSync(path,JSON.stringify(deployment,null,2));return deployment;
}
