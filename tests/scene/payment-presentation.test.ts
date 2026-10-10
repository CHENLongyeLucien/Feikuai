import {describe,expect,it} from 'vitest';
import type {CaseDTO,AutomationPayment} from '../../apps/web/src/app/types';
import {paymentPresentation,paymentCases,campusPaymentMetrics,paymentJourney,registeredSupplierName} from '../../apps/web/src/app/payment-presentation';
import {deriveSceneState} from '../../apps/web/src/scene/state';

const base:CaseDTO={id:'case-1',invoiceKey:'invoice-1',version:1,invoiceReference:'NS-1',supplierName:'Northstar Supplier',recipient:'0x1111111111111111111111111111111111111111',amountAtomic:'48000000000',token:'token',workflowStatus:'READY_FOR_REVIEW',authorizationStatus:null,executionStatus:'NONE',settlementStatus:'UNSETTLED',mode:'fixture',lastEventId:'1',allowedActions:[],latestProposal:null,authorization:null,latestExecution:null,settlement:null,document:null,analysis:{intake:null,finance:null,runs:[]},checks:[],attempts:[],evidenceCoverage:null};
const record:AutomationPayment={authorityModel:'EXACT_REGISTERED_POLICY',requiresWalletSignature:false,executionStatus:'CONFIRMED',settlementStatus:'SETTLED',txHash:'transaction-1',error:null,receipt:{transactionHash:'transaction-1',invoiceKey:'invoice-1',recipient:base.recipient}};
const automatic:CaseDTO={...base,paymentRoute:'REGISTERED_POLICY',automationPayment:record};

describe('separate payment models in the campus and payments list',()=>{
 it('shows verified automatic settlement without modifying the legacy review, authorization or settlement fields',()=>{
  const input=Object.freeze({...automatic,automationPayment:Object.freeze({...record,receipt:Object.freeze({...record.receipt})})});
  expect(paymentPresentation(input)).toMatchObject({automatic:true,settled:true,executionStatus:'CONFIRMED',settlementStatus:'SETTLED',authorizationStatus:'REGISTERED_POLICY',needsHumanReview:false,txHash:'transaction-1'});
  expect(deriveSceneState(input)).toMatchObject({station:'supplier',status:'Verified settlement',tone:'green',settled:true,route:'delivery'});
  expect(input.workflowStatus).toBe('READY_FOR_REVIEW');expect(input.authorizationStatus).toBeNull();expect(input.settlementStatus).toBe('UNSETTLED');expect(input.executionStatus).toBe('NONE');
 });
 it.each([
  {executionStatus:'PREPARED',settlementStatus:'UNSETTLED',receipt:null},
  {executionStatus:'SUBMITTED',settlementStatus:'UNSETTLED',receipt:null},
  {executionStatus:'UNKNOWN',settlementStatus:'UNSETTLED',receipt:null},
  {executionStatus:'REVERTED',settlementStatus:'UNSETTLED',receipt:null},
  {executionStatus:'HELD',settlementStatus:'UNSETTLED',receipt:null},
 ])('does not turn automatic $executionStatus into a paid invoice or a human approval request',patch=>{
  const item={...automatic,automationPayment:{...record,...patch}};
  expect(paymentPresentation(item)).toMatchObject({settled:false,needsHumanReview:false,executionStatus:patch.executionStatus});
  expect(deriveSceneState(item).settled).toBe(false);expect(deriveSceneState(item).status).not.toMatch(/human review|Signed/);
 });
 it('requires a matching receipt before displaying an automatic CONFIRMED record as settled',()=>{
  for(const receipt of [null,{transactionHash:'another-transaction',invoiceKey:'invoice-1'},{transactionHash:record.txHash!,invoiceKey:'different-invoice'}]){
   const item={...automatic,automationPayment:{...record,receipt}};
   expect(paymentPresentation(item)).toMatchObject({settled:false,executionStatus:'INCONSISTENT'});
   expect(deriveSceneState(item).status).toBe('Investigation required');
  }
 });
 it('does not borrow legacy wallet settlement fields to settle a registered-policy route with no automatic record',()=>{
  const item={...automatic,automationPayment:null,settlementStatus:'SETTLED',authorizationStatus:'VALID'};
  expect(paymentPresentation(item)).toMatchObject({settled:false,hasAttempt:false,authorized:false});
  expect(deriveSceneState(item).status).toBe('Registered policy · final checks');
 });
 it('counts verified payments across both models and excludes automatic or already-authorized cases from human review',()=>{
  const paidWallet={...base,id:'wallet',invoiceKey:'wallet-invoice',settlementStatus:'SETTLED'};
  const waiting={...base,id:'waiting',invoiceKey:'waiting-invoice'};
  const signed={...base,id:'signed',invoiceKey:'signed-invoice',authorizationStatus:'VALID'};
  expect(campusPaymentMetrics([automatic,{...automatic,id:'second-case-same-invoice'},paidWallet,waiting,signed])).toEqual({paid:2,waiting:1});
 });
 it('includes automatic payment rows once without manufacturing a legacy execution',()=>{
  const wallet={...base,id:'wallet',invoiceKey:'wallet-invoice',latestExecution:{id:'execution',status:'SUBMITTED',txHash:'wallet-transaction'}};
  expect(paymentCases([automatic,{...automatic,id:'duplicate'},base,wallet]).map(c=>c.id)).toEqual(['case-1','wallet']);
  expect(automatic.latestExecution).toBeNull();
 });
 it('uses registered policy and verified receipt timeline stages, never a human signature for automatic payments',()=>{
  const journey=paymentJourney(automatic);expect(journey.step).toBe(4);expect(journey.stages).toContain('Registered policy');expect(journey.stages).toContain('Receipt verified');expect(journey.stages).not.toContain('Human signed');
  expect(paymentJourney({...automatic,automationPayment:null}).step).toBe(2);expect(paymentJourney(base).stages).toContain('Human signed');
 });
 it('names supplier docks using trusted names without exposing truncated addresses',()=>{
  expect(registeredSupplierName([automatic],base.recipient,0)).toBe('Northstar Supplier');
  expect(registeredSupplierName([automatic],'0x2222222222222222222222222222222222222222',1)).toBe('Registered supplier 2');
  expect(registeredSupplierName([automatic],undefined,0)).not.toMatch(/0x/);
 });
});
