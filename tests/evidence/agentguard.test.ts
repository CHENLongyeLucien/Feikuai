import {describe,expect,it} from 'vitest';
import {agentDecisionLeaf,agentReportHash,buildAgentDecisionBatch,verifyAgentDecisionProof,type AgentDecision} from '../../packages/evidence/src/agentguard';
const h=(v:string)=>`0x${v.repeat(64)}` as `0x${string}`;
const record:AgentDecision={schemaVersion:'agentguard.decision.v1',recordId:'decision-1',salt:h('1'),recordedAt:'2026-10-11T00:00:00Z',agent:'payment-agent',recipient:'0x1111111111111111111111111111111111111111',amountAtomic:'10000000',authorityChain:['owner','payment-agent'],origin:'EXTERNAL_DOCUMENT',sourceCommitment:h('2'),result:'PENDING',rule:'EXTERNAL_ORIGIN_REQUIRES_OWNER',riskScore:.5,riskSignals:['External source'],rulesVersion:'agentguard.v1',modelVersion:null,reviewer:null,explanation:'Waiting for an independent owner decision.'};
describe('independent salted decision inclusion proofs',()=>{
 it.each([1,2,3,5,16,1024])('verifies every leaf in a %i-record batch against an independently supplied root',size=>{
  const batch=buildAgentDecisionBatch(Array.from({length:size},(_,i)=>({...record,recordId:`decision-${i}`})));
  for(const proof of batch.proofs)expect(verifyAgentDecisionProof(proof,batch.manifest.root,size)).toBe(true);
  expect(batch.anchoring).toBe('NOT_SUBMITTED');
 });
 it('canonicalizes key order and sorts IDs, but binds explanation, origin and salt',()=>{
  const a={...record,recordId:'a'},b={...record,recordId:'b'};
  expect(buildAgentDecisionBatch([a,b]).manifestHash).toBe(buildAgentDecisionBatch([b,a]).manifestHash);
  expect(agentDecisionLeaf(record)).toBe(agentDecisionLeaf(Object.fromEntries(Object.entries(record).reverse()) as AgentDecision));
  for(const change of [{explanation:'Everything safe'},{origin:'HUMAN' as const},{salt:h('3')}])expect(agentDecisionLeaf({...record,...change})).not.toBe(agentDecisionLeaf(record));
 });
 it('rejects a changed record, claimed root, position, count or branch',()=>{
  const batch=buildAgentDecisionBatch([record,{...record,recordId:'decision-2'},{...record,recordId:'decision-3'}]),proof=batch.proofs[0]!;
  for(const changed of [{...proof,record:{...record,amountAtomic:'999'}},{...proof,root:h('f')},{...proof,index:2},{...proof,leafCount:4},{...proof,siblings:[h('f'),...proof.siblings.slice(1)]},{...proof,siblings:[...proof.siblings,h('f')]}])expect(verifyAgentDecisionProof(changed,batch.manifest.root,3)).toBe(false);
  expect(verifyAgentDecisionProof(proof,h('f'),3)).toBe(false);
 });
 it('rejects duplicate IDs, empty batches, malformed records and oversized reports',()=>{
  expect(()=>buildAgentDecisionBatch([])).toThrow();expect(()=>buildAgentDecisionBatch([record,record])).toThrow();
  expect(verifyAgentDecisionProof({},h('f'),1)).toBe(false);
  expect(()=>buildAgentDecisionBatch([{...record,amountAtomic:'01'}])).toThrow();
  expect(()=>agentReportHash(new Uint8Array(32*1024*1024+1))).toThrow();
 });
 it('binds the exact PDF bytes separately from decision metadata',()=>{expect(agentReportHash(new Uint8Array([1,2,3]))).not.toBe(agentReportHash(new Uint8Array([1,2,4])));});
});
