/**
 * Serves the Fuji API to the hosted (Vercel) web apps from this machine, behind a tunnel.
 * HTTP only: background workers stay in the main `pnpm dev` API, which shares the same database,
 * so there is exactly one set of workers. Usage:
 *   tsx scripts/serve-online.ts --web https://feikuai-web.vercel.app --approver https://feikuai-approve.vercel.app [--port 3002]
 */
import {readFileSync} from 'node:fs';
import {buildApp} from '../apps/api/src/app.js';
import {loadConfig} from '../apps/api/src/config.js';

const arg=(name:string,fallback?:string)=>{const i=process.argv.indexOf(`--${name}`);return i>0?process.argv[i+1]!:fallback;};
const env=Object.fromEntries(readFileSync('.env.fuji','utf8').split(/\r?\n/).filter(line=>/^[A-Z_][A-Z0-9_]*=/.test(line)).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1).replace(/^['"]|['"]$/g,'')];}));
const web=arg('web'),approver=arg('approver'),port=Number(arg('port','3002'));
if(!web?.startsWith('https://')||!approver?.startsWith('https://'))throw new Error('Pass --web and --approver as https origins.');
const config=loadConfig({...env,NODE_ENV:'production',WEB_ORIGIN:web,APPROVER_ORIGIN:approver,API_HOST:'127.0.0.1',API_PORT:String(port),SEED_ON_START:'false'});
const {app}=await buildApp({config,worker:false,logger:false});
await app.listen({host:'127.0.0.1',port});
console.log(`Online API (HTTP only) on http://127.0.0.1:${port} for ${web} and ${approver}`);
