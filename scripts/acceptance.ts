import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
const pnpmEntry=process.env.npm_execpath?.includes('pnpm')?process.env.npm_execpath:existsSync('node_modules/pnpm/bin/pnpm.cjs')?'node_modules/pnpm/bin/pnpm.cjs':undefined;
const gates=['typecheck','lint','test','contracts:build','test:contracts','test:integration','build','test:e2e'];
mkdirSync('docs/results',{recursive:true});
const results=[];
for(const gate of gates){console.log(`\nRunning acceptance gate: ${gate}`);const start=Date.now();const result=await new Promise<{code:number;output:string}>(resolve=>{const p=spawn(pnpmEntry?process.execPath:'pnpm',pnpmEntry?[pnpmEntry,gate]:[gate],{env:process.env});let output='';p.stdout.on('data',b=>{process.stdout.write(b);output+=b;});p.stderr.on('data',b=>{process.stderr.write(b);output+=b;});p.on('error',e=>resolve({code:1,output:output+e.message}));p.on('close',code=>resolve({code:code??1,output}));});writeFileSync(`docs/results/${gate.replaceAll(':','-')}.log`,result.output);results.push({gate,status:result.code===0?'PASS':'FAIL',exitCode:result.code,durationMs:Date.now()-start});}
const report={observedAt:new Date().toISOString(),runtime:process.version,environment:'local deterministic acceptance',results,externalGates:{liveAgents:'NOT_RUN: provider credentials required',fuji:'NOT_RUN: funded separate role wallets and genuine human signing required',manualWalletDisplay:'NOT_RUN'}};
writeFileSync('docs/results/acceptance.json',JSON.stringify(report,null,2));console.table(results);process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
