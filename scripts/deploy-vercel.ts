/**
 * Builds the workspace and approval apps for the Fuji deployment and publishes each as a static Vercel site.
 * Only built files are uploaded: no .env file, database, var/ folder or source is sent.
 *
 *   npx vercel@63.1.2 login  (or VERCEL_TOKEN in the environment / git-ignored .env.vercel)
 *   FEIKUAI_API_URL=https://feikuai-api.onrender.com
 *   tsx scripts/deploy-vercel.ts [--web-project feikuai-web] [--approver-project feikuai-approve] [--dry-run]
 */
import {spawnSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {build} from 'vite';

const arg=(name:string,fallback:string)=>{const i=process.argv.indexOf(`--${name}`);return i>0?process.argv[i+1]!:fallback;};
const dryRun=process.argv.includes('--dry-run');
const selectedSite=arg('site','all');
if(!['web','approver','all'].includes(selectedSite))throw new Error('--site must be web, approver or all.');
const fileToken=existsSync('.env.vercel')?/^VERCEL_TOKEN=(.+)$/m.exec(readFileSync('.env.vercel','utf8'))?.[1]?.trim():undefined;
const token=process.env.VERCEL_TOKEN||fileToken;
const scope=process.env.VERCEL_SCOPE;
const webProject=arg('web-project','feikuai-web'),approverProject=arg('approver-project','feikuai-approve');
for(const project of [webProject,approverProject])if(!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(project))throw new Error('Project names must be Vercel project slugs, not paths.');
if(scope&&!/^[a-z0-9][a-z0-9_-]*$/i.test(scope))throw new Error('VERCEL_SCOPE must be a team slug or ID.');
const apiUrl=(process.env.FEIKUAI_API_URL||'').replace(/\/$/,'');
const webUrl=(process.env.FEIKUAI_WEB_URL||`https://${webProject}.vercel.app`).replace(/\/$/,'');
if(selectedSite!=='approver'&&!/^https:\/\/[a-z0-9.-]+$/i.test(apiUrl))throw new Error('Set FEIKUAI_API_URL to the API origin, for example https://feikuai-api.onrender.com');
if(!/^https:\/\/[a-z0-9.-]+$/i.test(webUrl))throw new Error('Set FEIKUAI_WEB_URL to the exact HTTPS workspace origin.');

const security=[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'Strict-Transport-Security',value:'max-age=31536000'}];
const sites=[
 {kind:'web',project:webProject,dist:'apps/web/dist',config:'apps/web/vite.config.ts',env:{},vercel:{
  rewrites:[{source:'/api/:path*',destination:`${apiUrl}/api/:path*`},{source:'/health',destination:`${apiUrl}/health`},{source:'/(.*)',destination:'/index.html'}],
  headers:[{source:'/(.*)',headers:[...security,{key:'X-Frame-Options',value:'DENY'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}]}]}},
 {kind:'approver',project:approverProject,dist:'apps/approver/dist',config:'apps/approver/vite.config.ts',
  // The approver pins its own policy and registry at build time and accepts messages only from the workspace origin.
  env:{DEPLOYMENT_MANIFEST_PATH:'deployments/fuji.json',TRUSTED_REGISTRY_PATH:'fixtures/trusted-registry.fuji.json',WEB_ORIGIN:webUrl,DEMO_WALLET_AVAILABLE:'false'},vercel:{
  rewrites:[{source:'/(.*)',destination:'/index.html'}],
  headers:[{source:'/(.*)',headers:[...security,{key:'X-Frame-Options',value:'DENY'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.avax-test.network; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}]}]}},
];
const vercel=(args:string[],cwd:string)=>{const r=spawnSync('npx',['--yes','vercel@63.1.2',...args,...(token?['--token',token]:[]),...(scope?['--scope',scope]:[])],{cwd,encoding:'utf8'});const out=`${r.stdout??''}${r.stderr??''}${r.error?.message??''}`;return {ok:r.status===0,out:token?out.replaceAll(token,'[token]'):out};};

for(const site of sites.filter(site=>selectedSite==='all'||site.kind===selectedSite)){
 const priorEnv=Object.fromEntries(Object.keys(site.env).map(key=>[key,process.env[key]]));
 console.log(`Building ${site.project}…`);
 try{Object.assign(process.env,site.env);await build({configFile:site.config,logLevel:'warn'});}
 finally{for(const [key,value] of Object.entries(priorEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 const stage=resolve('var/vercel',site.project);
 const linked=existsSync(join(stage,'.vercel'))?readFileSync(join(stage,'.vercel','project.json'),'utf8'):null;
 rmSync(stage,{recursive:true,force:true});mkdirSync(stage,{recursive:true});
 cpSync(site.dist,stage,{recursive:true});
 writeFileSync(join(stage,'vercel.json'),JSON.stringify({$schema:'https://openapi.vercel.sh/vercel.json',cleanUrls:false,trailingSlash:false,...site.vercel},null,2));
 if(linked){mkdirSync(join(stage,'.vercel'));writeFileSync(join(stage,'.vercel','project.json'),linked);}
 if(dryRun){console.log(`  staged ${stage} (dry run, not deployed)`);continue;}
 if(!linked){vercel(['project','add',site.project],stage);const link=vercel(['link','--yes','--project',site.project],stage);if(!link.ok)throw new Error(`Linking ${site.project} failed:\n${link.out}`);}
 const deploy=vercel(['deploy','--prod','--yes'],stage);
 if(!deploy.ok)throw new Error(`Deploying ${site.project} failed:\n${deploy.out}`);
 const url=deploy.out.match(/https:\/\/[^\s]+\.vercel\.app/g)?.at(-1);
 console.log(`  deployed ${site.project}: ${url??'see the Vercel dashboard'}`);
}
console.log(`\nSet on the API (Render): WEB_ORIGIN=${webUrl}  APPROVER_ORIGIN=${process.env.FEIKUAI_APPROVER_URL||`https://${approverProject}.vercel.app`}`);
