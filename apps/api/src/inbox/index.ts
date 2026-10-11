import {readFile} from 'node:fs/promises';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../config.js';
import type {Db} from '../db/database.js';
import type {Service} from '../domain/service.js';
import {fail} from '../domain/errors.js';
import {requireIdentity,requireMutation} from '../security/auth.js';
import {InboxService,type InboxFile} from './service.js';
import {InboxWorker} from './worker.js';
import {inboxChannelSchema,inboxInputSchema,inboxStatusSchema,reviewSchema,type InboxInput,type InboxPayment} from './types.js';
import {inboxReadingReport,renderReadingPdf} from '../reports/pdf.js';
import {renderTestInvoicePdf} from './test-invoice.js';
export * from './types.js';
export {InboxService} from './service.js';

const idParam=z.object({id:z.string().uuid()});
const idempotency=(req:FastifyRequest)=>z.string().min(1).max(180).parse(req.headers['idempotency-key']);
export async function registerInbox(app:FastifyInstance,payments:Service,db:Db,config:Config,options:{startWorker?:boolean;paymentFor?:(itemId:string,tenantId:string)=>InboxPayment|null}={}){
 const service=new InboxService(db,config,payments,options),worker=new InboxWorker(service);
 app.get('/api/v1/inbox',async req=>{const user=requireIdentity(db,req),query=z.object({status:inboxStatusSchema.optional(),channel:inboxChannelSchema.optional(),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict().parse(req.query);return service.list(user,query);});
 app.get('/api/v1/inbox/notifications',async req=>({notifications:service.notifications(requireIdentity(db,req).tenantId)}));
 app.post('/api/v1/inbox/notifications/:id/read',async req=>{const user=requireMutation(db,config,req),id=idParam.parse(req.params).id;z.object({}).strict().parse(req.body??{});const notification=db.prepare('SELECT id FROM inbox_notifications WHERE id=? AND tenant_id=?').get(id,user.tenantId);if(!notification)fail('NOT_FOUND','Notification not found.',404);db.prepare('UPDATE inbox_notifications SET is_read=1 WHERE id=? AND tenant_id=?').run(id,user.tenantId);return {id,read:true};});
 app.get('/api/v1/inbox/demo-examples',async req=>{const user=requireIdentity(db,req,['operator','reviewer']);if(config.APP_ENV!=='local'||config.CHAIN_ID!=='31337'||!config.ENABLE_DEMO_ROUTES)fail('DEMO_ROUTE_DISABLED','Synthetic examples are available only in the explicitly configured local demo.',404);return service.demoExamples(user);});
 app.get('/api/v1/inbox/test-invoice.pdf',async(req,reply)=>{
  const user=requireIdentity(db,req,['operator','reviewer']);z.object({}).strict().parse(req.query);
  if(!((config.APP_ENV==='local'&&config.CHAIN_ID==='31337')||(config.APP_ENV==='fuji'&&config.CHAIN_ID==='43113')))fail('TEST_INVOICE_UNAVAILABLE','Test invoices are only available in a local or Fuji test workspace.',404);
  const payable=db.transaction(()=>service.unusedTestPayable(user,true))();if(!payable)fail('NO_UNUSED_TEST_INVOICE','No unused 10-DEMO test invoice is available. Ask your workspace administrator to register another test invoice.',409);
  const filename=`test-invoice-${payable.invoiceReference.replace(/[^a-zA-Z0-9_-]/g,'-')}.pdf`;
  return reply.type('application/pdf').header('Cache-Control','no-store').header('Content-Security-Policy',"default-src 'none'; sandbox").header('Content-Disposition',`attachment; filename="${filename}"`).send(await renderTestInvoicePdf(payable));
 });
 app.get('/api/v1/inbox/:id',async req=>service.project(requireIdentity(db,req),idParam.parse(req.params).id));
 app.get('/api/v1/inbox/:id/report.pdf',async(req,reply)=>{const user=requireIdentity(db,req),id=idParam.parse(req.params).id,report=db.transaction(()=>inboxReadingReport(service.project(user,id)))();return reply.type('application/pdf').header('Cache-Control','no-store').header('Content-Security-Policy',"default-src 'none'; sandbox").header('Content-Disposition',`attachment; filename="inbox-review-${id}.pdf"`).send(await renderReadingPdf(report));});
 app.get('/api/v1/inbox/:id/incident-report',async(req,reply)=>{const user=requireIdentity(db,req),id=idParam.parse(req.params).id;reply.header('Content-Disposition',`attachment; filename="incident-${id}.json"`);return service.incidentReport(user,id);});
 app.get('/api/v1/inbox/:id/source',async(req,reply)=>{const user=requireIdentity(db,req),row=service.row(user.tenantId,idParam.parse(req.params).id);reply.type('application/octet-stream').header('Content-Disposition',`attachment; filename="inbox-source-${row.id}"`).header('Content-Security-Policy',"default-src 'none'; sandbox");return readFile(row.source_path);});
 app.post('/api/v1/inbox',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{const user=requireMutation(db,config,req,['operator','reviewer']),key=idempotency(req);let input:Omit<InboxInput,'text'>&{text?:string},file:InboxFile|undefined;
  if(req.isMultipart()){
   const fields:Record<string,string>={};for await(const part of req.parts({limits:{fileSize:10*1024*1024,files:1,fields:6}})){if(part.type==='file'){if(part.fieldname!=='file')fail('INVALID_UPLOAD','The attachment field must be named file.');file={bytes:await part.toBuffer(),filename:part.filename,mimeType:part.mimetype};if(part.file.truncated)fail('UPLOAD_TOO_LARGE','Attachment exceeds 10 MiB.',413);}else fields[part.fieldname]=String(part.value);}
   const body=z.object({channel:inboxChannelSchema,title:z.string().trim().max(160).optional(),sender:z.string().trim().max(254).optional(),payableId:z.string().uuid().optional(),text:z.string().max(40000).optional(),transcript:z.string().max(40000).optional()}).strict().parse(fields);if(body.text&&body.transcript)fail('AMBIGUOUS_TRANSCRIPT','Provide text or transcript, not both.');input={channel:body.channel,title:body.title,sender:body.sender,payableId:body.payableId,text:body.text??body.transcript};if(!file&&!input.text)fail('SOURCE_REQUIRED','Add an invoice, message or voice transcript.');
  }else input=inboxInputSchema.parse(req.body);
  const item=await service.create(user,input,key,file);reply.code(201);return item;
 });
 app.post('/api/v1/inbox/:id/review',async req=>{const user=requireMutation(db,config,req,['reviewer']);return service.review(user,idParam.parse(req.params).id,reviewSchema.parse(req.body),idempotency(req));});
 if(options.startWorker!==false)worker.start();app.addHook('preClose',async()=>worker.stop());return {service,worker};
}
