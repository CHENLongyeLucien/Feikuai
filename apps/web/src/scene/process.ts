import type {CaseDTO} from '../app/types';
import {paymentPresentation} from '../app/payment-presentation';
import type {InboxItem,InboxStage} from '../features/inbox/types';

export type ProcessStageId='receive'|'security'|'finance'|'decision'|'payment'|'report';
export type ProcessStageStatus='complete'|'active'|'attention'|'waiting'|'unavailable';
export type ProcessStage={id:ProcessStageId;title:string;status:ProcessStageStatus;summary:string;detail?:string};
export type ProcessJourney={
 stages:ProcessStage[];
 currentStage:ProcessStageId;
 headline:string;
 hasSelection:boolean;
 paymentRequired:boolean;
 paymentSettled:boolean;
 reportAvailable:boolean;
 itemId:string|null;
 caseId:string|null;
};

const definitions:[ProcessStageId,string,string][]=[
 ['receive','Receive','Receive and classify an invoice, message or transcript.'],
 ['security','Security','Review the source with the configured security checks.'],
 ['finance','Finance','Compare invoice facts or assess the business request.'],
 ['decision','Decision','Apply the review policy and final audit before payment.'],
 ['payment','Payment','Confirm a payment only from verified receipt records.'],
 ['report','Report','Read the recorded review and payment observations.'],
];
export function processStageLabel(stage:ProcessStage){
 if(stage.id==='payment'&&stage.status==='unavailable')return 'Not needed';
 return {complete:'Recorded',active:'In progress',attention:'Needs attention',waiting:'Not reached',unavailable:'Not recorded'}[stage.status];
}
const isAttention=(stage?:InboxStage)=>stage?.status==='held'||stage?.status==='failed';
const isRunning=(stage?:InboxStage)=>stage?.status==='running';
const isPassed=(stage?:InboxStage)=>stage?.status==='passed';

/** Read-only projection of recorded review stages and independently recorded payment state. */
export function deriveProcessJourney(c?:CaseDTO,item?:InboxItem):ProcessJourney{
 // Never borrow a selected, unrelated invoice's payment for an inbox source.
 const invoice=item?(item.linkedCaseId===c?.id?c:undefined):c;
 const hasSelection=!!(item||invoice);
 const stages=definitions.map(([id,title,summary])=>({id,title,status:'waiting' as ProcessStageStatus,summary})) as ProcessStage[];
 const byId=Object.fromEntries(stages.map(stage=>[stage.id,stage])) as Record<ProcessStageId,ProcessStage>;
 const set=(id:ProcessStageId,status:ProcessStageStatus,summary:string,detail?:string)=>Object.assign(byId[id],{status,summary,...(detail?{detail}:{})});
 const base={stages,hasSelection,paymentRequired:false,paymentSettled:false,reportAvailable:hasSelection,itemId:item?.id??null,caseId:invoice?.id??null};
 if(!hasSelection)return {...base,currentStage:'receive',headline:'Choose a source to explore its process'};

 const recorded=(id:string)=>item?.stages.find(stage=>stage.id===id);
 const classification=recorded('classification'),security=recorded('security'),finance=recorded('client_finance'),policy=recorded('policy'),audit=recorded('final_audit');
 const paymentRequired=!!invoice||!!item&&(item.channel==='invoice'||item.classification?.category==='invoice'||!!item.linkedCaseId||!!item.payableId||!!item.payment);
 const payment=invoice?paymentPresentation(invoice):null;
 const settled=payment?.settled===true;
 const sourceHeld=!!item&&(item.status==='quarantined'||isAttention(security)||item.risks.length>0||item.links.some(link=>link.status==='unverified'));
 const intakeFindings=invoice?.analysis.intake?.suspiciousInstructions;
 const legacySecurityAttention=!item&&(invoice?.checks.some(check=>check.code==='DOCUMENT_INSTRUCTIONS'&&!check.passed)||Array.isArray(intakeFindings)&&intakeFindings.length>0);
 const analysisPending=!!invoice&&['RECEIVED','EXTRACTING','CHECKING'].includes(invoice.workflowStatus);
 const financeChecks=invoice?.checks.filter(check=>check.code!=='DOCUMENT_INSTRUCTIONS')??[];
 const invoiceHeld=!!invoice&&(['HELD','NEEDS_INFORMATION'].includes(invoice.workflowStatus)||!analysisPending&&financeChecks.some(check=>!check.passed));
 const workflowApproved=!!item&&item.status==='approved'&&['automatic','human'].includes(item.approval?.decision??'')&&isPassed(audit);

 if(item){
  if(isAttention(classification))set('receive','attention','The source needs more information',classification?.summary);
  else if(isRunning(classification)||classification?.status==='pending')set('receive','active','Receiving and classifying the source',classification?.summary);
  else set('receive','complete','Source received',item.classification?.summary??'The source is stored; classification has not been recorded in this view.');
 }else if(invoice?.workflowStatus==='EXTRACTING'||invoice?.workflowStatus==='RECEIVED'){
  set('receive','active',invoice.workflowStatus==='EXTRACTING'?'Extracting invoice information':'Invoice received; intake is pending');
 }else set('receive','complete','Invoice record received',invoice?.document?'The attached source is available for review.':'Source content is not included in this record view.');

 if(sourceHeld)set('security','attention','Security review has stopped this source',security?.summary??item?.risks.map(risk=>risk.title).join('; ')??'Resolve the recorded security findings.');
 else if(isPassed(security))set('security','complete','Configured security checks completed',security?.summary??'This is a recorded review, not a guarantee of sender or voice authenticity.');
 else if(isRunning(security))set('security','active','Security checks are running',security?.summary);
 else if(item)set('security','waiting','Waiting for security review',security?.summary);
 else if(legacySecurityAttention)set('security','attention','Suspicious source instructions need review','The invoice records contain a source-instruction finding. No separate inbox security review is recorded.');
 else set('security','unavailable','No inbox security review recorded','Invoice extraction and business checks do not establish that the full inbox security stage ran.');

 if(sourceHeld)set('finance','waiting','Blocked by the security review','Earlier business records, if any, remain available in the report.');
 else if(invoiceHeld)set('finance','attention','Invoice checks need attention','Resolve the current invoice hold or failed business checks before proceeding.');
 else if(invoice?.workflowStatus==='CHECKING'||isRunning(finance))set('finance','active','Checking the trusted business records',finance?.summary);
 else if(analysisPending)set('finance','waiting','Waiting for the current invoice analysis','Older cached checks do not establish that the current source revision passed.');
 else if(isAttention(finance))set('finance','attention','Business review needs attention',finance?.summary);
 else if(isPassed(finance))set('finance','complete',paymentRequired?'Invoice facts reviewed':'Business scope reviewed',finance?.summary);
 else if(invoice&&financeChecks.length&&financeChecks.every(check=>check.passed))set('finance','complete','Recorded business checks passed','The recorded results remain separate from wallet authority and payment execution.');
 else set('finance','waiting',paymentRequired?'Waiting for recorded invoice checks':'Waiting for the business review');

 if(sourceHeld)set('decision','waiting','Blocked by the security review','An approval claim inside the source grants no authority.');
 else if(item?.status==='rejected'||item?.approval?.decision==='rejected')set('decision','attention','The request was rejected',item?.approval?.reason);
 else if(invoiceHeld||analysisPending)set('decision','waiting','Waiting for the current invoice checks');
 else if(audit?.status==='failed')set('decision','attention','The independent final audit needs attention',audit.summary);
 else if(invoice){
  if(settled)set('decision','complete',payment?.automatic?'Registered payment authority used':'Payment authority used','Payment authority is recorded separately from the source review.');
  else if(payment?.automatic){
   set('decision',payment.authorized?'complete':'active',payment.authorized?'Exact standing policy recorded':'Checking the registered payment policy','This route uses an exact preauthorized obligation. It does not create a human wallet signature.');
  }else if(invoice.authorizationStatus==='VALID'||invoice.authorizationStatus==='CONSUMED')set('decision','complete',invoice.authorizationStatus==='CONSUMED'?'Payment authority was consumed':'Human wallet signature verified');
  else if(['CANCELLED','EXPIRED','CANCELLATION_PENDING'].includes(invoice.authorizationStatus??''))set('decision','attention',invoice.authorizationStatus==='CANCELLATION_PENDING'?'Cancellation is awaiting confirmation':invoice.authorizationStatus==='CANCELLED'?'Payment authorization was cancelled':'Payment authorization expired','A workflow hold is separate from onchain cancellation or expiry.');
  else if(invoice.workflowStatus==='READY_FOR_REVIEW'||invoice.authorizationStatus==='AWAITING_SIGNATURE')set('decision','active','Human wallet approval is required','Workflow clearance does not sign or execute a payment.');
  else set('decision','waiting','Waiting for a review decision');
 }else if(workflowApproved&&!paymentRequired)set('decision','complete','Workflow review approved','The recorded final audit and decision cover this request only; no external action or payment was performed.');
 else if(workflowApproved)set('decision','active','Workflow cleared; payment authority needs review','Load the linked invoice to inspect its wallet or registered-policy authority.');
 else if(item?.status==='approved')set('decision','attention','The final-audit record is not available','An approved label alone does not prove that the independent final audit passed.');
 else if(isRunning(audit)||isRunning(policy))set('decision','active','Policy and final audit are in progress',audit?.summary??policy?.summary);
 else if(isAttention(policy)||isAttention(audit)||item?.status==='needs_review')set('decision','attention','A human review is needed',item?.approval?.reason??policy?.summary??audit?.summary);
 else set('decision','waiting','Waiting for policy and final-audit records');

 const paymentDetail=item?'This is the linked invoice payment. It does not approve another source submission.':undefined;
 if(!paymentRequired)set('payment','unavailable','No payment workflow is linked','This source can be reviewed without creating a payment.');
 else if(settled)set('payment','complete','Payment receipt verified',paymentDetail??'The application has recorded a verified settlement.');
 else if(payment?.uncertain)set('payment','attention',payment.executionStatus==='UNKNOWN'?'Payment outcome is unknown':'Payment evidence needs investigation','Reconcile the existing attempt before treating this invoice as paid or creating another attempt.');
 else if(payment?.pending)set('payment','active','Payment is awaiting confirmation',sourceHeld?'The existing attempt remains pending. A source hold does not cancel a submitted transaction.':'A submitted or prepared transaction is not a verified payment.');
 else if(payment&&['REVERTED','HELD'].includes(payment.executionStatus))set('payment','attention',payment.executionStatus==='REVERTED'?'The payment attempt failed':'Payment execution is on hold','No verified payment receipt is recorded for this attempt.');
 else if(sourceHeld)set('payment','waiting','Payment cannot proceed from this source','Resolve the source security findings first.');
 else if(invoiceHeld||analysisPending)set('payment','waiting','Waiting for current invoice review');
 else if(payment&&!payment.automatic&&payment.authorizationStatus==='CONSUMED')set('payment','attention','Consumed authority needs reconciliation','A consumed authorization without a verified settlement does not establish payment.');
 else if(payment?.authorized)set('payment','active','Authorized; waiting for execution','The payment is complete only after its receipt is verified.');
 else if(invoice)set('payment','waiting',payment?.automatic?'Waiting for registered-policy checks':'Waiting for human payment authorization');
 else if(item?.payment&&['UNKNOWN','INCONSISTENT','REVERTED','HELD'].includes(item.payment.executionStatus))set('payment','attention','The linked payment needs review','Load the linked invoice for its execution and receipt evidence.');
 else if(item?.payment&&['PREPARING','PREPARED','SUBMITTED','PENDING'].includes(item.payment.executionStatus))set('payment','active','The linked payment is pending','Load the linked invoice for the current receipt verification result.');
 else set('payment','waiting',item?.payment?.settlementStatus==='SETTLED'?'Load the linked invoice receipt':'Waiting for a linked payment workflow','A summary without the linked invoice receipt is not enough to mark this stage complete.');

 set('report','complete','Recorded review summary available',settled?'The summary can include the verified invoice payment. It does not claim that a new audit ran after payment.':'The summary describes the recorded review so far. Payment evidence remains separate and is not verified by exporting a report.');
 // Report availability is independent of whether this workflow can advance.
 const current=stages.find(stage=>stage.id!=='report'&&stage.status==='attention')??stages.find(stage=>stage.id!=='report'&&stage.status==='active')??(settled||workflowApproved&&!paymentRequired?byId.report:stages.find(stage=>stage.id!=='report'&&stage.status==='waiting')??byId.report);
 return {...base,paymentRequired,paymentSettled:settled,currentStage:current.id,headline:current.summary};
}
