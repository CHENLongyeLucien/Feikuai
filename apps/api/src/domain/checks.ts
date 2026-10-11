import { parseAmount,type IntakeResult,type FinanceResult,validateSourceSpan } from '@secure-finance/shared';
import { type PageText } from '../security/artifacts.js';
export type Check={code:string;passed:boolean;severity:'HARD'|'ATTENTION';summary:string};
/** Exact document quote remains unchanged; grouping and mixed separators stay unsupported. */
export function parseDocumentAmount(value:string){return parseAmount(/^[0-9]+,[0-9]{1,2}$/.test(value)?value.replace(',','.'):value);}
export function businessChecks(input:{intake:IntakeResult;finance:FinanceResult;payable:any;supplier:any;pages:PageText[];deployment:any;settled:boolean;unresolved:boolean}):Check[]{
 const {intake:i,finance:f,payable:p,supplier:s,deployment:d}=input;const checks:Check[]=[];
 const add=(code:string,passed:boolean,summary:string,severity:Check['severity']='HARD')=>checks.push({code,passed,severity,summary});
 add('REQUIRED_FACTS',!!i.invoiceReference&&!!i.amountDecimalCandidate&&!!i.displayedAsset&&!!i.supplierReference&&!i.missingFields.length,'Required invoice facts must be present and unambiguous.');
 add('INVOICE_IDENTITY',i.invoiceReference===p.invoiceReference&&i.supplierReference===p.supplierKey,'Invoice and supplier references must match the selected trusted payable.');
 let amount:string|null=null;try{amount=i.amountDecimalCandidate?parseDocumentAmount(i.amountDecimalCandidate):null;}catch{/* invalid or ambiguous decimal remains a failure */}
 add('EXACT_AMOUNT',amount===p.amountAtomic,'Invoice amount must exactly match the full payable in atomic units.');
 add('TOKEN_IDENTITY',i.displayedAsset==='DEMO'&&p.token===d?.token,'Pinned DEMO token and source asset must agree.');
 add('RECIPIENT',i.claimedRecipient===null||i.claimedRecipient.toLowerCase()===s.recipient,'Any claimed recipient must exactly match the trusted supplier.');
 add('VAULT_MAPPING',d?.registry.some((r:any)=>r.supplierKey===p.supplierKey&&r.recipient===s.recipient)??false,'Reviewed supplier mapping must equal the fixed vault mapping.');
 add('AMOUNT_POLICY',BigInt(p.amountAtomic)>0n&&BigInt(p.amountAtomic)<=BigInt(d?.maxPerPaymentAtomic??'0'),'Full amount must fit the vault ceiling.');
 add('RECORD_IDENTITY',f.payableRecordId===p.id&&f.supplierRecordId===s.id,'Finance output must refer to the server-selected records.');
 add('RECORD_VERSIONS',f.payableRecordVersion===p.version&&f.supplierRecordVersion===s.version,'Agent record versions must remain current.');
 add('SOURCE_POINTERS',i.fieldSources.every(x=>validateSourceSpan(x.span,input.pages.map(p=>p.text)))&&i.suspiciousInstructions.every(x=>validateSourceSpan(x.span,input.pages.map(p=>p.text))),'All quoted source spans must match stored UTF-16 page text.');
 for(const field of ['invoiceReference','supplierReference','amountDecimalCandidate','displayedAsset','claimedRecipient'] as const){if(i[field]!==null)add(`SOURCE_${field}`,i.fieldSources.some(x=>x.field===field&&x.span.quote===i[field]),`Extracted ${field} must have an exact supporting source quote.`);}
 add('UNSETTLED',!input.settled,'A verified settlement prevents another proposal.');add('NO_UNRESOLVED_EXECUTION',!input.unresolved,'Unknown or pending execution must be reconciled first.');
 add('DOCUMENT_INSTRUCTIONS',i.suspiciousInstructions.length===0,'Suspicious source prose requires explicit human attention and conveys no authority.','ATTENTION');
 return checks;
}
