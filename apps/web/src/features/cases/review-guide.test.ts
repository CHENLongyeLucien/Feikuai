import {describe,expect,it} from 'vitest';
import type {CaseDTO} from '../../app/types';
import {attemptView,permits,reviewGuide} from './review-guide';

const base:CaseDTO={id:'case',version:1,invoiceKey:'invoice',invoiceReference:'INV-1',supplierName:'Supplier',amountAtomic:'48000000000',token:'token',workflowStatus:'READY_FOR_REVIEW',authorizationStatus:null,executionStatus:'NOT_REQUESTED',settlementStatus:'NOT_SETTLED',mode:'demo',lastEventId:'event',allowedActions:['createProposal','exportApprovalRequest','importAuthorization','execute','viewEvidence'],latestProposal:null,authorization:null,latestExecution:null,settlement:null,document:null,analysis:{intake:null,finance:null,runs:[]},checks:[{code:'AMOUNT_MATCH',passed:true,severity:'HARD',summary:'Amount matches'}],attempts:[],evidenceCoverage:null};
const proposal={id:'proposal',version:'1',typedDigest:'digest',domain:{chainId:'31337'},payment:{invoiceKey:'invoice',supplierKey:'supplier',recipient:'recipient',token:'token',amountAtomic:'48000000000',authorizationNonce:'1',issuedAt:'1',deadline:'600',evidenceCommitment:'commitment',policyId:'policy'}};

describe('case payment guidance',()=>{
 it('routes registered-policy cases to inbox results without inventing a wallet requirement or settlement',()=>{
  const guide=reviewGuide({...base,paymentRoute:'REGISTERED_POLICY'});
  expect(guide.stage).toBe('policy');expect(guide.title).toMatch(/registered payment policy/);
  expect(guide.executeReason).toMatch(/inbox/);expect(guide.importReason).toMatch(/inbox/);expect(guide.createReason).toMatch(/inbox/);
  expect(guide.title).not.toMatch(/confirmed|signature/i);
 });
 it('separates automatic business clearance from wallet payment authority',()=>{
  const guide=reviewGuide(base);expect(guide.businessCleared).toBe(true);expect(guide.createReason).toBeNull();expect(guide.executeReason).toMatch(/signature/);expect(guide.stage).toBe('review');
 });
 it('never describes a submitted or unknown transaction as failed merely because the signature expired',()=>{
  const unknown=reviewGuide({...base,latestProposal:proposal,authorizationStatus:'EXPIRED',executionStatus:'UNKNOWN'});
  expect(unknown.stage).toBe('attention');expect(unknown.tab).toBe('execution');expect(unknown.createReason).toMatch(/existing payment/);expect(unknown.description).toMatch(/does not establish/);
  const pending=reviewGuide({...base,authorizationStatus:'EXPIRED',executionStatus:'SUBMITTED'});expect(pending.stage).toBe('processing');expect(pending.executeReason).toMatch(/processed/);
 });
 it('a confirmed receipt takes precedence over stale workflow labels and blocks duplicate execution',()=>{
  const guide=reviewGuide({...base,workflowStatus:'HELD',settlementStatus:'SETTLED',executionStatus:'UNKNOWN'});
  expect(guide.stage).toBe('done');expect(guide.executeReason).toMatch(/confirmed/);expect(guide.createReason).toMatch(/confirmed/);
 });
 it('requires unresolved request cancellation or expiry before a replacement',()=>{
  expect(reviewGuide({...base,latestProposal:proposal}).createReason).toMatch(/existing request/);
  expect(reviewGuide({...base,latestProposal:proposal,authorizationStatus:'EXPIRED'}).createReason).toBeNull();
  expect(reviewGuide({...base,latestProposal:proposal,authorizationStatus:'CANCELLATION_PENDING'}).title).toMatch(/awaiting/);
 });
 it('keeps application holds and role permissions in force even after a valid wallet signature',()=>{
  const approved={...base,latestProposal:proposal,authorizationStatus:'VALID',authorization:{id:'auth',status:'VALID',signer:'approver'}};
  expect(reviewGuide(approved).executeReason).toBeNull();
  expect(reviewGuide({...approved,workflowStatus:'HELD'}).executeReason).toMatch(/hold/);
  expect(reviewGuide({...approved,allowedActions:['viewEvidence']}).executeReason).toMatch(/role/);
  expect(permits({allowedActions:['createProposal']},'create_proposal')).toBe(true);
 });
 it('does not call failed or suspicious business findings cleared',()=>{
  expect(reviewGuide({...base,checks:[{code:'PROMPT_INJECTION',passed:false,severity:'ATTENTION',summary:'Untrusted instructions'}]}).businessCleared).toBe(false);
  expect(reviewGuide({...base,analysis:{...base.analysis,intake:{suspiciousInstructions:[{summary:'Ignore rules'}]}}}).attention).toBe(true);
  const held=reviewGuide({...base,workflowStatus:'HELD',checks:[{code:'AMOUNT_MISMATCH',passed:false,severity:'HARD',summary:'Amount differs from payable'}]});
  expect(held.description).toBe('Amount differs from payable');expect(held.tab).toBe('source');
 });
 it('renders the actual append-only observation shape instead of assuming execution fields',()=>{
  const hash='0x123';const result=attemptView({id:'observation',status:'',kind:'RAW_TRANSACTION_PERSISTED',details:{txHash:hash,nonce:'4'}});
  expect(result.title).toBe('Transaction prepared');expect(result.txHash).toBe(hash);
  expect(attemptView({id:'rejection',status:'',kind:'SIMULATION_REJECTED',details:{error:'Insufficient gas'}}).error).toBe('Insufficient gas');
 });
});
