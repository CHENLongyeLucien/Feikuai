import canonicalize from 'canonicalize';
import {concat,keccak256,stringToHex,type Hex} from 'viem';
import {z} from 'zod';

const hash=z.string().regex(/^0x[0-9a-f]{64}$/),date=z.iso.datetime({offset:true});
export const agentDecisionSchema=z.object({
 schemaVersion:z.literal('agentguard.decision.v1'),recordId:z.string().min(1).max(160),salt:hash,
 recordedAt:date,agent:z.string().min(1).max(160),recipient:hash.or(z.string().regex(/^0x[0-9a-f]{40}$/)),amountAtomic:z.string().regex(/^(0|[1-9][0-9]*)$/).max(78),
 authorityChain:z.array(z.string().min(1).max(160)).max(8),origin:z.enum(['HUMAN','AGENT','EXTERNAL_DOCUMENT','UNKNOWN']),
 sourceCommitment:hash,result:z.enum(['EXECUTED','PENDING','HUMAN_APPROVED','DENIED','EXPIRED']),
 rule:z.string().min(1).max(160),riskScore:z.number().finite().min(0).max(1).nullable(),riskSignals:z.array(z.string().max(160)).max(32),
 rulesVersion:z.string().min(1).max(160),modelVersion:z.string().max(160).nullable(),reviewer:z.string().max(160).nullable(),explanation:z.string().max(4000),
}).strict();
export type AgentDecision=z.infer<typeof agentDecisionSchema>;
export const agentProofSchema=z.object({schemaVersion:z.literal('agentguard.inclusion.v1'),record:agentDecisionSchema,index:z.number().int().min(0),leafCount:z.number().int().min(1).max(1024),siblings:z.array(hash).max(10),root:hash}).strict();
export type AgentProof=z.infer<typeof agentProofSchema>;
function digest(value:unknown):Hex{const json=canonicalize(value);if(json===undefined)throw new Error('Canonical JSON required');return keccak256(stringToHex(json));}
// Domain prefixes prevent a 64-byte inner node being interpreted as a record leaf.
export function agentDecisionLeaf(record:AgentDecision):Hex{return keccak256(concat(['0x00',digest(agentDecisionSchema.parse(record))]));}
const parent=(left:Hex,right:Hex):Hex=>keccak256(concat(['0x01',left,right]));
export function buildAgentDecisionBatch(input:AgentDecision[]){
 if(!input.length||input.length>1024)throw new Error('A batch requires 1 to 1024 records');
 const records=input.map(record=>agentDecisionSchema.parse(record)).sort((a,b)=>a.recordId<b.recordId?-1:a.recordId>b.recordId?1:0);
 if(new Set(records.map(record=>record.recordId)).size!==records.length)throw new Error('Duplicate decision record ID');
 const layers:Hex[][]=[records.map(agentDecisionLeaf)];
 while(layers.at(-1)!.length>1){const level=layers.at(-1)!,next:Hex[]=[];for(let i=0;i<level.length;i+=2)next.push(parent(level[i]!,level[i+1]??level[i]!));layers.push(next);}
 const root=layers.at(-1)![0]!;
 const proofs=records.map((record,index):AgentProof=>{let cursor=index;const siblings:Hex[]=[];for(const level of layers.slice(0,-1)){siblings.push(level[cursor^1]??level[cursor]!);cursor=Math.floor(cursor/2);}return {schemaVersion:'agentguard.inclusion.v1',record,index,leafCount:records.length,siblings,root};});
 const manifest={schemaVersion:'agentguard.batch.v1',algorithm:'keccak256-domain-separated-ordered-duplicate-odd',root,leafCount:records.length,leaves:records.map((record,index)=>({recordId:record.recordId,leaf:layers[0]![index]!}))};
 return {manifest,manifestHash:digest(manifest),proofs,anchoring:'NOT_SUBMITTED' as const};
}
/** trustedRoot must be obtained separately; the file's claimed root is not authority. */
export function verifyAgentDecisionProof(input:unknown,trustedRoot:string,trustedLeafCount:number){
 try{
  const p=agentProofSchema.parse(input);hash.parse(trustedRoot);
  if(p.root!==trustedRoot||p.leafCount!==trustedLeafCount||p.index>=p.leafCount)return false;
  let value=agentDecisionLeaf(p.record),index=p.index,width=p.leafCount,depth=0;
  while(width>1){const sibling=p.siblings[depth++] as Hex|undefined;if(!sibling)return false;
   if(index===width-1&&width%2===1&&sibling!==value)return false;
   value=index%2?parent(sibling,value):parent(value,sibling);index=Math.floor(index/2);width=Math.ceil(width/2);
  }
  return depth===p.siblings.length&&value===trustedRoot;
 }catch{return false;}
}
export function agentReportHash(bytes:Uint8Array):Hex {if(bytes.length>32*1024*1024)throw new Error('Report exceeds 32 MiB');return keccak256(bytes);}
