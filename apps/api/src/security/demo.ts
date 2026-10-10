import {createHash,randomBytes} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {Db} from '../db/database.js';
import {loadDeployment,type Config} from '../config.js';
import {fail,parsed} from '../domain/errors.js';
import {requireOrigin} from './auth.js';

const LOOPBACK=new Set(['localhost','127.0.0.1','[::1]','::1']);
/** A local, valueless demo session. Never available on Fuji or a public host. */
export function demoLoginAvailable(config:Config){
 return config.ENABLE_DEMO_ROUTES && config.APP_ENV==='local' && config.CHAIN_ID==='31337'
  && config.NODE_ENV!=='production' && LOOPBACK.has(config.API_HOST)
  && LOOPBACK.has(new URL(config.RPC_URL).hostname) && LOOPBACK.has(new URL(config.WEB_ORIGIN).hostname);
}

export async function registerDemoAuth(app:FastifyInstance,db:Db,config:Config){
 app.post('/api/v1/auth/demo',{config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async(req,reply)=>{
  if(!demoLoginAvailable(config))fail('DEMO_DISABLED','Demo access is available only in the isolated local demonstration.',404);
  requireOrigin(config,req);
  if(!LOOPBACK.has(req.ip)&&req.ip!=='::ffff:127.0.0.1')fail('DEMO_DISABLED','Demo access requires a local connection.',403);
  const deployment=loadDeployment(config);
  if(!deployment||deployment.chainId!=='31337'||deployment.environment!=='local')fail('DEMO_NOT_READY','Start the isolated demo to load its sample company.',503);
  const member=db.prepare('SELECT m.id,m.tenant_id,m.roles,u.address FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.address=?').get(deployment.approver) as {id:string;tenant_id:string;roles:string;address:string}|undefined;
  if(!member)fail('DEMO_NOT_READY','Sample company is not ready. Start the isolated demonstration first.',503);
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),member!.id,csrf,Date.now()+8*60*60*1000);
  reply.setCookie('sf_session',token,{httpOnly:true,sameSite:'strict',secure:config.WEB_ORIGIN.startsWith('https://'),path:'/api/v1',maxAge:8*60*60});
  return {authenticated:true,user:{address:member!.address,tenantId:member!.tenant_id,roles:parsed<string[]>(member!.roles)},csrfToken:csrf,demo:true};
 });
}
