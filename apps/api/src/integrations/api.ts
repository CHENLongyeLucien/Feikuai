import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {keccak256,toHex} from 'viem';
import {z} from 'zod';
import {addressSchema} from '@secure-finance/shared';
import {type Config,loadDeployment} from '../config.js';
import {type Db,enqueue,event} from '../db/database.js';
import type {Service} from '../domain/service.js';
import {fail,json,parsed} from '../domain/errors.js';
import type {Identity} from '../security/auth.js';

/**
 * Integration API for ERPs and accounting systems: the same engine as the Workspace, called server to server.
 * A bearer token is bound to exactly one tenant and acts as an operator: it can import payables, submit
 * invoices and read results, but it can never create, sign or execute payment authority. A person still
 * approves every payment in the approval application.
 */
const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function migrateIntegrations(db:Db){
 db.exec('CREATE TABLE IF NOT EXISTS integration_tokens(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,revoked_at TEXT)');
}
/** Returns the secret once; only its SHA-256 is stored. */
export function issueIntegrationToken(db:Db,tenantId:string,name:string){
 migrateIntegrations(db);if(!db.prepare('SELECT 1 FROM tenants WHERE id=?').get(tenantId))fail('TENANT_NOT_FOUND',`Tenant ${tenantId} does not exist.`,404);
 const id=randomUUID(),token=`sfk_${Buffer.from(randomBytes(32)).toString('base64url')}`;
 db.prepare('INSERT INTO integration_tokens VALUES(?,?,?,?,?,NULL)').run(id,tenantId,name,tokenHash(token),new Date().toISOString());
 return {id,tenantId,name,token};
}
export function revokeIntegrationToken(db:Db,id:string){migrateIntegrations(db);return db.prepare('UPDATE integration_tokens SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(new Date().toISOString(),id).changes>0;}

function integrationIdentity(db:Db,req:FastifyRequest):Identity{
 const header=String(req.headers.authorization??'');const match=/^Bearer (sfk_[A-Za-z0-9_-]{20,100})$/.exec(header);
 if(!match)fail('UNAUTHENTICATED','Send a valid integration token as "Authorization: Bearer <token>".',401);
 const row=db.prepare('SELECT id,tenant_id FROM integration_tokens WHERE token_hash=? AND revoked_at IS NULL').get(tokenHash(match![1]!)) as {id:string;tenant_id:string}|undefined;
 if(!row)fail('UNAUTHENTICATED','The integration token is unknown or revoked.',401);
 // Each token has its own operator membership, so its actions are attributable in the audit trail.
 const address=`integration:api:${row!.id}`;
 let member=db.prepare('SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND u.address=?').get(row!.tenant_id,address) as {id:string}|undefined;
 if(!member)db.transaction(()=>{let user=db.prepare('SELECT id FROM users WHERE address=?').get(address) as {id:string}|undefined;if(!user){user={id:randomUUID()};db.prepare('INSERT INTO users VALUES(?,?)').run(user.id,address);}member={id:randomUUID()};db.prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(member.id,user.id,row!.tenant_id,JSON.stringify(['operator']));})();
 return {membershipId:member!.id,tenantId:row!.tenant_id,address,roles:['operator'],csrfToken:''};
}
const idempotencyKey=(req:FastifyRequest)=>{const key=req.headers['idempotency-key'];if(typeof key!=='string'||!key.trim()||key.length>150)fail('IDEMPOTENCY_REQUIRED','Send a unique Idempotency-Key header (1-150 characters) with every creation request.');return `integration:${key}`;};
const externalId=z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:\/-]+$/,'Use letters, digits and . _ : / -');
export const payableInputSchema=z.object({
 externalId,sourceSystem:externalId,invoiceReference:z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/),
 supplier:z.object({externalId,name:z.string().trim().min(1).max(160),recipient:addressSchema,version:z.string().trim().min(1).max(40),supplierKey:z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional()}).strict(),
 amount:z.object({atomic:z.string().regex(/^[1-9][0-9]{0,30}$/,'A positive integer number of atomic units (6 decimals for DEMO).'),token:z.literal('DEMO')}).strict(),
}).strict();
type PayableInput=z.infer<typeof payableInputSchema>;

/** User-facing state from the detailed backend state, as in the Workspace. */
export function integrationStatus(c:any):{status:string;nextAction:string}{
 if(c.settlementStatus==='SETTLED'||c.automationPayment?.settlementStatus==='SETTLED')return {status:'PAID',nextAction:'None. Settlement verified from the chain receipt.'};
 if(['UNKNOWN','INCONSISTENT'].includes(c.executionStatus))return {status:'OUTCOME_UNKNOWN',nextAction:'Do not resend. Operations must reconcile the transaction before any retry.'};
 if(['PREPARING','PREPARED','SUBMITTED','PENDING'].includes(c.executionStatus))return {status:'PAYMENT_PENDING',nextAction:'Poll the execution until CONFIRMED.'};
 if(['RECEIVED','EXTRACTING','CHECKING'].includes(c.workflowStatus))return {status:'PROCESSING',nextAction:'Poll this case; checks are running.'};
 if(c.workflowStatus==='NEEDS_INFORMATION')return {status:'NEEDS_INFORMATION',nextAction:'Submit a corrected invoice or rerun the analysis once the cause is fixed.'};
 if(c.workflowStatus==='HELD')return {status:'NEEDS_REVIEW',nextAction:'A person must review the hold reason; nothing will be paid automatically.'};
 if(c.workflowStatus==='READY_FOR_REVIEW')return {status:c.authorizationStatus==='VALID'?'AUTHORIZED':'READY_FOR_APPROVAL',nextAction:c.authorizationStatus==='VALID'?'A person can submit the signed payment from the approval link.':'A person must review and sign the exact payment at approvalUrl.'};
 return {status:c.workflowStatus,nextAction:'Review the case in the Workspace.'};
}

export async function registerIntegrationApi(app:FastifyInstance,service:Service,db:Db,config:Config){
 migrateIntegrations(db);
 const base='/api/v1/integrations',limit={config:{rateLimit:{max:120,timeWindow:'1 minute'}}};
 const payableView=(tenantId:string,id:string)=>{const row=db.prepare('SELECT p.*,s.snapshot FROM payables p JOIN supplier_versions s ON s.id=p.supplier_id WHERE p.id=? AND p.tenant_id=?').get(id,tenantId) as any;if(!row)fail('NOT_FOUND','Payable not found.',404);const s=parsed<any>(row.snapshot);return {id:row.id,externalId:row.canonical_payable_id,sourceSystem:row.source_system,invoiceReference:row.invoice_reference,invoiceKey:row.invoice_key,supplier:{externalId:s.externalId??null,name:s.name,recipient:s.recipient,version:s.version,supplierKey:s.supplierKey},amount:{atomic:row.amount_atomic,token:'DEMO'},version:row.version};};
 const caseView=(user:Identity,id:string)=>{
  const c=service.project(user,id),{status,nextAction}=integrationStatus(c),payable=payableView(user.tenantId,c.payableId);
  return {id:c.id,status,nextAction,workflowStatus:c.workflowStatus,holdReason:c.holdReason,payable:{id:payable.id,externalId:payable.externalId,sourceSystem:payable.sourceSystem,invoiceReference:payable.invoiceReference},
   checks:(c.checks??[]).map((x:any)=>({code:x.code,passed:x.passed,severity:x.severity,summary:x.summary})),
   proposal:c.latestProposal?{id:c.latestProposal.id,amountAtomic:c.latestProposal.payment.amountAtomic,recipient:c.latestProposal.payment.recipient,deadline:c.latestProposal.payment.deadline,typedDigest:c.latestProposal.typedDigest,authorizationStatus:c.authorizationStatus}:null,
   execution:c.latestExecution?{id:c.latestExecution.id,status:c.latestExecution.status,txHash:c.latestExecution.txHash??null}:null,
   settlement:c.settlement?{txHash:c.settlement.txHash,confirmedAt:c.settlement.confirmedAt}:null,
   approval:{required:true,approvalUrl:`${config.WEB_ORIGIN}/workflow?case=${c.id}`,note:'Payment authority always comes from a human wallet signature. This API cannot create it.'},
   agentMode:c.mode,updatedVersion:c.version};
 };

 app.post(`${base}/payables`,limit,async(req,reply)=>{
  const user=integrationIdentity(db,req),key=idempotencyKey(req),input=payableInputSchema.parse(req.body),dep=loadDeployment(config);
  if(!dep)fail('DEPLOYMENT_REQUIRED','No payment contract is configured for this workspace.',503);
  const result=service.idempotent(user.tenantId,'integration:payables',key,input,()=>createPayable(user,input,dep!.token));
  reply.code(201);return payableView(user.tenantId,result.id);
 });
 function createPayable(user:Identity,input:PayableInput,token:string){
  const tenant=user.tenantId,existing=db.prepare('SELECT id FROM payables WHERE tenant_id=? AND source_system=? AND canonical_payable_id=?').get(tenant,input.sourceSystem,input.externalId) as {id:string}|undefined;
  if(existing)fail('PAYABLE_EXISTS',`Payable ${input.sourceSystem}/${input.externalId} already exists. A payable's identity and terms cannot be changed after import.`,409);
  if(db.prepare('SELECT 1 FROM payables WHERE tenant_id=? AND invoice_reference=?').get(tenant,input.invoiceReference))fail('INVOICE_REFERENCE_EXISTS',`Invoice reference ${input.invoiceReference} is already registered.`,409);
  // Stable identities: the same ERP record always maps to the same on-chain invoice and supplier keys.
  const supplierKey=(input.supplier.supplierKey??keccak256(toHex(`${tenant}:${input.sourceSystem}:supplier:${input.supplier.externalId}`))).toLowerCase(),recipient=input.supplier.recipient.toLowerCase();
  const invoiceKey=keccak256(toHex(`${tenant}:${input.sourceSystem}:payable:${input.externalId}`));
  let supplier=db.prepare('SELECT id,recipient FROM supplier_versions WHERE tenant_id=? AND supplier_key=? AND version=?').get(tenant,supplierKey,input.supplier.version) as {id:string;recipient:string}|undefined;
  if(supplier&&supplier.recipient!==recipient)fail('SUPPLIER_VERSION_CONFLICT','This supplier version already has a different recipient. Publish a new supplier version after verifying the change out of band.',409);
  if(!supplier){supplier={id:randomUUID(),recipient};db.prepare('INSERT INTO supplier_versions VALUES(?,?,?,?,?,?)').run(supplier.id,tenant,supplierKey,recipient,input.supplier.version,json({id:supplier.id,supplierKey,recipient,name:input.supplier.name,version:input.supplier.version,externalId:input.supplier.externalId,source:`integration:${input.sourceSystem}`}));}
  const id=randomUUID();db.prepare('INSERT INTO payables VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,tenant,input.sourceSystem,input.externalId,invoiceKey,supplier.id,input.invoiceReference,input.amount.atomic,token,'1',`INTEGRATION-${input.sourceSystem}`);
  event(db,tenant,'integration.payable_imported',null,{payableId:id,sourceSystem:input.sourceSystem,externalId:input.externalId,actor:user.address});
  return {id};
 }
 app.get(`${base}/payables/:sourceSystem/:externalId`,limit,async req=>{const user=integrationIdentity(db,req),p=z.object({sourceSystem:externalId,externalId}).parse(req.params);const row=db.prepare('SELECT id FROM payables WHERE tenant_id=? AND source_system=? AND canonical_payable_id=?').get(user.tenantId,p.sourceSystem,p.externalId) as {id:string}|undefined;if(!row)fail('NOT_FOUND','Payable not found.',404);return payableView(user.tenantId,row.id);});

 app.post(`${base}/cases`,{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async(req,reply)=>{
  const user=integrationIdentity(db,req),key=idempotencyKey(req);
  if(!req.isMultipart())fail('SCHEMA_INVALID','Send multipart/form-data with a "file" part and either payableId, or sourceSystem and payableExternalId.');
  const fields:Record<string,string>={};let file:{bytes:Uint8Array;filename:string;mimeType:string}|undefined;
  for await(const part of req.parts({limits:{fileSize:10*1024*1024,files:1,fields:4}})){if(part.type==='file'){if(part.fieldname!=='file')fail('INVALID_UPLOAD','The file part must be named "file".');file={bytes:await part.toBuffer(),filename:part.filename,mimeType:part.mimetype};if(part.file.truncated)fail('UPLOAD_TOO_LARGE','Invoice exceeds 10 MiB.',413);}else fields[part.fieldname]=String(part.value);}
  if(!file)fail('FILE_REQUIRED','Attach the invoice as a PDF or plain-text "file" part.');
  const f=z.object({payableId:z.string().uuid().optional(),sourceSystem:externalId.optional(),payableExternalId:externalId.optional()}).strict().parse(fields);
  const payableId=f.payableId??(f.sourceSystem&&f.payableExternalId?(db.prepare('SELECT id FROM payables WHERE tenant_id=? AND source_system=? AND canonical_payable_id=?').get(user.tenantId,f.sourceSystem,f.payableExternalId) as {id:string}|undefined)?.id:undefined);
  if(!payableId)fail('NOT_FOUND','Payable not found. Import it with POST /payables first.',404);
  const mime=file!.mimeType==='application/octet-stream'&&Buffer.from(file!.bytes.subarray(0,5)).toString()==='%PDF-'?'application/pdf':file!.mimeType;
  const created=await service.upload(user,payableId!,{...file!,mimeType:mime},key);
  reply.code(201);return caseView(user,created.id);
 });
 app.post(`${base}/cases/:id/analysis`,limit,async(req,reply)=>{
  const user=integrationIdentity(db,req),key=idempotencyKey(req),id=z.object({id:z.string().uuid()}).parse(req.params).id;z.object({}).strict().parse(req.body??{});service.row(user.tenantId,id);
  const result=service.idempotent(user.tenantId,`integration:case:${id}:analysis`,key,{id},()=>{enqueue(db,user.tenantId,'ANALYZE',id,`analysis:${id}:${randomUUID()}`);return {caseId:id,status:'ACCEPTED'};});
  reply.code(202);return {...result,statusUrl:`${base}/cases/${id}`};
 });
 app.get(`${base}/cases/:id`,limit,async req=>{const user=integrationIdentity(db,req);return caseView(user,z.object({id:z.string().uuid()}).parse(req.params).id);});
 app.get(`${base}/executions/:id`,limit,async req=>{
  const user=integrationIdentity(db,req),id=z.object({id:z.string().uuid()}).parse(req.params).id;
  const e=db.prepare('SELECT e.*,p.case_id FROM execution_requests e JOIN proposals p ON p.id=e.proposal_id WHERE e.id=? AND e.tenant_id=?').get(id,user.tenantId) as any;if(!e)fail('NOT_FOUND','Execution not found.',404);
  const outbox=db.prepare('SELECT tx_hash FROM tx_outbox WHERE execution_id=?').get(id) as {tx_hash:string|null}|undefined,settled=db.prepare('SELECT tx_hash,created_at FROM settlements WHERE execution_id=?').get(id) as any;
  return {id:e.id,caseId:e.case_id,status:e.status,error:e.error,txHash:outbox?.tx_hash??null,settlement:settled?{txHash:settled.tx_hash,confirmedAt:settled.created_at}:null};
 });
}
