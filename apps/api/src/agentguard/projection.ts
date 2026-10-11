import type {Db} from '../db/database.js';
import type {Service} from '../domain/service.js';
import {parsed} from '../domain/errors.js';
import type {InboxService} from '../inbox/service.js';
import type {InboxDTO} from '../inbox/types.js';
import type {Identity} from '../security/auth.js';
import type {AgentGuardIncidents,AgentGuardProjection} from './types.js';

type Check=AgentGuardProjection['decision']['checks'][number];
const limitations=[
 'This is a reading of saved application records, not a fresh blockchain verification.',
 'The existing vaults do not implement AgentGuard delegation chains, daily limits, frequency limits or a global pause.',
 'An application hold or source quarantine does not revoke an exported wallet approval. Confirmed cancellation or expiry must be checked separately.',
 'Source and stage hashes identify recorded content; they do not authenticate a sender, prove message origin or establish that the content is true.',
 'Priority only orders human review. It never permits, blocks, signs or submits a payment.',
];

/** Deliberately separate from payment eligibility: this score is not read by execution. */
export function reviewPriority(input:{risks?:{severity:string;code:string}[];checks?:Check[];hold?:string|null;uncertainPayment?:boolean;assessed:boolean}):AgentGuardProjection['priority']{
 const reasons:string[]=[];let score=0;
 if(input.risks?.some(r=>r.severity==='high')){score=Math.max(score,.9);reasons.push('A recorded high-severity security finding needs investigation.');}
 if(input.uncertainPayment){score=Math.max(score,.85);reasons.push('The recorded payment outcome is uncertain or inconsistent.');}
 if(input.checks?.some(c=>!c.passed&&c.severity==='HARD')){score=Math.max(score,.8);reasons.push('A recorded deterministic business check failed.');}
 if(input.risks?.length&&!reasons.length){score=Math.max(score,.6);reasons.push('Recorded source findings require review.');}
 if(input.hold){score=Math.max(score,.6);reasons.push('An application or workflow hold is recorded.');}
 if(input.checks?.some(c=>!c.passed&&c.severity==='ATTENTION')){score=Math.max(score,.5);reasons.push('Recorded document instructions require independent human attention.');}
 const assessed=input.assessed||reasons.length>0;
 return {level:!assessed?'UNASSESSED':score>=.8?'HIGH':score>=.5?'MEDIUM':'LOW',score:assessed?score:null,reasons:reasons.length?reasons:[assessed?'No priority-raising finding appears in the available records. This does not authenticate the source.':'No completed assessment is recorded.'],policyVersion:'agentguard-priority.v1',purpose:'REVIEW_ORDER_ONLY'};
}

export class AgentGuardReadService{
 constructor(readonly db:Db,readonly payments:Service,readonly inbox:InboxService){}

 private checks(user:Identity,id:string){
  const context=this.payments.context(user.tenantId,id);
  const run=this.db.prepare('SELECT record_versions,results,created_at FROM business_check_runs WHERE case_id=? ORDER BY rowid DESC LIMIT 1').get(id) as any;
  const versions=run?parsed<any>(run.record_versions):null;
  return {checks:run?parsed<Check[]>(run.results,[]):[],current:run?String(versions?.document)===String(context.row.document_version)&&String(versions?.payable)===String(context.payable.version)&&String(versions?.supplier)===String(context.supplier.version):null};
 }

 private payment(c:any|null):AgentGuardProjection['payment']{
  if(!c)return {status:'NOT_APPLICABLE',executionStatus:'NONE',observedAt:null,blockNumber:null,summary:'No linked payment workflow is recorded.'};
  const automatic=c.paymentRoute==='REGISTERED_POLICY',p=automatic?c.automationPayment:c;
  const receipt=automatic?p?.receipt:c.settlement;
  // A status label or transaction hash alone is insufficient, even in a saved projection.
  const recordedReceipt=receipt&&typeof receipt.blockNumber==='string'&&/^[0-9]+$/.test(receipt.blockNumber)&&!!(receipt.txHash??receipt.transactionHash)&&!!receipt.blockHash;
  const verified=p?.settlementStatus==='SETTLED'&&recordedReceipt;
  const executionStatus=p?.executionStatus??'NONE';
  const unresolved=!verified&&(executionStatus!=='NONE'||p?.settlementStatus==='SETTLED');
  return {status:verified?'VERIFIED':unresolved?'UNRESOLVED':'NOT_RECORDED',executionStatus,observedAt:verified?(receipt.verifiedAt??receipt.observedAt??receipt.confirmedAt??null):null,blockNumber:verified?receipt.blockNumber:null,summary:verified?'The application recorded verification of an executed receipt for the linked invoice. This projection does not query the network.':unresolved?'No complete verified receipt is available in this projection. A submitted hash, failed attempt or closed review does not establish payment.':'No verified executed payment is recorded.'};
 }

 private authority(c:any|null):AgentGuardProjection['authority']{
  const automatic=c?.paymentRoute==='REGISTERED_POLICY';
  return {model:!c?'NONE':automatic?'EXACT_REGISTERED_POLICY':'HUMAN_WALLET',enforcement:c?'CONTRACT_PAYMENT_TERMS':'NO_PAYMENT_WORKFLOW',status:!c?'NO_PAYMENT_WORKFLOW':automatic?'REGISTERED_POLICY':c.authorizationStatus??'NO_WALLET_AUTHORIZATION_RECORDED',summary:!c?'Workflow review creates no payment authority.':automatic?'The existing standing policy permits only an exact owner-registered obligation. It is not an agent delegation chain.':'The existing PaymentGuard requires a separate eligible human wallet signature over exact payment terms.',delegation:'NOT_IMPLEMENTED',dailyBudget:null,frequencyLimit:null,globalCircuit:'NOT_IMPLEMENTED',agentCanAuthorize:false};
 }

 private evidence(c:any|null,payment:AgentGuardProjection['payment']):AgentGuardProjection['evidence']{
  return {scope:c?.latestProposal?'FROZEN_PAYMENT_MANIFEST_AND_SEPARATE_LATER_OBSERVATIONS':'APPLICATION_RECORDS',anchoring:payment.status==='VERIFIED'?'PAYMENT_RECEIPT_RECORDED':'NOT_RECORDED',summary:payment.status==='VERIFIED'?'A payment receipt with an evidence commitment is recorded for the linked invoice. That does not anchor every inbox decision, this projection, or a later incident draft.':c?.latestProposal?'A frozen evidence manifest exists. Its creation or signature alone does not establish onchain inclusion. Later incident reports are not part of that frozen manifest.':'No verified onchain evidence anchor is recorded here. Source hashes and saved reviews remain application records.'};
 }

 case(user:Identity,id:string):AgentGuardProjection{
  const c=this.payments.project(user,id); // Tenant ownership is established before joins.
  const checks=this.checks(user,id),payment=this.payment(c);
  const linked=(this.db.prepare('SELECT id FROM inbox_items WHERE tenant_id=? AND linked_case_id=? ORDER BY created_at DESC LIMIT 1').get(user.tenantId,id) as {id:string}|undefined);
  const item=linked?this.inbox.project(user,linked.id):null;
  const provenance:AgentGuardProjection['provenance']={sourceKind:c.document?'EXTERNAL_DOCUMENT':'UNKNOWN',channel:item?.channel??null,sourceHash:c.document?.sha256??null,textHash:null,senderAuthenticated:false,originAttested:false,transport:'NOT_RECORDED',summary:'The currently attached document is external evidence. Historical records do not attest the intake actor, transport or claimed instruction origin. The stages below are runs for the current document revision; completion timestamps are not recorded separately.',stages:(c.analysis?.runs??[]).map((run:any)=>({id:run.agent,status:run.status??run.outcome,mode:run.mode??null,completedAt:null,sourceHash:c.document?.sha256??null}))};
  const incident=this.incident(item);
  return {schemaVersion:'secure-finance.agentguard-projection.v1',generatedAt:new Date().toISOString(),subject:{kind:'case',id,title:c.invoiceReference,version:c.version},authority:this.authority(c),provenance,decision:{status:c.workflowStatus,hold:c.holdReason,checksCurrent:checks.current,checks:checks.checks,workflowOnly:true},priority:reviewPriority({risks:item?.risks,checks:checks.checks,hold:c.holdReason,uncertainPayment:['UNKNOWN','INCONSISTENT'].includes(payment.executionStatus),assessed:checks.current===true}),payment,evidence:this.evidence(c,payment),incident:{...incident,draftEligible:false},limitations:[...limitations,...checks.current===false?['Recorded business checks refer to older source or registry versions; they are not current approval evidence.']:[]]};
 }

 private source(item:InboxDTO):AgentGuardProjection['provenance']{
  return {sourceKind:item.channel==='invoice'?'EXTERNAL_DOCUMENT':item.channel==='voice'?'EXTERNAL_TRANSCRIPT':'EXTERNAL_MESSAGE',channel:item.channel,sourceHash:item.source.sha256,textHash:item.source.textHash,senderAuthenticated:false,originAttested:false,transport:'NOT_RECORDED',summary:'Channel, content hashes and specialist methods are recorded by the application. The historical intake record does not attest who authored the message or whether it carried legitimate instructions. A transcript does not authenticate its speaker.',stages:item.stages.map(s=>({id:s.id,status:s.status,mode:s.mode,completedAt:s.completedAt,sourceHash:s.sourceHash}))};
 }

 private incident(item:InboxDTO|null):AgentGuardProjection['incident']{
  const relevant=!!item&&(item.risks.length>0||item.notifications.some(n=>n.kind==='security_hold'));
  return {relevant,reason:relevant?'Recorded source security findings can support an incident assessment. They do not establish a legally major ICT incident.':'No recorded source security finding establishes an incident for this item.',draftEligible:relevant};
 }

 item(user:Identity,id:string):AgentGuardProjection{
  const item=this.inbox.project(user,id),c=item.linkedCaseId?this.payments.project(user,item.linkedCaseId):null;
  const checks=c?this.checks(user,c.id):{checks:[],current:null},payment=this.payment(c);
  const hold=['quarantined','needs_review'].includes(item.status)?item.approval.reason:null;
  return {schemaVersion:'secure-finance.agentguard-projection.v1',generatedAt:new Date().toISOString(),subject:{kind:'inbox',id,title:item.title,version:item.version},authority:this.authority(c),provenance:this.source(item),decision:{status:item.status,hold,checksCurrent:checks.current,checks:checks.checks,workflowOnly:true},priority:reviewPriority({risks:item.risks,checks:checks.checks,hold,uncertainPayment:['UNKNOWN','INCONSISTENT'].includes(payment.executionStatus),assessed:item.stages.some(s=>s.id==='final_audit'&&s.status==='passed')}),payment,evidence:this.evidence(c,payment),incident:this.incident(item),limitations:[...limitations,'A linked invoice may have been paid through another submission; its payment does not approve this source.']};
 }

 incidents(user:Identity,query:{limit:number;offset:number},now=new Date()):AgentGuardIncidents{
  // One durable security notification per item; repeated reads/retries are not incidents.
  const total=(this.db.prepare("SELECT COUNT(*) n FROM inbox_notifications WHERE tenant_id=? AND kind='security_hold'").get(user.tenantId) as {n:number}).n;
  const rows=this.db.prepare("SELECT n.item_id,n.created_at AS detected_at,i.title,i.status,i.updated_at,i.risks FROM inbox_notifications n JOIN inbox_items i ON i.id=n.item_id AND i.tenant_id=n.tenant_id WHERE n.tenant_id=? AND n.kind='security_hold' ORDER BY n.created_at DESC,n.id DESC LIMIT ? OFFSET ?").all(user.tenantId,query.limit,query.offset) as any[];
  const windowStart=new Date(now.getTime()-600000).toISOString(),windowEnd=now.toISOString();
  const count=(this.db.prepare("SELECT COUNT(DISTINCT item_id) n FROM inbox_notifications WHERE tenant_id=? AND kind='security_hold' AND created_at>=? AND created_at<=?").get(user.tenantId,windowStart,windowEnd) as {n:number}).n;
  return {schemaVersion:'secure-finance.agentguard-incidents.v1',generatedAt:windowEnd,scope:'APPLICATION_OBSERVATIONS_ONLY',items:rows.map(row=>{const risks=parsed<{severity:string;code:string}[]>(row.risks,[]);return {id:row.item_id,title:row.title,status:row.status,detectedAt:row.detected_at,latestRecordedAt:row.updated_at,riskCodes:risks.map(r=>r.code),priority:reviewPriority({risks,hold:row.status==='quarantined'?'Recorded quarantine':null,assessed:true}),draftEligible:true};}),total,limit:query.limit,offset:query.offset,circuitSignals:count>=3?[{code:'REPEATED_SECURITY_HOLDS',count,windowStart,windowEnd,scope:'TENANT_INBOX',state:'PROPOSED_REVIEW_SIGNAL',summary:'At least three distinct inbox sources generated security-hold notifications in ten minutes. Investigate the pattern; this does not identify one attacking agent or pause a contract.'}]:[],circuit:{enforcement:'APPLICATION_ONLY',contractPause:'NOT_IMPLEMENTED',actionTaken:'NONE_BY_THIS_PROJECTION'},limitations:['These are recorded source security observations, not confirmed attacks or regulatory classifications.','The ten-minute signal counts distinct source items across this tenant, not payment refusals by a known agent.','This read-only endpoint does not create an incident, send an alert, pause a contract or make a regulatory submission.','Notification history can be incomplete; absence of a signal does not establish absence of an attack.']};
 }
}
