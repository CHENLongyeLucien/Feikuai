import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {canonicalBytes} from '@secure-finance/evidence';
import type {Config} from '../config.js';
import type {Db} from '../db/database.js';
import type {InboxService} from '../inbox/service.js';
import {inboxInputSchema} from '../inbox/types.js';
import {fail} from '../domain/errors.js';
import {requireIdentity,type Identity} from '../security/auth.js';

export const webhookEnvelopeSchema=z.object({eventId:z.string().uuid(),timestamp:z.string().datetime(),source:inboxInputSchema}).strict();
export function webhookSignature(secret:string,envelope:z.infer<typeof webhookEnvelopeSchema>){return createHmac('sha256',secret).update(canonicalBytes(envelope)).digest('hex');}
export function webhookConfigured(config:Config){return config.INBOX_WEBHOOK_SECRET.length>=32&&config.INBOX_WEBHOOK_TENANT_ID.length>0;}

/** A signed inbound integration can create untrusted sources, never approve them. */
export async function registerInboxWebhook(app:FastifyInstance,db:Db,config:Config,inbox:InboxService){
 app.get('/api/v1/inbox/connections',async req=>{
  const user=requireIdentity(db,req);
  return {internal:{configured:webhookConfigured(config)&&user.tenantId===config.INBOX_WEBHOOK_TENANT_ID,url:new URL('/api/v1/inbox/webhook',config.WEB_ORIGIN).toString(),authentication:'HMAC-SHA256',scope:'Intake only'},gmail:{configured:false},outlook:{configured:false},voice:{configured:!!config.OPENAI_API_KEY&&!!process.env.INBOX_TRANSCRIPTION_MODEL}};
 });
 app.post('/api/v1/inbox/webhook',{bodyLimit:128*1024,config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async(req,reply)=>{
  if(!webhookConfigured(config))fail('CONNECTOR_NOT_CONFIGURED','The internal intake connector is not configured.',503);
  const envelope=webhookEnvelopeSchema.parse(req.body);
  const received=String(req.headers['x-inbox-signature']||'');
  const expected=webhookSignature(config.INBOX_WEBHOOK_SECRET,envelope);
  if(!/^v1=[a-f0-9]{64}$/.test(received)||!timingSafeEqual(Buffer.from(received.slice(3),'hex'),Buffer.from(expected,'hex')))fail('CONNECTOR_UNAUTHENTICATED','The intake signature is not valid.',401);
  if(Math.abs(Date.now()-Date.parse(envelope.timestamp))>5*60*1000)fail('CONNECTOR_EXPIRED','The signed intake event is outside the five-minute delivery window.',401);
  const tenantId=config.INBOX_WEBHOOK_TENANT_ID;
  if(!db.prepare('SELECT id FROM tenants WHERE id=?').get(tenantId))fail('CONNECTOR_TENANT_MISSING','The configured workspace is not available.',503);
  const address=`integration:inbox:${tenantId}`;
  let member=db.prepare('SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND u.address=?').get(tenantId,address) as {id:string}|undefined;
  if(!member){
   db.transaction(()=>{let user=db.prepare('SELECT id FROM users WHERE address=?').get(address) as {id:string}|undefined;
    if(!user){user={id:randomUUID()};db.prepare('INSERT INTO users VALUES(?,?)').run(user.id,address);}
    const id=randomUUID();db.prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(id,user.id,tenantId,JSON.stringify(['operator']));member={id};})();
  }
  const identity:Identity={membershipId:member!.id,tenantId,address,roles:['operator'],csrfToken:''};
  const item=await inbox.create(identity,envelope.source,`connector:${envelope.eventId}`);
  reply.code(202);
  return {id:item.id,status:item.status,message:'Source accepted for review. No authority was supplied by the connector.'};
 });
}
