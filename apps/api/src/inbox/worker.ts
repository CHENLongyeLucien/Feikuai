import {DomainError,json} from '../domain/errors.js';
import type {InboxService} from './service.js';

/** Durable single-process inbox queue; independent from the payment relayer queue. */
export class InboxWorker{
 timer:ReturnType<typeof setInterval>|null=null;running=false;stopped=false;lastError:string|null=null;
 constructor(public service:InboxService){}
 start(){if(this.timer)return;this.stopped=false;this.timer=setInterval(()=>void this.tick(),1000);this.timer.unref();void this.tick();}
 async stop(){this.stopped=true;if(this.timer)clearInterval(this.timer);this.timer=null;while(this.running)await new Promise(resolve=>setTimeout(resolve,20));}
 async tick(){if(this.running||this.stopped)return;this.running=true;const db=this.service.db;try{
  db.transaction(()=>{const interrupted=db.prepare("SELECT j.item_id FROM inbox_jobs j WHERE j.status='RUNNING' AND j.lease_until<?").all(Date.now()) as any[];for(const job of interrupted)db.prepare("UPDATE inbox_provider_attempts SET status='INTERRUPTED',details=? WHERE item_id=? AND status='RUNNING'").run(json({code:'PROCESS_INTERRUPTED',billingOutcome:'UNKNOWN: provider may have billed the interrupted request'}),job.item_id);db.prepare("UPDATE inbox_jobs SET status='QUEUED',lease_until=NULL WHERE status='RUNNING' AND lease_until<?").run(Date.now());})();
  for(let batch=0;batch<4&&!this.stopped;batch++){
   const job=db.transaction(()=>{const next=db.prepare("SELECT * FROM inbox_jobs WHERE status IN ('QUEUED','WAITING') AND next_retry<=? ORDER BY CASE status WHEN 'QUEUED' THEN 0 ELSE 1 END,next_retry,rowid LIMIT 1").get(Date.now()) as any;if(next)db.prepare("UPDATE inbox_jobs SET status='RUNNING',attempts=attempts+1,lease_until=? WHERE id=?").run(Date.now()+90000,next.id);return next;})();if(!job)break;
   try{const result=await this.service.process(job.item_id);if(result==='WAITING'&&job.attempts>=120)throw new DomainError('INBOX_WAIT_EXHAUSTED','Linked checks did not finish within the bounded waiting schedule.');db.prepare('UPDATE inbox_jobs SET status=?,lease_until=NULL,next_retry=?,error=NULL WHERE id=?').run(result==='WAITING'?'WAITING':'COMPLETED',Date.now()+1500,job.id);}catch(error){const code=error instanceof DomainError?error.code:'INBOX_PROCESSING_FAILED';db.prepare("UPDATE inbox_jobs SET status='FAILED',lease_until=NULL,error=? WHERE id=?").run(code,job.id);const row=db.prepare('SELECT * FROM inbox_items WHERE id=?').get(job.item_id) as any;if(row){this.service.finishIncomplete(row,`${code}: processing stopped; review the source and linked analysis.`);this.service.setOutcome(row,'needs_review',{scope:'WORKFLOW_ONLY',decision:'held',reason:`${code}: processing could not complete. Review the source and linked case before retrying.`});this.service.notify(row,'human_review','Processing needs attention',`${code}. No approval or payment success was inferred.`);}}
  }
  this.lastError=null;
 }catch(error){this.lastError=error instanceof DomainError?error.code:'INBOX_WORKER_UNAVAILABLE';/* A claimed job keeps its lease and is recoverable; interval promises never become unhandled. */}finally{this.running=false;}}
}
