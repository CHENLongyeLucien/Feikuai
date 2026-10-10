import type {Db} from '../db/database.js';

/** Additive migration: leaves all existing payment, role and deployment records untouched. */
export function migrateInbox(db:Db){
 db.exec(`
 CREATE TABLE IF NOT EXISTS inbox_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS inbox_items(
  id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),version INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL,title TEXT NOT NULL,sender TEXT,text TEXT NOT NULL,status TEXT NOT NULL,
  source_path TEXT NOT NULL,source_hash TEXT NOT NULL,text_hash TEXT NOT NULL,source_metadata TEXT NOT NULL,
  payable_id TEXT REFERENCES payables(id),linked_case_id TEXT REFERENCES cases(id),classification TEXT,
  risks TEXT NOT NULL DEFAULT '[]',links TEXT NOT NULL DEFAULT '[]',approval TEXT NOT NULL,
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS inbox_tenant_created ON inbox_items(tenant_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS inbox_stages(item_id TEXT NOT NULL REFERENCES inbox_items(id),stage_id TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(item_id,stage_id));
 CREATE TABLE IF NOT EXISTS inbox_jobs(id TEXT PRIMARY KEY,item_id TEXT NOT NULL UNIQUE REFERENCES inbox_items(id),status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,next_retry INTEGER NOT NULL,error TEXT);
 CREATE TABLE IF NOT EXISTS inbox_notifications(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),item_id TEXT NOT NULL REFERENCES inbox_items(id),kind TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,is_read INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,UNIQUE(item_id,kind));
 CREATE TABLE IF NOT EXISTS inbox_reviews(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES inbox_items(id),reviewer TEXT NOT NULL,decision TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS inbox_provider_attempts(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES inbox_items(id),kind TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
 `);
 db.prepare('INSERT OR IGNORE INTO inbox_migrations VALUES(1,?)').run(new Date().toISOString());
}
