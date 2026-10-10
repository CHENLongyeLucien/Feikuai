import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {getAddress,verifyMessage} from 'viem';
import {createSiweMessage} from 'viem/siwe';
import {z} from 'zod';
import {addressSchema} from '@secure-finance/shared';
import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import type {Db} from '../db/database.js';
import type {Config} from '../config.js';
import {fail,parsed} from '../domain/errors.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export type Identity={membershipId:string;tenantId:string;address:string;roles:string[];csrfToken:string};
export function identity(db:Db,req:FastifyRequest):Identity|null{const token=req.cookies.sf_session;if(!token)return null;const row=db.prepare('SELECT s.*,m.tenant_id,m.roles,u.address FROM sessions s JOIN memberships m ON m.id=s.membership_id JOIN users u ON u.id=m.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token),Date.now()) as any;return row?{membershipId:row.membership_id,tenantId:row.tenant_id,address:row.address,roles:parsed(row.roles),csrfToken:row.csrf}:null;}
export function requireIdentity(db:Db,req:FastifyRequest,roles:string[]=[]){const user=identity(db,req);if(!user)fail('UNAUTHENTICATED','Sign in with a preseeded wallet.',401);if(roles.length&&!roles.some(r=>user!.roles.includes(r)))fail('FORBIDDEN','This wallet membership cannot perform the action.',403);return user!;}
export function requireOrigin(config:Config,req:FastifyRequest){if(req.headers.origin!==config.WEB_ORIGIN)fail('WRONG_ORIGIN','Request Origin is not approved.',403);}
export function requireMutation(db:Db,config:Config,req:FastifyRequest,roles:string[]=[]){requireOrigin(config,req);const user=requireIdentity(db,req,roles);if(req.headers['x-csrf-token']!==user.csrfToken)fail('CSRF_INVALID','Session-bound CSRF token is required.',403);return user;}
export async function registerAuth(app:FastifyInstance,db:Db,config:Config){
 const secure=config.WEB_ORIGIN.startsWith('https://');if(!secure&&!['localhost','127.0.0.1','[::1]'].includes(new URL(config.WEB_ORIGIN).hostname))fail('INSECURE_ORIGIN','HTTP exception is loopback-only.');
 const cookieOptions={httpOnly:true,sameSite:'strict' as const,secure,path:'/api/v1'};
 app.post('/api/v1/auth/challenge',{config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async(req,reply)=>{
  requireOrigin(config,req);const {address}=z.object({address:addressSchema}).strict().parse(req.body);const membership=db.prepare('SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.address=?').get(address);if(!membership)fail('WALLET_NOT_ENROLLED','Wallet has no preseeded membership.',403);
  const id=randomUUID(),nonce=randomBytes(16).toString('hex'),browser=randomBytes(32).toString('hex'),now=new Date(),expires=new Date(now.getTime()+300000);
  const message=createSiweMessage({address:getAddress(address),chainId:Number(config.CHAIN_ID),domain:new URL(config.WEB_ORIGIN).host,uri:config.WEB_ORIGIN,version:'1',nonce,issuedAt:now,expirationTime:expires,statement:'Sign in to Secure Finance. This does not authorize a payment.'});
  db.prepare('INSERT INTO auth_challenges VALUES(?,?,?,?,?,0)').run(id,address,message,hash(browser),expires.getTime());reply.setCookie('sf_preauth',browser,{...cookieOptions,maxAge:300});return {challengeId:id,message,expiresAt:expires.toISOString()};
 });
 app.post('/api/v1/auth/verify',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
  requireOrigin(config,req);const body=z.object({challengeId:z.string().uuid(),signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/)}).strict().parse(req.body);const row=db.prepare('SELECT * FROM auth_challenges WHERE id=?').get(body.challengeId) as any;
  if(!row||row.consumed||row.expires_at<=Date.now()||hash(req.cookies.sf_preauth??'')!==row.browser_hash)fail('CHALLENGE_INVALID','Challenge is expired, consumed or belongs to another browser.',401);
  let valid=false;try{valid=await verifyMessage({address:row.address,message:row.message,signature:body.signature as `0x${string}`});}catch{/* reject */}if(!valid)fail('INVALID_SIGNATURE','Login signature does not match the expected SIWE message.',401);
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  db.transaction(()=>{const consumed=db.prepare('UPDATE auth_challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires_at>?').run(row.id,Date.now());if(consumed.changes!==1)fail('CHALLENGE_INVALID','Challenge was already consumed.',401);const member=db.prepare('SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.address=?').get(row.address) as any;if(!member)fail('FORBIDDEN','Membership was removed.',403);db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),member.id,csrf,Date.now()+8*60*60*1000);})();
  reply.clearCookie('sf_preauth',cookieOptions).setCookie('sf_session',token,{...cookieOptions,maxAge:8*60*60});return {authenticated:true,user:{address:row.address,...getMember(db,row.address)},csrfToken:csrf};
 });
 app.get('/api/v1/session',async(req)=>{const user=identity(db,req);return user?{authenticated:true,user:{address:user.address,tenantId:user.tenantId,roles:user.roles},csrfToken:user.csrfToken}:{authenticated:false};});
 app.post('/api/v1/auth/logout',async(req,reply)=>{requireMutation(db,config,req);db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(req.cookies.sf_session!));reply.clearCookie('sf_session',cookieOptions);return {authenticated:false};});
}
function getMember(db:Db,address:string){const row=db.prepare('SELECT m.tenant_id,m.roles FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.address=?').get(address) as any;return {tenantId:row.tenant_id,roles:parsed(row.roles)};}
