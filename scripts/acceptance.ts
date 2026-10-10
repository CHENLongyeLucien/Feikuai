import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
const pnpmEntry=process.env.npm_execpath?.includes('pnpm')?process.env.npm_execpath:existsSync('node_modules/pnpm/bin/pnpm.cjs')?'node_modules/pnpm/bin/pnpm.cjs':undefined;
const gates=['typecheck','lint','test','contracts:build','test:contracts','test:integration','build','test:e2e'];
const output='docs/results/experience';
const integrationManifest=process.env.SF_INTEGRATION_MANIFEST_PATH||'var/experience-demo/deployment.json';
if(!existsSync(integrationManifest))throw new Error('Start pnpm demo:start first. Acceptance uses its isolated deployment; it does not start or reset the saved demonstration.');
mkdirSync(output,{recursive:true});
const results=[];
for(const gate of gates){console.log(`\nRunning acceptance gate: ${gate}`);const start=Date.now();const result=await new Promise<{code:number;output:string}>(resolve=>{const env=gate==='test:integration'?{...process.env,SF_INTEGRATION_MANIFEST_PATH:integrationManifest}:process.env;const p=spawn(pnpmEntry?process.execPath:'pnpm',pnpmEntry?[pnpmEntry,gate]:[gate],{env});let output='';p.stdout.on('data',b=>{process.stdout.write(b);output+=b;});p.stderr.on('data',b=>{process.stderr.write(b);output+=b;});p.on('error',e=>resolve({code:1,output:output+e.message}));p.on('close',code=>resolve({code:code??1,output}));});writeFileSync(`${output}/${gate.replaceAll(':','-')}.log`,result.output);results.push({gate,status:result.code===0?'PASS':'FAIL',exitCode:result.code,durationMs:Date.now()-start});}
const report={observedAt:new Date().toISOString(),runtime:process.version,environment:'isolated local inbox experience; synthetic data and fixture agents',integrationManifest,results,externalGates:{liveAgents:'NOT_RUN: provider credentials/model required',fuji:'NOT_RUN: existing deployment preserved; no Fuji transaction attempted by this run',manualWalletDisplay:'NOT_RUN: browser uses explicit local demonstration wallet',mailboxOAuth:'NOT_IMPLEMENTED',isolatedUrlScanner:'NOT_CONFIGURED'},recoveryScope:'Automatic signed-outbox recovery is covered by unit tests. Legacy SIGKILL recovery results remain historical and are not rerun by this isolated suite.'};
writeFileSync(`${output}/acceptance.json`,JSON.stringify(report,null,2));console.table(results);process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
