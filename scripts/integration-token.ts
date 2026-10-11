/**
 * Issue or revoke an integration API token for one tenant. The secret is printed once; only its hash is stored.
 * Usage: tsx scripts/integration-token.ts issue --tenant northstar-demo --name acme-erp [--db var/fuji/secure-finance.sqlite]
 *        tsx scripts/integration-token.ts revoke --id <tokenId> [--db ...]
 */
import Database from 'better-sqlite3';
import {issueIntegrationToken,revokeIntegrationToken} from '../apps/api/src/integrations/api.js';

const arg=(name:string)=>{const i=process.argv.indexOf(`--${name}`);return i>0?process.argv[i+1]:undefined;};
const action=process.argv[2],path=arg('db')??process.env.DATABASE_PATH??'var/fuji/secure-finance.sqlite';
const db=new Database(path,{fileMustExist:true});
if(action==='issue'){
 const tenant=arg('tenant'),name=arg('name');if(!tenant||!name){console.error('Usage: issue --tenant <tenantId> --name <label>');process.exit(2);}
 const t=issueIntegrationToken(db,tenant,name);
 console.log(`Token for ${t.tenantId} (${t.name}), id ${t.id}. Store it in your ERP's secret store; it will not be shown again:\n\n${t.token}\n`);
}else if(action==='revoke'){const id=arg('id');if(!id){console.error('Usage: revoke --id <tokenId>');process.exit(2);}console.log(revokeIntegrationToken(db,id)?'Revoked.':'No active token with that id.');}
else{console.error('Usage: issue --tenant <tenantId> --name <label> | revoke --id <tokenId>');process.exit(2);}
db.close();
