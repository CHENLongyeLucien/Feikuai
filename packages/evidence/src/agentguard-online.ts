import {createPublicClient,http,decodeEventLog,keccak256,parseAbi,type Hex} from 'viem';
import {z} from 'zod';
import {agentProofSchema,verifyAgentDecisionProof} from './agentguard.js';
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/),address=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const agentGuardAnchorPinSchema=z.object({chainId:z.number().int().positive().safe(),vault:address,runtimeCodeHash:hash,anchorId:hash,transactionHash:hash,rpcUrl:z.url().refine(value=>{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;},'Select an HTTP(S) node without embedded credentials')}).strict();
const anchorAbi=parseAbi(['event DecisionBatchAnchored(bytes32 indexed anchorId,bytes32 indexed root,uint32 leafCount,bytes32 manifestHash)']);
type Receipt={status:string;to:string|null;transactionHash:Hex;blockHash:Hex;blockNumber:bigint;logs:readonly {address:string;logIndex:number|null;data:Hex;topics:readonly Hex[]}[]};
export type AnchorReader={getChainId:()=>Promise<number>;getCode:(args:{address:Hex;blockNumber:bigint})=>Promise<Hex|undefined>;getTransactionReceipt:(args:{hash:Hex})=>Promise<Receipt>;getBlock:(args:{blockNumber:bigint}|{blockTag:'finalized'})=>Promise<{hash:Hex|null;number:bigint|null;timestamp:bigint}>};
/** The caller supplies a separately trusted deployment/transaction pin, never one from the evidence file. */
export async function verifyAgentDecisionOnline(input:unknown,trustedPin:unknown,reader?:AnchorReader){
 const pin=agentGuardAnchorPinSchema.parse(trustedPin),proof=agentProofSchema.parse(input);
 const client=reader??createPublicClient({transport:http(pin.rpcUrl,{timeout:10000,retryCount:0})}) as AnchorReader;
 try{
  if(await client.getChainId()!==pin.chainId)return {status:'MISMATCH',reason:'Wrong chain'};
  const receipt=await client.getTransactionReceipt({hash:pin.transactionHash as Hex});
  if(receipt.status!=='success'||receipt.to?.toLowerCase()!==pin.vault.toLowerCase()||receipt.transactionHash.toLowerCase()!==pin.transactionHash.toLowerCase())return {status:'MISMATCH',reason:'Receipt identity or execution failed'};
  const [block,finalized,code]=await Promise.all([client.getBlock({blockNumber:receipt.blockNumber}),client.getBlock({blockTag:'finalized'}),client.getCode({address:pin.vault as Hex,blockNumber:receipt.blockNumber})]);
  if(block.hash!==receipt.blockHash||block.number!==receipt.blockNumber||finalized.number===null||finalized.number<receipt.blockNumber||!code||keccak256(code).toLowerCase()!==pin.runtimeCodeHash.toLowerCase())return {status:'MISMATCH',reason:'Canonical finalized block or pinned contract code mismatch'};
  for(const log of receipt.logs){
   if(log.address.toLowerCase()!==pin.vault.toLowerCase())continue;
   try{
    const {args}=decodeEventLog({abi:anchorAbi,eventName:'DecisionBatchAnchored',data:log.data,topics:log.topics as [Hex,...Hex[]]});
    if(args.anchorId.toLowerCase()!==pin.anchorId.toLowerCase())continue;
    if(!verifyAgentDecisionProof(proof,args.root,Number(args.leafCount)))return {status:'MISMATCH',reason:'Decision does not match the anchored batch'};
    return {status:'VERIFIED_ANCHOR',chainId:pin.chainId,transactionHash:receipt.transactionHash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,existedBy:new Date(Number(block.timestamp)*1000).toISOString(),manifestHash:args.manifestHash,
     limitations:['Verified via the selected RPC and separately trusted deployment pin; this is not a trustless consensus proof.','Anchoring proves inclusion of committed bytes by the block timestamp. It does not prove their truth, completeness, creation time, model safety or payment settlement.']};
   }catch{/* Other event types are not evidence for this batch. */}
  }
  return {status:'MISMATCH',reason:'Pinned batch event absent from the executed receipt'};
 }catch{return {status:'UNAVAILABLE',reason:'The selected node could not provide verification data'};}
}
