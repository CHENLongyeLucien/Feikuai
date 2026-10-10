import {type Db,enqueue} from '../db/database.js';
import {parsed,json,DomainError} from '../domain/errors.js';
import {sweepOrphanArtifacts} from '../security/artifacts.js';
import type {Service} from '../domain/service.js';
import type {ChainService} from './chain.js';
import {chainFailureCode} from './errors.js';
export class WorkerLoop{
 timer:ReturnType<typeof setInterval>|null=null;running=false;stopped=false;lastScan=0;analyses=new Set<Promise<void>>();
 constructor(public db:Db,public service:Service,public chain:ChainService){}
 start(){this.timer=setInterval(()=>{void this.tick();},1000);this.timer.unref();void this.tick();}
 async stop(){this.stopped=true;if(this.timer)clearInterval(this.timer);while(this.running)await new Promise(r=>setTimeout(r,20));await Promise.all(this.analyses);}
 async tick(){if(this.running||this.stopped)return;this.running=true;try{
  this.db.transaction(()=>{const interrupted=this.db.prepare("SELECT a.id,a.artifact FROM analysis_runs a JOIN jobs j ON j.resource_id=a.case_id WHERE j.kind='ANALYZE' AND j.status='RUNNING' AND j.lease_until<? AND a.status='RUNNING'").all(Date.now()) as any[];for(const run of interrupted){const artifact=parsed<any>(run.artifact);this.db.prepare("UPDATE analysis_runs SET status='INTERRUPTED',artifact=? WHERE id=?").run(json({...artifact,outcome:'INTERRUPTED',error:'PROCESS_INTERRUPTED: a provider call may have been billed; rerun is a separate attempt.'}),run.id);}this.db.prepare("UPDATE jobs SET status='QUEUED',lease_until=NULL WHERE status='RUNNING' AND lease_until<?").run(Date.now());})();const tenant=this.db.prepare('SELECT id FROM tenants ORDER BY id LIMIT 1').get() as any;if(tenant)enqueue(this.db,tenant.id,'MAINTENANCE','artifacts',`artifact-maintenance:${Math.floor(Date.now()/3600000)}`);
  const claim=(kind?:string)=>this.db.transaction(()=>{const row=this.db.prepare(`SELECT * FROM jobs WHERE status='QUEUED' AND next_retry<=? ${kind?"AND kind=?":"AND kind!='ANALYZE'"} ORDER BY rowid LIMIT 1`).get(...(kind?[Date.now(),kind]:[Date.now()])) as any;if(!row)return null;this.db.prepare("UPDATE jobs SET status='RUNNING',attempts=attempts+1,lease_until=? WHERE id=? AND status='QUEUED'").run(Date.now()+(this.service.config.NODE_ENV==='test'?Math.max(1000,Number(process.env.SF_JOB_LEASE_MS)||180000):180000),row.id);return {...row,attempts:row.attempts+1};})();
  while(this.analyses.size<2){const job=claim('ANALYZE');if(!job)break;const work=this.run(job).finally(()=>this.analyses.delete(work));this.analyses.add(work);}
  const next=claim();if(next)await this.run(next);
  if(Date.now()-this.lastScan>5000){this.lastScan=Date.now();try{await this.chain.scan();for(const e of this.db.prepare("SELECT id FROM execution_requests WHERE status IN ('PREPARED','SUBMITTED','PENDING','UNKNOWN')").all() as any[])await this.chain.reconcile(e.id);}catch{/* no fake settlement on unavailable RPC */}}
 }finally{this.running=false;}}
 async run(job:any){try{
  if(job.kind==='ANALYZE')await this.service.analyze(job.tenant_id,job.resource_id);
  else if(job.kind==='EXECUTE')await this.chain.submit(job.resource_id);
  else if(job.kind==='RECONCILE')await this.chain.reconcile(job.resource_id);
  else if(job.kind==='CANCEL')await this.chain.scan();
  else if(job.kind==='MAINTENANCE')await sweepOrphanArtifacts(this.service.config.ARTIFACT_ROOT,new Set((this.db.prepare('SELECT path FROM documents').all() as any[]).map(d=>d.path)));
  this.db.prepare("UPDATE jobs SET status='COMPLETED',lease_until=NULL,error=NULL WHERE id=?").run(job.id);
 }catch(e:unknown){const code=job.kind==='EXECUTE'?chainFailureCode(e):e instanceof DomainError?e.code:'JOB_FAILED';const permanent=['INVALID_SIGNATURE','BUSINESS_CHECK_FAILED','VERSION_CONFLICT','APPROVAL_EXPIRED','INVOICE_ALREADY_SETTLED','NONCE_UNAVAILABLE','WRONG_DEPLOYMENT','AUTHORIZATION_UNAVAILABLE','GAS_LIMIT_EXCEEDED','STANDING_POLICY_REQUIRED'].includes(code);const terminal=permanent||job.attempts>=5;this.db.prepare('UPDATE jobs SET status=?,lease_until=NULL,next_retry=?,error=? WHERE id=?').run(terminal?'FAILED':'QUEUED',Date.now()+Math.min(30000,1000*2**job.attempts),code,job.id);if(job.kind==='EXECUTE'){const execution=this.chain.execution(job.resource_id);if(!await this.chain.rejectBeforeBroadcast(execution,code))this.chain.setExecution(execution,'UNKNOWN',{},code);}}
 }
}
