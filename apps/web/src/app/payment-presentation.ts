import type {CaseDTO} from './types';

export type PaymentStateInput=Pick<CaseDTO,'workflowStatus'|'authorizationStatus'|'executionStatus'|'settlementStatus'> & Partial<Pick<CaseDTO,'id'|'invoiceKey'|'paymentRoute'|'automationPayment'|'latestExecution'|'settlement'|'recipient'>>;
/** Read-only UI projection. Backend records retain their separate authority and settlement models. */
export function paymentPresentation(c:PaymentStateInput){
 const automatic=c.paymentRoute==='REGISTERED_POLICY',record=automatic?c.automationPayment:null;
 const receipt=record?.receipt;
 const receiptMatches=!!record?.txHash&&!!receipt&&receipt.transactionHash===record.txHash&&(!c.invoiceKey||receipt.invoiceKey===c.invoiceKey);
 const settled=automatic?record?.settlementStatus==='SETTLED'&&record.executionStatus==='CONFIRMED'&&receiptMatches:c.settlementStatus==='SETTLED';
 const executionStatus=automatic?(record?.executionStatus==='CONFIRMED'&&!settled?'INCONSISTENT':record?.executionStatus??'NONE'):c.executionStatus;
 const pending=['PREPARING','PREPARED','SUBMITTED','PENDING'].includes(executionStatus),uncertain=['UNKNOWN','INCONSISTENT'].includes(executionStatus);
 return {automatic,settled,pending,uncertain,executionStatus,settlementStatus:settled?'SETTLED':'UNSETTLED',
  authorizationStatus:automatic?'REGISTERED_POLICY':c.authorizationStatus,
  hasAttempt:automatic?!!record:!!(c.latestExecution||c.settlement),
  authorized:automatic?!!record:['VALID','CONSUMED'].includes(c.authorizationStatus??''),
  txHash:automatic?record?.txHash??null:c.settlement?.txHash??c.latestExecution?.txHash??null,
  recipient:automatic?(typeof receipt?.recipient==='string'?receipt.recipient:c.recipient):c.settlement?.recipient??c.recipient,
  needsHumanReview:!automatic&&!settled&&!pending&&!uncertain&&c.workflowStatus==='READY_FOR_REVIEW'&&!['VALID','CONSUMED','CANCELLATION_PENDING'].includes(c.authorizationStatus??''),
 };
}
export function paymentCases(cases:CaseDTO[]){
 const seen=new Set<string>();return cases.filter(c=>{const view=paymentPresentation(c);if(!view.hasAttempt)return false;const key=`${view.automatic?'policy':'wallet'}:${view.txHash??c.invoiceKey}`;if(seen.has(key))return false;seen.add(key);return true;});
}
export function campusPaymentMetrics(cases:CaseDTO[]){
 const paid=new Set<string>(),waiting=new Set<string>();for(const c of cases){const view=paymentPresentation(c),key=c.invoiceKey||c.id;if(view.settled)paid.add(key);else if(view.needsHumanReview)waiting.add(key);}for(const key of paid)waiting.delete(key);return {paid:paid.size,waiting:waiting.size};
}
export function paymentJourney(c?:PaymentStateInput){
 const view=c?paymentPresentation(c):null;
 const stages=['Received','Extracted','Checked',view?.automatic?'Registered policy':'Human signed',view?.automatic?'Receipt verified':'Confirmed'];
 const step=!c?-1:view?.settled?4:view?.authorized?3:c.workflowStatus==='READY_FOR_REVIEW'?2:c.workflowStatus==='CHECKING'?1:0;
 return {stages,step};
}
export function registeredSupplierName(cases:CaseDTO[],recipient:string|undefined,index:number){
 if(!recipient)return `Registered supplier ${index+1}`;
 return cases.find(c=>paymentPresentation(c).recipient?.toLowerCase()===recipient.toLowerCase())?.supplierName||`Registered supplier ${index+1}`;
}
