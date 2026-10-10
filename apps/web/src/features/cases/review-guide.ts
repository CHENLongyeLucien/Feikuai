import type {CaseDTO,Execution} from '../../app/types';

export function permits(c:Pick<CaseDTO,'allowedActions'>,...actions:string[]){
 const available=new Set(c.allowedActions.map(value=>value.replace(/[A-Z]/g,letter=>'_'+letter.toLowerCase()).replaceAll('-','_')));
 return actions.some(action=>available.has(action));
}
export function reviewGuide(c:CaseDTO){
 const settled=c.settlementStatus==='SETTLED';
 const uncertain=['UNKNOWN','INCONSISTENT'].includes(c.executionStatus);
 const pending=['PREPARING','PREPARED','SUBMITTED','PENDING'].includes(c.executionStatus);
 const attention=c.checks.some(check=>!check.passed&&check.severity==='ATTENTION')||Array.isArray(c.analysis?.intake?.suspiciousInstructions)&&c.analysis.intake.suspiciousInstructions.length>0;
 const failed=c.checks.find(check=>!check.passed&&check.severity==='HARD');
 const terminal=['CANCELLED','EXPIRED','CONSUMED'].includes(c.authorizationStatus??'');
 const createReason=settled?'This invoice already has a confirmed payment.':uncertain||pending?'Resolve the existing payment attempt first.':c.authorizationStatus==='CANCELLATION_PENDING'?'Wait for the cancellation result.':c.latestProposal&&!terminal?'An existing request may still be signed. Use that request or resolve its cancellation/expiry first.':c.workflowStatus!=='READY_FOR_REVIEW'?'Complete the checks and resolve any holds first.':!permits(c,'create_proposal')?'A reviewer with permission must create this request.':null;
 const importReason=settled?'Payment is already confirmed.':!c.latestProposal?'Create an approval request first.':terminal||c.authorizationStatus==='CANCELLATION_PENDING'?'This request is expired, consumed or being cancelled. Resolve its lifecycle before importing.':!permits(c,'import_authorization')?'Your current role cannot import a payment signature.':null;
 const executeReason=settled?'Payment is already confirmed.':uncertain||pending?'This payment is already being processed or reconciled.':c.authorizationStatus!=='VALID'||!c.authorization?'Import a valid signature from the approval wallet first.':c.workflowStatus!=='READY_FOR_REVIEW'?'Resolve the business hold before requesting payment.':!permits(c,'execute','request_execution')?'Execution is not available for your role or the current chain state.':null;
 const common={attention,createReason,importReason,executeReason,businessCleared:c.workflowStatus==='READY_FOR_REVIEW'&&!attention&&!failed};
 if(c.paymentRoute==='REGISTERED_POLICY'){const reason='This invoice follows its exact registered payment policy. Open its inbox item for the payment outcome and audit.';return {...common,createReason:reason,importReason:reason,executeReason:reason,stage:'policy',tab:'source',title:'This invoice follows your registered payment policy.',description:'This route requires the exact supplier, amount and invoice to be authorized in advance. The agents must complete the final checks before payment; its actual outcome and final audit are available in the inbox.',button:'View source & checks'}}
 if(settled)return {...common,stage:'done',tab:'execution',title:'Payment confirmed. Your audit record is ready.',description:'The receipt and matching payment event have been verified. Download the evidence or inspect the final result.',button:'View result & audit'};
 if(uncertain)return {...common,stage:'attention',tab:'execution',title:c.executionStatus==='UNKNOWN'?'We are checking the payment outcome.':'This payment needs investigation.',description:'Keep this case open while the chain result is reconciled. An expired signature does not establish that payment failed.',button:'View payment status'};
 if(pending)return {...common,stage:'processing',tab:'execution',title:'Payment is being processed.',description:'The reconciler will update this case after checking the receipt. You can leave this screen open or return to the inbox.',button:'View payment status'};
 if(c.authorizationStatus==='CANCELLATION_PENDING')return {...common,stage:'processing',tab:'approval',title:'Cancellation is awaiting confirmation.',description:'Wait for the wallet transaction to be verified before creating another request. Any payment that executes first remains final.',button:'View authorization'};
 if(['HELD','NEEDS_INFORMATION'].includes(c.workflowStatus))return {...common,stage:'attention',tab:'source',title:'Resolve the issue before continuing.',description:failed?.summary??'Review the source and agent findings below. Correct the document or supply the missing information, then rerun the checks.',button:'Review the issue'};
 if(c.authorizationStatus==='VALID'&&c.authorization)return {...common,stage:'payment',tab:'approval',title:'Your wallet signature is ready for payment.',description:'The business checks and payment authority are separate. Request execution to submit the exact signed transfer for a fresh chain check.',button:'Continue to payment'};
 if(c.latestProposal&&!terminal)return {...common,stage:'signature',tab:'approval',title:'One wallet signature is needed.',description:'Open Review payment to inspect the transfer in the separate approval screen. Your wallet signature returns here automatically; the current vault requires human payment authority.',button:'Continue to approval'};
 if(c.workflowStatus==='READY_FOR_REVIEW')return {...common,stage:'review',tab:'approval',title:attention?'A finding needs your review.':'The business checks are complete.',description:attention?'Review the flagged source text against the trusted facts. Acknowledging it does not authorize payment.':'The agents have prepared this invoice for review. The deployed payment policy still requires a wallet signature before funds can move.',button:'Continue to approval'};
 return {...common,stage:'processing',tab:'source',title:'The agents are reviewing this case.',description:'Extraction, security findings and finance checks will appear here as they finish. No payment is authorized during this work.',button:'View source & checks'};
}
export function attemptView(attempt:Execution){
 const details=attempt.details&&typeof attempt.details==='object'?attempt.details as Record<string,unknown>:{};
 const kind=typeof attempt.kind==='string'?attempt.kind:attempt.status||'OBSERVED';
 const title=kind==='RAW_TRANSACTION_PERSISTED'?'Transaction prepared':kind==='SIMULATION_REJECTED'?'Preflight rejected':kind.replaceAll('_',' ').toLowerCase();
 const txHash=typeof attempt.txHash==='string'?attempt.txHash:typeof details.txHash==='string'?details.txHash:null;
 const error=typeof attempt.error==='string'?attempt.error:typeof details.error==='string'?details.error:null;
 return {title,txHash,error,details};
}
