import { createPublicClient, http, keccak256, type Address, type Hex } from 'viem';
import { deploymentSchema, paymentGuardAbi, demoTokenAbi, derivePolicy, type Deployment } from '@secure-finance/chain';
import { verifyApprovalRequest, type ApprovalRequestFile } from '@secure-finance/evidence';

export type Registry={schemaVersion:string;chainId:string;vault:string;token:string;suppliers:Array<{id:string;supplierKey:string;recipient:string;version:string;name:string}>;payables:Array<{id:string;invoiceKey:string;invoiceReference:string;supplierId:string;supplierKey:string;recipient:string;amountAtomic:string;token:string;version:string}>};
export async function inspectPacket(input:unknown,pinned:unknown,registry:Registry|null){
  const deployment=deploymentSchema.parse(pinned);
  const result=await verifyApprovalRequest(input,deployment);
  if(!result.integrityValid||!result.packet)return {...result,canSign:false,canCancel:false,eligibilityErrors:['Integrity or deployment verification failed'],deployment,remaining:0n};
  const packet=result.packet,p=packet.payment,m=packet.manifest;
  const errors:string[]=[];
  const payable=registry?.payables.find(v=>v.invoiceKey===p.invoiceKey);
  const supplier=registry?.suppliers.find(v=>v.supplierKey===p.supplierKey);
  if(!registry||registry.chainId!==deployment.chainId||registry.vault!==deployment.vault||registry.token!==deployment.token||!payable||!supplier||payable.id!==m.recordVersions.payableId||supplier.id!==m.recordVersions.supplierId||String(payable.version)!==m.recordVersions.payableVersion||String(supplier.version)!==m.recordVersions.supplierVersion||payable.supplierId!==supplier.id||payable.supplierKey!==p.supplierKey||payable.recipient!==p.recipient||supplier.recipient!==p.recipient||payable.token!==p.token||payable.amountAtomic!==p.amountAtomic)errors.push('BUSINESS_FACTS_MISMATCH: packet differs from independently bundled records');
  let canCancel=false,remaining=0n;
  try {
    const state=await readChainEligibility(packet,deployment);
    remaining=state.remaining;canCancel=state.configurationValid&&state.nonce===0;
    errors.push(...state.errors);
  }catch {errors.push('RPC_UNAVAILABLE: fresh pinned-chain checks required');}
  return {...result,canSign:errors.length===0,canCancel,eligibilityErrors:errors,deployment,remaining,payable,supplier};
}
export async function readChainEligibility(packet:ApprovalRequestFile,deployment:Deployment){
  const client=createPublicClient({transport:http(deployment.rpcUrl,{timeout:8000,retryCount:0})});
  const p=packet.payment;const read=(functionName:string,args?:readonly unknown[])=>client.readContract({address:deployment.vault,abi:paymentGuardAbi,functionName,args} as never) as Promise<unknown>;
  const [chain,code,block,policy,token,approver,registryHash,cap,ttl,recipient,nonce,settlement,tokenCode,decimals]=await Promise.all([client.getChainId(),client.getCode({address:deployment.vault}),client.getBlock(),read('policyId'),read('token'),read('approver'),read('registryHash'),read('maxPerPaymentAtomic'),read('maxAuthorizationTTL'),read('supplierRecipient',[p.supplierKey]),read('nonceState',[BigInt(p.authorizationNonce)]),read('invoiceSettlementDigest',[p.invoiceKey]),client.getCode({address:deployment.token}),client.readContract({address:deployment.token,abi:demoTokenAbi,functionName:'decimals'})]);
  const derived=derivePolicy(deployment);
  const configurationValid=tokenCode!==undefined&&keccak256(tokenCode)===deployment.tokenRuntimeCodeHash&&Number(decimals)===6&&String(chain)===deployment.chainId&&code!==undefined&&keccak256(code)===deployment.runtimeCodeHash&&policy===deployment.policyId&&derived.policyId===policy&&String(token).toLowerCase()===deployment.token&&String(approver).toLowerCase()===deployment.approver&&registryHash===deployment.registryHash&&String(cap)===deployment.maxPerPaymentAtomic&&String(ttl)===deployment.maxAuthorizationTTL&&String(recipient).toLowerCase()===p.recipient;
  const errors:string[]=[];if(!configurationValid)errors.push('WRONG_DEPLOYMENT: current contract does not match build pins');
  const remaining=BigInt(p.deadline)-block.timestamp;
  if(BigInt(p.issuedAt)>block.timestamp)errors.push('FUTURE_ISSUANCE');
  if(BigInt(p.deadline)<=BigInt(p.issuedAt)||BigInt(p.deadline)-BigInt(p.issuedAt)>BigInt(deployment.maxAuthorizationTTL))errors.push('INVALID_TIME_WINDOW');
  if(remaining<60n)errors.push(remaining<=0n?'APPROVAL_EXPIRED':'LESS_THAN_60_SECONDS_REMAINING');
  if(Number(nonce)!==0)errors.push('NONCE_UNAVAILABLE');
  if(settlement!==`0x${'0'.repeat(64)}`)errors.push('INVOICE_ALREADY_SETTLED');
  if(BigInt(p.amountAtomic)>BigInt(deployment.maxPerPaymentAtomic))errors.push('AMOUNT_EXCEEDS_POLICY');
  return {configurationValid,errors,nonce:Number(nonce),remaining,blockNumber:block.number,client};
}
