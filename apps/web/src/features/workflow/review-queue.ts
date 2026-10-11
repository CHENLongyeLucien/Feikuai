import {paymentPresentation,type PaymentStateInput} from '../../app/payment-presentation';
import type {InboxItem} from '../inbox/types';

type Source=Pick<InboxItem,'id'|'status'|'linkedCaseId'>;
type Invoice=PaymentStateInput&{id:string;version?:number};

function invoiceReviewLabel(invoice:Invoice|undefined){
 if(!invoice)return null;
 const payment=paymentPresentation(invoice);
 if(payment.settled)return null;
 if(payment.needsHumanReview)return 'Needs payment approval';
 return ['HELD','NEEDS_INFORMATION'].includes(invoice.workflowStatus)?'Payment on hold':null;
}

/** One queue for source exceptions and linked payment approval; no authority is changed. */
export function workflowReviewQueue(items:readonly Source[],cases:readonly Invoice[],selectedCase?:Invoice){
 const knownCases=new Map(cases.map(invoice=>[invoice.id,invoice]));
 // Detail and list polling can finish in either order; keep the newer exact invoice.
 if(selectedCase){
  const listed=knownCases.get(selectedCase.id);
  if(!listed||listed.version===undefined||selectedCase.version===undefined||selectedCase.version>=listed.version)knownCases.set(selectedCase.id,selectedCase);
 }
 const linkedIds=new Set(items.map(item=>item.linkedCaseId).filter((id):id is string=>!!id));
 const itemIds=new Set<string>(),itemLabels=new Map<string,string>();
 for(const item of items){
  const paymentLabel=invoiceReviewLabel(item.linkedCaseId?knownCases.get(item.linkedCaseId):undefined);
  if(['needs_review','quarantined'].includes(item.status)||paymentLabel)itemIds.add(item.id);
  if(item.status==='approved'&&paymentLabel)itemLabels.set(item.id,paymentLabel);
 }
 const caseIds=new Set(cases.filter(invoice=>!linkedIds.has(invoice.id)&&invoiceReviewLabel(knownCases.get(invoice.id))).map(invoice=>invoice.id));
 return {itemIds,caseIds,itemLabels,count:itemIds.size+caseIds.size};
}
