import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import {ZodError} from 'zod';
import {loadConfig,type Config} from './config.js';
import {openDatabase} from './db/database.js';
import {seed} from './db/seed.js';
import {registerAuth} from './security/auth.js';
import {registerApi} from './routes/api.js';
import {Service} from './domain/service.js';
import {ChainService} from './jobs/chain.js';
import {WorkerLoop} from './jobs/worker.js';
import {DomainError} from './domain/errors.js';
export async function buildApp(options:{config?:Config;worker?:boolean;logger?:boolean}={}){
 const config=options.config??loadConfig();const app=Fastify({logger:options.logger?{redact:['req.headers.cookie','req.headers.authorization','req.headers.x-csrf-token','req.body','res.headers.set-cookie']}:false,bodyLimit:32*1024*1024});const {db,orm}=openDatabase(config.DATABASE_PATH);
 await app.register(cookie);await app.register(multipart,{limits:{fileSize:10*1024*1024,files:1,fields:4}});await app.register(rateLimit,{global:false});
 app.setErrorHandler((error,req,reply)=>{if(error instanceof DomainError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});if(error instanceof ZodError)return reply.code(400).send({error:{code:'SCHEMA_INVALID',message:'Request does not match the required schema.',fields:error.issues.map(i=>i.path.join('.'))}});const status=(error as any).statusCode;return reply.code(status&&status<500?status:500).send({error:{code:status===413?'UPLOAD_TOO_LARGE':'INTERNAL_ERROR',message:status===413?'Upload exceeds the permitted size.':'Request failed. Inspect the protected server diagnostics.'}});});
 app.addHook('onSend',async(req,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff').header('Cache-Control','no-store');return payload;});
 if(config.SEED_ON_START)seed(db,config);
 const chain=new ChainService(db,config),service=new Service(db,config,chain),worker=new WorkerLoop(db,service,chain);await registerAuth(app,db,config);await registerApi(app,service,db,config);if(options.worker!==false)worker.start();app.addHook('onClose',async()=>{await worker.stop();db.close();});return {app,db,orm,service,chain,worker,config};
}
