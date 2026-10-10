import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,createWalletClient,http,keccak256,type Address} from 'viem';
import {foundry} from 'viem/chains';
import {deploymentSchema,derivePolicy,paymentGuardAbi,demoTokenAbi,type Deployment} from '@secure-finance/chain';

/** Isolated, valueless test deployments. Does not reset the demo or mutate its manifest. */
export async function createTestDeployment(path:string):Promise<Deployment>{
 const template=deploymentSchema.parse(JSON.parse(readFileSync('deployments/local.json','utf8')));
 if(template.chainId!=='31337'||!['127.0.0.1','localhost'].includes(new URL(template.rpcUrl).hostname))throw new Error('Integration tests require loopback Anvil');
 const client=createPublicClient({chain:foundry,transport:http(template.rpcUrl)});if(await client.getChainId()!==31337)throw new Error('Integration test mainnet/public-chain guard');
 const wallet=createWalletClient({chain:foundry,transport:http(template.rpcUrl)}),account=template.roles.deployer;
 const tokenArtifact=JSON.parse(readFileSync('contracts/out/DemoToken.sol/DemoToken.json','utf8')),vaultArtifact=JSON.parse(readFileSync('contracts/out/PaymentGuard.sol/PaymentGuard.json','utf8'));
 const tokenTx=await wallet.deployContract({account,abi:demoTokenAbi,bytecode:tokenArtifact.bytecode.object,args:[account]});const tokenReceipt=await client.waitForTransactionReceipt({hash:tokenTx});if(tokenReceipt.status!=='success'||!tokenReceipt.contractAddress)throw new Error('Test token deployment failed');const token=tokenReceipt.contractAddress.toLowerCase() as Address;
 const vaultTx=await wallet.deployContract({account,abi:paymentGuardAbi,bytecode:vaultArtifact.bytecode.object,args:[token,template.approver,BigInt(template.maxPerPaymentAtomic),BigInt(template.maxAuthorizationTTL),template.registry.map(r=>r.supplierKey),template.registry.map(r=>r.recipient)]});const vaultReceipt=await client.waitForTransactionReceipt({hash:vaultTx});if(vaultReceipt.status!=='success'||!vaultReceipt.contractAddress)throw new Error('Test vault deployment failed');const vault=vaultReceipt.contractAddress.toLowerCase() as Address;
 const funding=await wallet.writeContract({account,address:token,abi:demoTokenAbi,functionName:'transfer',args:[vault,300_000_000_000n]});if((await client.waitForTransactionReceipt({hash:funding})).status!=='success')throw new Error('Test funding failed');
 const policy=derivePolicy({...template,token});const deployment=deploymentSchema.parse({...template,token,vault,policyId:policy.policyId,registryHash:policy.registryHash,runtimeCodeHash:keccak256((await client.getCode({address:vault}))!),tokenRuntimeCodeHash:keccak256((await client.getCode({address:token}))!),deploymentBlock:String(vaultReceipt.blockNumber),transactions:{token:tokenTx,vault:vaultTx,funding}});
 writeFileSync(path,JSON.stringify(deployment,null,2));return deployment;
}
