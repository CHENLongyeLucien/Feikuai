import {readFileSync} from 'node:fs';
import type {Config} from '../config.js';
import type {Db} from '../db/database.js';

/** Conservative mutual exclusion: registered policy invoices never enter the human-signature vault path. */
export function usesStandingPolicy(config:Config,payableId:string,db?:Db):boolean{
 if(db?.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='automation_policy_obligations'").get()&&db.prepare('SELECT payable_id FROM automation_policy_obligations WHERE payable_id=? LIMIT 1').get(payableId))return true;
 if(!config.AUTOMATION_MANIFEST_PATH||config.APP_ENV!=='local'||config.CHAIN_ID!=='31337')return false;
 try{const manifest=JSON.parse(readFileSync(config.AUTOMATION_MANIFEST_PATH,'utf8')),url=new URL(manifest.rpcUrl);if(manifest.schemaVersion!=='secure-finance.automation.v1'||manifest.environment!=='local'||manifest.chainId!=='31337'||url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||manifest.rpcUrl!==config.RPC_URL||!Array.isArray(manifest.approvedPayableIds)||!manifest.approvedPayableIds.length)return true;return manifest.approvedPayableIds.includes(payableId);}catch{return true;}
}
