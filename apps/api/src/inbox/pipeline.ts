import {hash} from '../security/artifacts.js';
import type {Classification,Evidence,InboxChannel,InboxStage,LinkObservation,Risk} from './types.js';

export function classify(text:string,channel:InboxChannel):Classification{
 if(/\b(?:you(?:'ve| have)? won|claim (?:your )?prize|lottery winner|guaranteed (?:profit|returns)|make money fast)\b/i.test(text))return {category:'spam',label:'Possible spam',confidence:'rule_match',summary:'The message contains unsolicited reward or promotional language.'};
 if(channel==='invoice'||/\b(?:invoice|facture|amount due|payment due)\b/i.test(text))return {category:'invoice',label:'Invoice',confidence:'rule_match',summary:'Invoice or payable information needs trusted-record checks.'};
 if(/\b(?:please|could you|can you|request|customer|client|schedule|meeting|support)\b/i.test(text))return {category:'client_request',label:'Client request',confidence:'rule_match',summary:'A request is ready to be checked for context, security and policy.'};
 return {category:'general_message',label:'General message',confidence:'needs_context',summary:'A person should confirm the purpose before this message is cleared.'};
}
function evidence(text:string,re:RegExp,label:string):Evidence[]{const match=re.exec(text);return match?[{kind:'source',label,quote:match[0].slice(0,300),start:match.index,end:match.index+Math.min(match[0].length,300)}]:[];}
export function securityReview(text:string,classification:Classification):{risks:Risk[];links:LinkObservation[]}{
 const risks:Risk[]=[];
 const rules:Array<{code:string;title:string;detail:string;pattern:RegExp}>=[
  {code:'EMBEDDED_INSTRUCTIONS',title:'Instructions target the workflow',detail:'Source content asks the system to ignore safeguards or call privileged tools. It has no authority.',pattern:/[^\r\n]*(?:ignore (?:all |previous |the )?(?:instructions|policy|rules)|executePayment|"role"\s*:\s*"system"|bypass (?:the |your )?(?:checks|policy|old)|do not reveal)[^\r\n]*/i},
  {code:'CLAIMED_APPROVAL',title:'Approval is claimed inside the message',detail:'A claimed executive approval is not a verified human or wallet authorization.',pattern:/[^\r\n]*(?:already approved|CFO.{0,70}approv|without (?:requesting |a )?(?:signature|approval)|approved.{0,30}(?:immediately|payment))[^\r\n]*/i},
  {code:'PAYMENT_DESTINATION_CHANGE',title:'Payment destination change requested',detail:'Changes to bank or wallet instructions require independent verification through trusted records.',pattern:/[^\r\n]*(?:replacement recipient|(?:change|replace|update|new).{0,30}(?:bank account|wallet address|payment details|recipient)|send.{0,25}(?:instead|different account))[^\r\n]*/i},
  {code:'CREDENTIAL_REQUEST',title:'Sensitive credential request',detail:'The message requests a secret or authentication code. Do not provide credentials.',pattern:/[^\r\n]*(?:send|share|enter|provide|reveal).{0,60}(?:password|private key|seed phrase|recovery phrase|verification code|2fa code)[^\r\n]*/i},
  {code:'EXECUTABLE_CONTENT',title:'Executable or active content',detail:'Active content is retained as untrusted text and is never executed.',pattern:/<script\b|javascript:|data:text\/html|powershell\s|curl\s.{0,100}\|\s*(?:sh|bash)/i},
 ];
 for(const rule of rules){const references=evidence(text,rule.pattern,rule.title);if(references.length)risks.push({code:rule.code,severity:'high',title:rule.title,detail:rule.detail,evidence:references});}
 const urls=[...new Set(text.match(/\bhttps?:\/\/[^\s<>"']{1,2048}/gi)??[])].slice(0,30);
 const links=urls.map(url=>({url,status:'unverified' as const,reason:'No isolated URL-scanning provider is configured. This link was not opened or fetched.'}));
 if(links.length)risks.push({code:'UNVERIFIED_LINK',severity:'medium',title:'Links require independent verification',detail:'Links cannot be declared safe from their text. Review them with an approved isolated scanner before acting.',evidence:links.slice(0,5).map(link=>({kind:'source',label:'Unverified URL',quote:link.url,start:text.indexOf(link.url),end:text.indexOf(link.url)+link.url.length}))});
 if(classification.category==='spam')risks.push({code:'POSSIBLE_SPAM',severity:'medium',title:'Possible spam',detail:'Unsolicited reward language requires a person to investigate or reject the item.',evidence:evidence(text,/[^\r\n]*(?:prize|lottery|won|guaranteed|make money fast)[^\r\n]*/i,'Promotional language')});
 return {risks,links};
}
export function financeDecision(text:string,classification:Classification,caseProjection:any|null){
 if(classification.category==='invoice'){
  if(!caseProjection)return {clear:false,pending:false,summary:'Select a trusted payable before invoice checks can establish the client, amount and recipient.',evidence:[{kind:'rule',label:'Invoices require an existing trusted payable'}] as Evidence[]};
  const pending=['RECEIVED','EXTRACTING','CHECKING'].includes(caseProjection.workflowStatus);
  const clear=caseProjection.workflowStatus==='READY_FOR_REVIEW'&&Array.isArray(caseProjection.checks)&&caseProjection.checks.length>0&&caseProjection.checks.every((c:any)=>c.passed)&&caseProjection.settlementStatus!=='SETTLED'&&['NONE','REVERTED'].includes(caseProjection.executionStatus);
  return {clear,pending,summary:pending?'Existing invoice specialists are checking the source against trusted records.':clear?'Invoice facts match the trusted payable and supplier; no business discrepancy remains.':caseProjection.settlementStatus==='SETTLED'?'This invoice already has a verified settlement. It cannot be paid again.':'The invoice has an unresolved business check, approval issue or execution outcome.',evidence:[{kind:'record',label:'Trusted payable and existing invoice checks',reference:caseProjection.id},{kind:'record',label:'Stable invoice identity',reference:caseProjection.invoiceKey}] as Evidence[]};
 }
 const financial=/\b(?:pay(?:ment)?|transfer|refund|withdraw|bank|wallet|purchase|contract|salary|account change)\b/i.test(text);
 return {clear:classification.category==='client_request'&&!financial&&text.trim().length>=15,pending:false,summary:financial?'A financial or account-changing request needs a person to verify scope and authority.':classification.category==='client_request'?'This request does not instruct a payment or account change. No external action has been taken.':'More client context is needed to determine the requested action.',evidence:[{kind:'rule',label:'Only clear, non-financial requests may receive automatic workflow clearance'}] as Evidence[]};
}
/** Independent recomputation: no earlier stage decision is accepted as authority. */
export function finalAudit(input:{text:string;textHash:string;sourceHash:string;channel:InboxChannel;stages:InboxStage[];caseProjection:any|null;actualSourceHash:string}){
 const classification=classify(input.text,input.channel),security=securityReview(input.text,classification),finance=financeDecision(input.text,classification,input.caseProjection);
 const errors:string[]=[];
 if(hash(input.text)!==input.textHash||input.actualSourceHash!==input.sourceHash)errors.push('Source integrity changed after intake.');
 for(const id of ['classification','security','client_finance','policy']){const stage=input.stages.find(s=>s.id===id);if(!stage||stage.sourceHash!==input.sourceHash||stage.status==='pending')errors.push(`Missing or mismatched ${id} evidence.`);}
 const expectedClear=security.risks.length===0&&finance.clear;
 const policy=input.stages.find(s=>s.id==='policy');if(policy?.status==='passed'&&!expectedClear)errors.push('Earlier policy clearance disagrees with independently checked source and records.');
 if(security.risks.length&&input.stages.find(s=>s.id==='security')?.status==='passed')errors.push('Security clearance contradicts source findings.');
 return {clear:errors.length===0&&expectedClear,quarantine:security.risks.length>0||errors.length>0,pending:finance.pending,errors,classification,security,finance,summary:errors.length?'Final audit found inconsistent source or decision evidence.':security.risks.length?'Final audit independently confirmed the security hold.':finance.pending?'Final audit is waiting for the existing invoice checks.':expectedClear?'Source integrity, security findings and current policy checks agree. Workflow clearance is permitted.':'Final audit requires human review; the available evidence is not sufficient for automatic clearance.'};
}
