import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Db} from '../db/database.js';
import type {Config} from '../config.js';
import type {Service} from '../domain/service.js';
import type {InboxService} from '../inbox/service.js';
import {requireIdentity,requireMutation} from '../security/auth.js';
import {fail} from '../domain/errors.js';
import {renderReadingPdf} from '../reports/pdf.js';
import {AgentGuardReadService} from './projection.js';
import {incidentDraftSchema,incidentDraftReport} from './draft.js';
export type {AgentGuardProjection,AgentGuardIncidents} from './types.js';

const idParam=z.object({id:z.string().uuid()});
export async function registerAgentGuard(app:FastifyInstance,db:Db,config:Config,payments:Service,inbox:InboxService){
 const service=new AgentGuardReadService(db,payments,inbox);
 app.get('/api/v1/agentguard/cases/:id',async req=>{const user=requireIdentity(db,req),id=idParam.parse(req.params).id;return db.transaction(()=>service.case(user,id))();});
 app.get('/api/v1/agentguard/inbox/:id',async req=>{const user=requireIdentity(db,req),id=idParam.parse(req.params).id;return db.transaction(()=>service.item(user,id))();});
 app.get('/api/v1/agentguard/incidents',async req=>{const user=requireIdentity(db,req),query=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict().parse(req.query);return db.transaction(()=>service.incidents(user,query))();});
 app.post('/api/v1/agentguard/inbox/:id/incident-draft',{bodyLimit:16*1024,config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{
  const user=requireMutation(db,config,req,['reviewer']),id=idParam.parse(req.params).id,input=incidentDraftSchema.parse(req.body??{});
  const report=db.transaction(()=>{
   const projection=service.item(user,id);
   if(input.expectedVersion!==undefined&&input.expectedVersion!==projection.subject.version)fail('VERSION_CONFLICT','The source changed; refresh its recorded findings before generating a draft.',409);
   if(!projection.incident.draftEligible)fail('INCIDENT_NOT_RECORDED','No recorded source security finding is available for an incident draft.',409);
   return incidentDraftReport(inbox.project(user,id),projection,input);
  })();
  return reply.type('application/pdf').header('Cache-Control','no-store').header('Content-Security-Policy',"default-src 'none'; sandbox").header('Content-Disposition',`attachment; filename="incident-draft-${id}.pdf"`).send(await renderReadingPdf(report));
 });
 return service;
}
