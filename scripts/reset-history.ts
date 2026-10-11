/**
 * Clears workflow test history (inbox items, cases, proposals, executions, jobs, events)
 * from an application database after taking a full backup of the database and its artifacts.
 *
 * Kept on purpose: tenants, users, memberships, suppliers, payables, deployment/automation
 * policy records, chain scan state, and verified settlements. Settlements mirror irreversible
 * on-chain payments; removing them would make already-paid invoices look unpaid.
 *
 * Usage: tsx scripts/reset-history.ts <database.sqlite> <artifact-root> [--yes]
 */
import Database from 'better-sqlite3';
import {cp,mkdir,readdir,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';

const [databasePath,artifactRoot]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
if(!databasePath||!artifactRoot){console.error('Usage: tsx scripts/reset-history.ts <database.sqlite> <artifact-root> [--yes]');process.exit(2);}
const confirmed=process.argv.includes('--yes');

// Child tables first so foreign keys stay valid inside the transaction.
const historyTables=['inbox_notifications','inbox_reviews','inbox_provider_attempts','inbox_stages','inbox_jobs','tx_envelopes','tx_outbox','attempt_observations','execution_requests','authorization_observations','authorizations','proposals','tool_calls','analysis_runs','business_check_runs','application_holds','documents','inbox_items','cases','jobs','idempotency_keys','events'];

const db=new Database(databasePath,{fileMustExist:true});
const tables=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(t=>t.name));
const present=historyTables.filter(t=>tables.has(t));
const counts=Object.fromEntries(present.map(t=>[t,(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as {n:number}).n]));
const settlements=tables.has('settlements')?(db.prepare('SELECT COUNT(*) n FROM settlements').get() as {n:number}).n:0;
const automationPayments=tables.has('automation_payments')?(db.prepare('SELECT COUNT(*) n FROM automation_payments').get() as {n:number}).n:0;
console.log(JSON.stringify({database:resolve(databasePath),rowsToDelete:counts,settlementsKept:settlements},null,1));
if(automationPayments){console.error(`Refusing: ${automationPayments} standing-policy payment records reference inbox items; reconcile them before clearing history.`);process.exit(1);}
if(!confirmed){console.log('Dry run only. Re-run with --yes to back up and clear.');process.exit(0);}

const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backupDir=resolve('var/backups/history-reset',`${basename(resolve(databasePath,'..'))}-${stamp}`);
await mkdir(backupDir,{recursive:true});
await db.backup(join(backupDir,basename(databasePath)));
if(existsSync(artifactRoot))await cp(artifactRoot,join(backupDir,'artifacts'),{recursive:true});
await writeFile(join(backupDir,'README.txt'),`Backup taken before clearing workflow history.\nDatabase: ${resolve(databasePath)}\nArtifacts: ${resolve(artifactRoot)}\nRestore: stop the API, copy the .sqlite file back (delete its -wal/-shm files) and copy artifacts/ back.\n`);

db.pragma('foreign_keys = ON');
db.transaction(()=>{
 if(tables.has('settlements'))db.prepare('UPDATE settlements SET case_id=NULL,proposal_id=NULL,execution_id=NULL').run();
 for(const table of present)db.prepare(`DELETE FROM ${table}`).run();
})();
db.pragma('wal_checkpoint(TRUNCATE)');db.close();

// Uploaded sources are now unreferenced; the backup keeps a copy.
let removed=0;
for(const dir of [artifactRoot,join(artifactRoot,'inbox')]){
 let names:string[]=[];try{names=await readdir(dir);}catch{continue;}
 for(const name of names)if(/^[0-9a-f-]{36}\.blob(?:\.tmp)?$/.test(name)){await rm(join(dir,name));removed++;}
}
console.log(JSON.stringify({cleared:present,artifactsRemoved:removed,backup:backupDir}));
