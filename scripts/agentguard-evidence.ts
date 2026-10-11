import {readFileSync,statSync} from 'node:fs';
import {agentProofSchema,verifyAgentDecisionProof} from '../packages/evidence/src/agentguard.js';
import {verifyAgentDecisionOnline} from '../packages/evidence/src/agentguard-online.js';
const args=process.argv.slice(2).filter(v=>v!=='--'),file=args[0];
const option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
function read(path:string){if(statSync(path).size>2*1024*1024)throw new Error('Evidence input exceeds 2 MiB');return JSON.parse(readFileSync(path,'utf8'));}
if(!file)throw new Error('Usage: tsx scripts/agentguard-evidence.ts proof.json --root <independently-trusted-root> --count <leaves>, or --pin trusted-anchor.json');
const proof=agentProofSchema.parse(read(file)),pin=option('--pin');
if(pin){const result=await verifyAgentDecisionOnline(proof,read(pin));console.log(JSON.stringify(result,null,2));if(result.status!=='VERIFIED_ANCHOR')process.exitCode=1;}
else{const root=option('--root'),count=Number(option('--count'));if(!root||!Number.isSafeInteger(count)||count<1)throw new Error('Offline verification requires a separately obtained root and leaf count.');const valid=verifyAgentDecisionProof(proof,root,count);console.log(JSON.stringify({inclusion:valid?'VALID':'INVALID',anchor:'UNVERIFIED_OFFLINE',settlement:'NOT_ASSESSED'},null,2));if(!valid)process.exitCode=1;}
