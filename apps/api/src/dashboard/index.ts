import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {DashboardDTO} from '@secure-finance/shared';
import type {Db} from '../db/database.js';
import {loadDeployment,type Config} from '../config.js';
import {requireIdentity,type Identity} from '../security/auth.js';

type Payable={id:string;invoice_key:string;invoice_reference:string;amount_atomic:string;token:string;supplier_key:string;recipient:string;snapshot:string};
type Source={id:string;channel:'invoice'|'email'|'voice'|'text';title:string;status:string;created_at:string;updated_at:string;linked_case_id:string|null};
type RecordedPayment={id:string;invoiceKey:string;caseId?:string;itemId?:string;at:string|null;amount:bigint};
const object=(value:string|null):Record<string,unknown>=>{try{const parsed:unknown=JSON.parse(value||'null');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};}catch{return {};}};
const atomic=(value:unknown):value is string=>typeof value==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(value)&&BigInt(value)<2n**256n;
const hash=(value:unknown):value is string=>typeof value==='string'&&/^0x[0-9a-f]{64}$/i.test(value);
const same=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const date=(value:unknown):string|null=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const pending=['PREPARING','PREPARED','SUBMITTED','PENDING','UNKNOWN','INCONSISTENT'];

/** Read recorded receipt observations; never poll RPC, sign, run agents or execute payments. */
export function projectDashboard(db:Db,config:Config,user:Identity,days:7|30|90,now=new Date()):DashboardDTO{
 let token:string|null=null;
 try{const deployment=loadDeployment(config);if(deployment?.chainId===config.CHAIN_ID)token=deployment.token;}catch{/* Report unavailable financial coverage without inventing a token. */}
 const limitations=['Totals cover this workspace’s configured test token, not personal wealth or revenue.','Payment charts use the UTC date a verified receipt was recorded, not its block timestamp.','Workflow approval does not mean a payment was made.'];
 const allPayables=db.prepare('SELECT p.*,s.supplier_key,s.recipient,s.snapshot FROM payables p JOIN supplier_versions s ON s.id=p.supplier_id AND s.tenant_id=p.tenant_id WHERE p.tenant_id=?').all(user.tenantId) as Payable[];
 const payables=allPayables.filter(p=>token&&same(p.token,token)&&atomic(p.amount_atomic));
 const byKey=new Map(payables.map(p=>[p.invoice_key,p]));
 const byId=new Map(payables.map(p=>[p.id,p]));
 const sources=db.prepare('SELECT id,channel,title,status,created_at,updated_at,linked_case_id FROM inbox_items WHERE tenant_id=?').all(user.tenantId) as Source[];
 const sourceIds=new Set(sources.map(s=>s.id));
 const caseIds=new Set((db.prepare('SELECT id FROM cases WHERE tenant_id=?').all(user.tenantId) as Array<{id:string}>).map(c=>c.id));
 const verified=new Map<string,RecordedPayment>();
 let excludedUnverifiedCount=0,duplicateCount=0;
 const include=(p:RecordedPayment)=>{const old=verified.get(p.invoiceKey);if(old){duplicateCount++;if(old.at&&(!p.at||old.at<=p.at))return;}verified.set(p.invoiceKey,p);};
 const termsMatch=(receipt:Record<string,unknown>,p:Payable,chainId:string,vault:string,txHash:string)=>
  chainId===config.CHAIN_ID&&String(receipt.chainId)===chainId&&same(receipt.token,p.token)&&same(receipt.vault,vault)&&
  receipt.invoiceKey===p.invoice_key&&receipt.amountAtomic===p.amount_atomic&&same(receipt.supplierKey,p.supplier_key)&&same(receipt.recipient,p.recipient)&&
  hash(txHash)&&hash(receipt.blockHash)&&atomic(receipt.blockNumber)&&Number.isSafeInteger(receipt.logIndex)&&Number(receipt.logIndex)>=0;
 const human=db.prepare('SELECT id,invoice_key,chain_id,vault_address,tx_hash,case_id,details,created_at FROM settlements WHERE tenant_id=?').all(user.tenantId) as Array<{id:string;invoice_key:string;chain_id:string;vault_address:string;tx_hash:string;case_id:string|null;details:string;created_at:string}>;
 for(const row of human){
  const p=byKey.get(row.invoice_key),d=object(row.details),receipt=d.receipt as Record<string,unknown>|undefined;
  if(!p||!termsMatch(d,p,row.chain_id,row.vault_address,row.tx_hash)||!same(d.txHash,row.tx_hash)||!receipt||receipt.status!=='success'||!same(receipt.transactionHash,row.tx_hash)){excludedUnverifiedCount++;continue;}
  include({id:`payment:${row.id}`,invoiceKey:p.invoice_key,amount:BigInt(p.amount_atomic),at:date(d.observedAt)??date(row.created_at),...(row.case_id&&caseIds.has(row.case_id)?{caseId:row.case_id}:{})});
 }
 const automated=db.prepare('SELECT id,item_id,payable_id,invoice_key,chain_id,vault,tx_hash,status,receipt,updated_at FROM automation_payments WHERE tenant_id=?').all(user.tenantId) as Array<{id:string;item_id:string;payable_id:string;invoice_key:string;chain_id:string;vault:string;tx_hash:string;status:string;receipt:string|null;updated_at:string}>;
 for(const row of automated){
  if(row.status!=='CONFIRMED')continue;
  const p=byId.get(row.payable_id),r=object(row.receipt);
  if(!p||row.invoice_key!==p.invoice_key||!termsMatch(r,p,row.chain_id,row.vault,row.tx_hash)||!same(r.transactionHash,row.tx_hash)||!hash(r.termsHash)||!hash(r.evidenceCommitment)){excludedUnverifiedCount++;continue;}
  include({id:`payment:${row.id}`,invoiceKey:p.invoice_key,amount:BigInt(p.amount_atomic),at:date(r.verifiedAt)??date(row.updated_at),...(sourceIds.has(row.item_id)?{itemId:row.item_id}:{})});
 }
 const unresolved=new Set<string>();
 for(const row of db.prepare('SELECT p.invoice_key,e.status FROM execution_requests e JOIN proposals q ON q.id=e.proposal_id AND q.tenant_id=e.tenant_id JOIN cases c ON c.id=q.case_id AND c.tenant_id=e.tenant_id JOIN payables p ON p.id=c.payable_id AND p.tenant_id=e.tenant_id WHERE e.tenant_id=?').all(user.tenantId) as Array<{invoice_key:string;status:string}>)if(pending.includes(row.status)&&byKey.has(row.invoice_key)&&!verified.has(row.invoice_key))unresolved.add(row.invoice_key);
 for(const row of automated)if(pending.includes(row.status)&&byKey.has(row.invoice_key)&&!verified.has(row.invoice_key))unresolved.add(row.invoice_key);
 const end=new Date(now);end.setUTCHours(23,59,59,999);const start=new Date(end);start.setUTCDate(end.getUTCDate()-days+1);start.setUTCHours(0,0,0,0);
 const daily:DashboardDTO['daily']=Array.from({length:days},(_,i)=>({date:new Date(start.getTime()+i*86400000).toISOString().slice(0,10),inboxCount:0,workflowApprovedCount:0,verifiedPaidCount:0,verifiedPaidAtomic:'0'}));
 const byDate=new Map(daily.map(d=>[d.date,d]));
 const channels:DashboardDTO['channels']=(['invoice','email','voice','text'] as const).map(channel=>({channel,count:sources.filter(s=>s.channel===channel).length}));
 for(const s of sources){const day=byDate.get(date(s.created_at)?.slice(0,10)||'');if(day)day.inboxCount++;}
 // Approval events retain their own date even if the source is reviewed again.
 const approvals=db.prepare("SELECT n.item_id,MIN(n.created_at) at FROM inbox_notifications n JOIN inbox_items i ON i.id=n.item_id AND i.tenant_id=n.tenant_id WHERE n.tenant_id=? AND n.kind='workflow_approved' GROUP BY n.item_id").all(user.tenantId) as Array<{item_id:string;at:string}>;
 for(const approval of approvals){const day=byDate.get(date(approval.at)?.slice(0,10)||'');if(day)day.workflowApprovedCount++;}
 const suppliers=new Map<string,DashboardDTO['suppliers'][number]>();
 let registered=0n,paid=0n,undatedSettlementsCount=0;
 for(const p of payables){
  const snapshot=object(p.snapshot),name=typeof snapshot.name==='string'?snapshot.name:'Registered supplier';
  let supplier=suppliers.get(p.supplier_key);if(!supplier){supplier={supplierKey:p.supplier_key,name,payablesCount:0,registeredAtomic:'0',verifiedPaidCount:0,verifiedPaidAtomic:'0'};suppliers.set(p.supplier_key,supplier);}
  const value=BigInt(p.amount_atomic);registered+=value;supplier.payablesCount++;supplier.registeredAtomic=(BigInt(supplier.registeredAtomic)+value).toString();
  const settlement=verified.get(p.invoice_key);if(settlement){paid+=settlement.amount;supplier.verifiedPaidCount++;supplier.verifiedPaidAtomic=(BigInt(supplier.verifiedPaidAtomic)+settlement.amount).toString();if(!settlement.at)undatedSettlementsCount++;else{const day=byDate.get(settlement.at.slice(0,10));if(day){day.verifiedPaidCount++;day.verifiedPaidAtomic=(BigInt(day.verifiedPaidAtomic)+settlement.amount).toString();}}}
 }
 const recentActivity:DashboardDTO['recentActivity']=[...sources.map(s=>({id:`source:${s.id}`,kind:'source' as const,title:s.title,status:s.status,occurredAt:date(s.updated_at)??s.created_at,itemId:s.id})),...[...verified.values()].filter(p=>p.at).map(p=>({id:p.id,kind:'payment' as const,title:byKey.get(p.invoiceKey)!.invoice_reference,status:'settled',occurredAt:p.at!,...(p.itemId?{itemId:p.itemId}:{}),...(p.caseId?{caseId:p.caseId}:{})}))].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id)).slice(0,12);
 if(!token)limitations.push('Financial totals are unavailable until a valid deployment for this environment is configured.');
 if(allPayables.length!==payables.length)limitations.push(`${allPayables.length-payables.length} registered records are outside the configured token or have invalid amounts and are excluded.`);
 if(excludedUnverifiedCount)limitations.push(`${excludedUnverifiedCount} payment records lack matching recorded receipt coverage and are excluded from paid totals.`);
 if(duplicateCount)limitations.push(`${duplicateCount} duplicate receipt records were counted once per invoice.`);
 if(undatedSettlementsCount)limitations.push(`${undatedSettlementsCount} recorded payments have no usable observation date and are excluded from the daily chart.`);
 return {schemaVersion:'finance-dashboard.v1',generatedAt:now.toISOString(),window:{days,from:start.toISOString(),to:now.toISOString(),timeZone:'UTC'},workspace:{name:(db.prepare('SELECT name FROM tenants WHERE id=?').get(user.tenantId) as {name:string}|undefined)?.name??'Your workspace',environment:config.APP_ENV,dataEnvironment:'synthetic',accountRoles:user.roles},token:{symbol:'DEMO',decimals:6},totals:{registeredPayablesCount:payables.length,registeredPayablesAtomic:registered.toString(),verifiedPaidCount:verified.size,verifiedPaidAtomic:paid.toString(),unpaidRegisteredCount:payables.length-verified.size,unpaidRegisteredAtomic:(registered-paid).toString(),inboxCount:sources.length,needsReviewCount:sources.filter(s=>s.status==='needs_review').length,securityHoldCount:sources.filter(s=>s.status==='quarantined').length,unresolvedPaymentCount:unresolved.size},daily,channels,suppliers:[...suppliers.values()].sort((a,b)=>BigInt(a.verifiedPaidAtomic)===BigInt(b.verifiedPaidAtomic)?a.name.localeCompare(b.name):BigInt(a.verifiedPaidAtomic)>BigInt(b.verifiedPaidAtomic)?-1:1),recentActivity,coverage:{financialsAvailable:!!token,basis:'Tenant records and previously verified receipt observations, deduplicated by invoice; no live chain or bank-balance query.',excludedUnverifiedCount,undatedSettlementsCount,limitations}};
}
export async function registerDashboard(app:FastifyInstance,db:Db,config:Config){
 app.get('/api/v1/dashboard',async req=>{const user=requireIdentity(db,req);const {days}=z.object({days:z.coerce.number().refine((value):value is 7|30|90=>[7,30,90].includes(value)).default(30)}).strict().parse(req.query);return db.transaction(()=>projectDashboard(db,config,user,days))();});
}
