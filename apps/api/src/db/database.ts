import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { json } from '../domain/errors.js';
export function openDatabase(path:string){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new Database(path);db.pragma('foreign_keys = ON');db.pragma('journal_mode = WAL');db.pragma('synchronous = FULL');db.pragma('busy_timeout = 5000');
 db.exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,address TEXT UNIQUE NOT NULL);
 CREATE TABLE IF NOT EXISTS memberships(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),tenant_id TEXT NOT NULL REFERENCES tenants(id),roles TEXT NOT NULL,UNIQUE(user_id,tenant_id));
 CREATE TABLE IF NOT EXISTS auth_challenges(id TEXT PRIMARY KEY,address TEXT NOT NULL,message TEXT NOT NULL,browser_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,membership_id TEXT NOT NULL REFERENCES memberships(id),csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS supplier_versions(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),supplier_key TEXT NOT NULL,recipient TEXT NOT NULL,version TEXT NOT NULL,snapshot TEXT NOT NULL,UNIQUE(tenant_id,supplier_key,version));
 CREATE TABLE IF NOT EXISTS payables(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),source_system TEXT NOT NULL,canonical_payable_id TEXT NOT NULL,invoice_key TEXT NOT NULL,supplier_id TEXT NOT NULL REFERENCES supplier_versions(id),invoice_reference TEXT NOT NULL,amount_atomic TEXT NOT NULL,token TEXT NOT NULL,version TEXT NOT NULL,scenario_id TEXT NOT NULL,UNIQUE(tenant_id,source_system,canonical_payable_id),UNIQUE(tenant_id,invoice_key));
 CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),payable_id TEXT NOT NULL REFERENCES payables(id),workflow_status TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,document_version INTEGER NOT NULL DEFAULT 0,hold_reason TEXT,checks TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS application_holds(case_id TEXT PRIMARY KEY REFERENCES cases(id),reason TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,case_id TEXT NOT NULL REFERENCES cases(id),version INTEGER NOT NULL,path TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,mime_type TEXT NOT NULL,filename TEXT NOT NULL,pages TEXT NOT NULL,algorithm TEXT NOT NULL,UNIQUE(case_id,version));
 CREATE TABLE IF NOT EXISTS analysis_runs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,case_id TEXT NOT NULL REFERENCES cases(id),document_version INTEGER NOT NULL,agent TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,artifact TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS tool_calls(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES analysis_runs(id),call_index INTEGER NOT NULL,name TEXT NOT NULL,arguments TEXT NOT NULL,response TEXT NOT NULL,UNIQUE(run_id,call_index));
 CREATE TABLE IF NOT EXISTS business_check_runs(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),record_versions TEXT NOT NULL,results TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,case_id TEXT NOT NULL REFERENCES cases(id),version TEXT NOT NULL,chain_id TEXT NOT NULL,vault_address TEXT NOT NULL,authorization_nonce TEXT NOT NULL,digest TEXT NOT NULL,packet TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(chain_id,vault_address,authorization_nonce),UNIQUE(case_id,version));
 CREATE TABLE IF NOT EXISTS authorizations(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,proposal_id TEXT NOT NULL REFERENCES proposals(id),digest TEXT NOT NULL,signer_address TEXT NOT NULL,signature TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(tenant_id,proposal_id,signer_address));
 CREATE TABLE IF NOT EXISTS authorization_observations(id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL REFERENCES proposals(id),status TEXT NOT NULL,provenance TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS execution_requests(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,proposal_id TEXT NOT NULL REFERENCES proposals(id),authorization_id TEXT REFERENCES authorizations(id),digest TEXT NOT NULL,status TEXT NOT NULL,error TEXT,created_at TEXT NOT NULL,UNIQUE(tenant_id,digest));
 CREATE TABLE IF NOT EXISTS tx_outbox(id TEXT PRIMARY KEY,execution_id TEXT NOT NULL REFERENCES execution_requests(id),chain_id TEXT NOT NULL,relayer_address TEXT NOT NULL,relayer_account_nonce INTEGER NOT NULL,raw_transaction TEXT,tx_hash TEXT,envelope TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(chain_id,relayer_address,relayer_account_nonce),UNIQUE(chain_id,tx_hash));
 CREATE TABLE IF NOT EXISTS tx_envelopes(id TEXT PRIMARY KEY,reservation_id TEXT NOT NULL REFERENCES tx_outbox(id),chain_id TEXT NOT NULL,kind TEXT NOT NULL,tx_hash TEXT NOT NULL,raw_transaction TEXT NOT NULL,envelope TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(chain_id,tx_hash));
 CREATE TABLE IF NOT EXISTS attempt_observations(id TEXT PRIMARY KEY,execution_id TEXT NOT NULL REFERENCES execution_requests(id),kind TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settlements(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,case_id TEXT REFERENCES cases(id),proposal_id TEXT REFERENCES proposals(id),execution_id TEXT REFERENCES execution_requests(id),chain_id TEXT NOT NULL,vault_address TEXT NOT NULL,invoice_key TEXT NOT NULL,digest TEXT NOT NULL,authorization_nonce TEXT NOT NULL,tx_hash TEXT NOT NULL,log_index INTEGER NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(chain_id,vault_address,invoice_key),UNIQUE(chain_id,tx_hash,log_index));
 CREATE TABLE IF NOT EXISTS chain_observations(id TEXT PRIMARY KEY,chain_id TEXT NOT NULL,tx_hash TEXT NOT NULL,log_index INTEGER NOT NULL,kind TEXT NOT NULL,details TEXT NOT NULL,UNIQUE(chain_id,tx_hash,log_index));
 CREATE TABLE IF NOT EXISTS scan_cursors(chain_id TEXT NOT NULL,vault_address TEXT NOT NULL,next_block TEXT NOT NULL,PRIMARY KEY(chain_id,vault_address));
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,type TEXT NOT NULL,entity_id TEXT NOT NULL,entity_version INTEGER NOT NULL,case_id TEXT,payload TEXT NOT NULL,occurred_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,kind TEXT NOT NULL,resource_id TEXT NOT NULL,stage_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'QUEUED',attempts INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,next_retry INTEGER NOT NULL,error TEXT);
 CREATE TABLE IF NOT EXISTS idempotency_keys(tenant_id TEXT NOT NULL,operation_scope TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(tenant_id,operation_scope,idempotency_key));`);
 db.prepare('INSERT OR IGNORE INTO migrations VALUES(1,?)').run(new Date().toISOString());
 return {db,orm:drizzle(db)};
}
export type Db=Database.Database;
export function event(db:Db,tenantId:string,type:string,caseId:string|null,payload:unknown={}){let version=1;if(caseId){db.prepare('UPDATE cases SET version=version+1,updated_at=? WHERE id=?').run(new Date().toISOString(),caseId);version=(db.prepare('SELECT version FROM cases WHERE id=?').get(caseId) as any).version;}return db.prepare('INSERT INTO events(tenant_id,type,entity_id,entity_version,case_id,payload,occurred_at) VALUES(?,?,?,?,?,?,?)').run(tenantId,type,caseId??tenantId,version,caseId,json(payload),new Date().toISOString()).lastInsertRowid.toString();}
export function enqueue(db:Db,tenantId:string,kind:string,resourceId:string,stageKey:string){db.prepare('INSERT OR IGNORE INTO jobs(id,tenant_id,kind,resource_id,stage_key,next_retry) VALUES(?,?,?,?,?,?)').run(randomUUID(),tenantId,kind,resourceId,stageKey,Date.now());}
