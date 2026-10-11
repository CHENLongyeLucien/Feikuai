import {describe,expect,it} from 'vitest';
import {workflowReviewQueue} from '../../apps/web/src/features/workflow/review-queue';

type Invoice=Parameters<typeof workflowReviewQueue>[1][number];
type Source=Parameters<typeof workflowReviewQueue>[0][number];
const invoice:Invoice={id:'invoice-a',version:1,invoiceKey:'key-a',paymentRoute:'WALLET_APPROVAL',workflowStatus:'READY_FOR_REVIEW',authorizationStatus:null,executionStatus:'NONE',settlementStatus:'UNSETTLED'};
const source:Source={id:'source-a',status:'approved',linkedCaseId:invoice.id};
const paid={...invoice,version:2,authorizationStatus:'CONSUMED',executionStatus:'CONFIRMED',settlementStatus:'SETTLED'};

describe('unified source and payment review queue',()=>{
 it('includes a workflow-approved source whose linked invoice still needs a wallet signature, once',()=>{
  const queue=workflowReviewQueue([source],[invoice]);
  expect([...queue.itemIds]).toEqual([source.id]);expect([...queue.caseIds]).toEqual([]);expect(queue.count).toBe(1);
  expect(queue.itemLabels.get(source.id)).toBe('Needs payment approval');expect(source.status).toBe('approved');
 });
 it.each(['HELD','NEEDS_INFORMATION'])('applies %s consistently to linked and standalone unpaid invoices',workflowStatus=>{
  const linked={...invoice,workflowStatus},standalone={...linked,id:'invoice-b'};
  const queue=workflowReviewQueue([source],[linked,standalone]);
  expect([...queue.itemIds]).toEqual([source.id]);expect([...queue.caseIds]).toEqual([standalone.id]);expect(queue.count).toBe(2);
  expect(queue.itemLabels.get(source.id)).toBe('Payment on hold');
 });
 it.each(['HELD','NEEDS_INFORMATION','READY_FOR_REVIEW'])('does not revive a confirmed wallet payment because its review status is %s',workflowStatus=>{
  const settled={...paid,workflowStatus};
  expect(workflowReviewQueue([source],[settled]).count).toBe(0);
  expect(workflowReviewQueue([source],[settled]).itemLabels.size).toBe(0);
  expect(workflowReviewQueue([],[settled]).count).toBe(0);
 });
 it('does not ask for a wallet signature for registered-policy invoices, before or after settlement',()=>{
  const automatic:Invoice={...invoice,paymentRoute:'REGISTERED_POLICY'};
  const settled:Invoice={...automatic,workflowStatus:'HELD',automationPayment:{authorityModel:'EXACT_REGISTERED_POLICY',requiresWalletSignature:false,executionStatus:'CONFIRMED',settlementStatus:'SETTLED',txHash:'tx-a',error:null,receipt:{transactionHash:'tx-a',invoiceKey:'key-a'}}};
  expect(workflowReviewQueue([source],[automatic]).count).toBe(0);
  expect(workflowReviewQueue([source],[settled]).count).toBe(0);
 });
 it.each(['needs_review','quarantined'] as const)('keeps a %s source visible even when its invoice is paid',status=>{
  const queue=workflowReviewQueue([{...source,status}],[paid]);
  expect([...queue.itemIds]).toEqual([source.id]);expect(queue.count).toBe(1);
  expect(queue.itemLabels.size).toBe(0);
 });
 it('does not interpret authorized, pending, or unknown payments as another wallet signature request',()=>{
  for(const patch of [{authorizationStatus:'VALID'},{authorizationStatus:'CONSUMED'},{authorizationStatus:'CANCELLATION_PENDING'},{executionStatus:'PENDING'},{executionStatus:'UNKNOWN'}]){
   expect(workflowReviewQueue([source],[{...invoice,...patch}]).count).toBe(0);
  }
 });
 it('uses current selected invoice detail instead of stale unpaid list data without changing those records',()=>{
  const stale=Object.freeze({...invoice}),current=Object.freeze({...paid});
  expect(workflowReviewQueue([source],[stale],current).count).toBe(0);
  expect(workflowReviewQueue([],[stale],current).count).toBe(0);
  expect(stale.settlementStatus).toBe('UNSETTLED');expect(current.settlementStatus).toBe('SETTLED');
 });
 it('uses a linked invoice detail missing from the list but never borrows an unrelated selection',()=>{
  expect([...workflowReviewQueue([source],[],invoice).itemIds]).toEqual([source.id]);
  expect(workflowReviewQueue([source],[],{...invoice,id:'unrelated-invoice'}).count).toBe(0);
  expect(workflowReviewQueue([{...source,linkedCaseId:null}],[],invoice).count).toBe(0);
 });
 it('does not let an older selected detail overwrite a newer settled list row',()=>{
  expect(workflowReviewQueue([source],[paid],invoice).count).toBe(0);
  expect(workflowReviewQueue([],[paid],invoice).count).toBe(0);
 });
 it('counts each source once when both its own status and linked invoice need review',()=>{
  const queue=workflowReviewQueue([{...source,status:'needs_review'}],[invoice,{...invoice,id:'standalone'}]);
  expect(queue.count).toBe(2);expect(queue.count).toBe(queue.itemIds.size+queue.caseIds.size);
  expect(queue.itemLabels.size).toBe(0);
 });
});
