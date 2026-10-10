import {createPublicClient,http,decodeEventLog,keccak256,parseAbiItem,type Hex} from 'viem';
import {deploymentSchema,paymentGuardAbi,type Deployment} from '@secure-finance/chain';
import {verifyApprovalRequest,type ApprovalRequestFile} from './index.js';

export async function verifyOnlineSettlement(packet:ApprovalRequestFile,pin:Deployment,rpcUrl=pin.rpcUrl){
 const deployment=deploymentSchema.parse(pin);const p=packet.payment;const client=createPublicClient({transport:http(rpcUrl,{timeout:10000,retryCount:1})});
 try{
 const integrity=await verifyApprovalRequest(packet,deployment);if(!integrity.integrityValid)return {settlement:'MISMATCH',reason:'Packet integrity/digest verification failed',errors:integrity.errors};
 const [chain,code,tokenCode,latest]=await Promise.all([client.getChainId(),client.getCode({address:deployment.vault}),client.getCode({address:deployment.token}),client.getBlockNumber()]);
 if(String(chain)!==deployment.chainId||String(chain)!==packet.manifest.domain.chainId||!code||keccak256(code)!==deployment.runtimeCodeHash||!tokenCode||keccak256(tokenCode)!==deployment.tokenRuntimeCodeHash||packet.manifest.domain.verifyingContract!==deployment.vault)return {settlement:'MISMATCH',reason:'Pinned chain/vault/token code mismatch'};
 const event=parseAbiItem('event PaymentExecuted(bytes32 indexed invoiceKey,uint256 indexed authorizationNonce,bytes32 indexed digest,bytes32 supplierKey,address recipient,address token,uint256 amountAtomic,bytes32 evidenceCommitment,bytes32 policyId)');
 for(let from=BigInt(deployment.deploymentBlock);from<=latest;from+=2000n){const to=from+1999n>latest?latest:from+1999n;const logs=await client.getLogs({address:deployment.vault,event,args:{invoiceKey:p.invoiceKey},fromBlock:from,toBlock:to});
 for(const log of logs){if(!log.transactionHash||log.removed)continue;const receipt=await client.getTransactionReceipt({hash:log.transactionHash});const block=await client.getBlock({blockNumber:receipt.blockNumber});
 if(receipt.status!=='success'||receipt.to?.toLowerCase()!==deployment.vault||receipt.blockHash!==block.hash||receipt.transactionHash!==log.transactionHash||receipt.blockHash!==log.blockHash)return {settlement:'MISMATCH',reason:'Receipt identity/status mismatch'};
 const actual=receipt.logs.find(l=>l.logIndex===log.logIndex&&l.address.toLowerCase()===deployment.vault);if(!actual)return {settlement:'MISMATCH',reason:'Event absent from executed receipt'};
 const decoded=decodeEventLog({abi:paymentGuardAbi,eventName:'PaymentExecuted',data:actual.data,topics:actual.topics});const a=decoded.args as Record<string,unknown>;
 for(const [field,value] of Object.entries({...p,digest:packet.typedDigest})){if(field==='issuedAt'||field==='deadline')continue;if(String(a[field]).toLowerCase()!==value.toLowerCase())return {settlement:'MISMATCH',reason:`Payment event mismatch: ${field}`};}
 const [digest,nonce]=await Promise.all([client.readContract({address:deployment.vault,abi:paymentGuardAbi,functionName:'invoiceSettlementDigest',args:[p.invoiceKey]}),client.readContract({address:deployment.vault,abi:paymentGuardAbi,functionName:'nonceState',args:[BigInt(p.authorizationNonce)]})]);
 if(digest!==packet.typedDigest||Number(nonce)!==1)return {settlement:'MISMATCH',reason:'Consumption state mismatch'};
 const transfer=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');let found=false;
 for(const item of receipt.logs){if(item.address.toLowerCase()!==deployment.token)continue;try{const t=decodeEventLog({abi:[transfer],data:item.data,topics:item.topics}).args;if(t.from.toLowerCase()===deployment.vault&&t.to.toLowerCase()===p.recipient&&t.value===BigInt(p.amountAtomic))found=true;}catch{/* unrelated token event */}}
 if(!found)return {settlement:'MISMATCH',reason:'Exact token Transfer evidence absent'};
 return {settlement:'VERIFIED_ONCHAIN',chainId:String(chain),rpcUrl,transactionHash:receipt.transactionHash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash,logIndex:log.logIndex,observedAt:new Date().toISOString(),gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.effectiveGasPrice.toString(),feeWei:(receipt.gasUsed*receipt.effectiveGasPrice).toString()};
 }}
 return {settlement:'NOT_FOUND',chainId:String(chain),throughBlock:String(latest),observedAt:new Date().toISOString()};
 }catch(error){return {settlement:'RPC_UNAVAILABLE',reason:error instanceof Error?error.message:'RPC unavailable'};}
}
