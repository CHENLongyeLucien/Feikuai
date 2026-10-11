import {describe,expect,it} from 'vitest';
import {encodeAbiParameters,encodeEventTopics,keccak256,parseAbi,type Hex} from 'viem';
import {buildAgentDecisionBatch,type AgentDecision} from '../../packages/evidence/src/agentguard';
import {verifyAgentDecisionOnline,type AnchorReader} from '../../packages/evidence/src/agentguard-online';
const h=(v:string)=>`0x${v.repeat(64)}` as Hex,address='0x1111111111111111111111111111111111111111',code='0x6001' as Hex;
const record:AgentDecision={schemaVersion:'agentguard.decision.v1',recordId:'one',salt:h('1'),recordedAt:'2026-10-11T00:00:00Z',agent:'agent',recipient:address,amountAtomic:'10000000',authorityChain:['owner','agent'],origin:'EXTERNAL_DOCUMENT',sourceCommitment:h('2'),result:'DENIED',rule:'MISSING_AUTHORITY',riskScore:null,riskSignals:[],rulesVersion:'v1',modelVersion:null,reviewer:null,explanation:'No delegated payment authority.'};
const batch=buildAgentDecisionBatch([record]),pin={chainId:43113,vault:address,runtimeCodeHash:keccak256(code),anchorId:h('3'),transactionHash:h('4'),rpcUrl:'https://api.avax-test.network/ext/bc/C/rpc'};
const abi=parseAbi(['event DecisionBatchAnchored(bytes32 indexed anchorId,bytes32 indexed root,uint32 leafCount,bytes32 manifestHash)']);
const receipt={status:'success',to:address,transactionHash:h('4'),blockHash:h('5'),blockNumber:10n,logs:[{address,logIndex:0,data:encodeAbiParameters([{type:'uint32'},{type:'bytes32'}],[1,batch.manifestHash]),topics:encodeEventTopics({abi,eventName:'DecisionBatchAnchored',args:{anchorId:pin.anchorId,root:batch.manifest.root}}) as Hex[]}]};
const reader:AnchorReader={getChainId:async()=>43113,getCode:async()=>code,getTransactionReceipt:async()=>receipt,getBlock:async args=>({hash:h('5'),number:'blockNumber' in args?10n:11n,timestamp:1791676800n})};
describe('independent anchor receipt verification',()=>{
 it('verifies inclusion only after matching pinned chain, code, receipt, block and event',async()=>{expect(await verifyAgentDecisionOnline(batch.proofs[0],pin,reader)).toMatchObject({status:'VERIFIED_ANCHOR',blockNumber:'10',transactionHash:pin.transactionHash});});
 it('rejects wrong chain, contract code, receipt destination/status and noncanonical block',async()=>{
  for(const patch of [{getChainId:async()=>43114},{getCode:async()=>'0x6002' as Hex},{getTransactionReceipt:async()=>({...receipt,status:'reverted'})},{getTransactionReceipt:async()=>({...receipt,to:'0x2222222222222222222222222222222222222222'})},{getBlock:async()=>({hash:h('6'),number:10n,timestamp:1n})}])expect(await verifyAgentDecisionOnline(batch.proofs[0],pin,{...reader,...patch})).toMatchObject({status:'MISMATCH'});
 });
 it('does not accept an unfinalized block or a matching-looking log from another contract',async()=>{
  expect(await verifyAgentDecisionOnline(batch.proofs[0],pin,{...reader,getBlock:async args=>({hash:h('5'),number:'blockNumber' in args?10n:9n,timestamp:1n})})).toMatchObject({status:'MISMATCH'});
  expect(await verifyAgentDecisionOnline(batch.proofs[0],pin,{...reader,getTransactionReceipt:async()=>({...receipt,logs:[{...receipt.logs[0]!,address:'0x2222222222222222222222222222222222222222'}]})})).toMatchObject({status:'MISMATCH'});
 });
 it('rejects amended evidence and wrong batch pin, and treats RPC errors as unavailable',async()=>{
  expect(await verifyAgentDecisionOnline({...batch.proofs[0],record:{...record,result:'EXECUTED'}},pin,reader)).toMatchObject({status:'MISMATCH'});
  expect(await verifyAgentDecisionOnline(batch.proofs[0],{...pin,anchorId:h('6')},reader)).toMatchObject({status:'MISMATCH'});
  expect(await verifyAgentDecisionOnline(batch.proofs[0],pin,{...reader,getChainId:async()=>{throw new Error('private upstream details');}})).toEqual({status:'UNAVAILABLE',reason:'The selected node could not provide verification data'});
 });
});
