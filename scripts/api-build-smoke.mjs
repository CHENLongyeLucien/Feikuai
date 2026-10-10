import {build} from 'esbuild';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'sf-built-api-'));
const output=resolve('apps/api/dist/.smoke-app.mjs');
await build({entryPoints:['apps/api/src/app.ts'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:'tsconfig.json'});
Object.assign(process.env,{NODE_ENV:'development',APP_ENV:'local',CHAIN_ID:'31337',API_HOST:'127.0.0.1',API_PORT:'3001',WEB_ORIGIN:'http://localhost:8080',DATABASE_PATH:join(dir,'db.sqlite'),ARTIFACT_ROOT:join(dir,'artifacts'),DEPLOYMENT_MANIFEST_PATH:join(dir,'missing.json'),RPC_URL:'http://127.0.0.1:1',AGENT_MODE:'fixture',RELAYER_PRIVATE_KEY:'',SEED_ON_START:'false',ENABLE_MAINNET:'false'});
const {buildApp}=await import(pathToFileURL(output).href);const {app}=await buildApp({worker:false});
try{
 let health,session;const listen=process.argv.includes('--listen');
 if(listen){const address=await app.listen({host:'127.0.0.1',port:0});health=await fetch(`${address}/health`).then(r=>r.json());session=await fetch(`${address}/api/v1/session`).then(r=>r.json());}
 else{health=(await app.inject('/health')).json();session=(await app.inject('/api/v1/session')).json();}
 if(health.status!=='ok'||session.authenticated!==false)throw new Error('Built API smoke response mismatch');
 const result={source:'apps/api/src/app.ts',build:'esbuild Node ESM bundle, packages external',mode:listen?'real loopback listener':'Fastify injection of compiled bundle',environment:'isolated private database; no RPC, relayer key or worker',health,session,successful:true,observedAt:new Date().toISOString()};
 writeFileSync('docs/api-build-smoke.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await app.close();rmSync(dir,{recursive:true,force:true});rmSync(output,{force:true});}
