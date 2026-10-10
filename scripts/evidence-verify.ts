import {readFileSync} from 'node:fs';
import {verifyBundle,verifyApprovalRequest} from '@secure-finance/evidence';
import {verifyOnlineSettlement} from '../packages/evidence/src/online.js';
import {deploymentSchema} from '@secure-finance/chain';
const args=process.argv.slice(2).filter(v=>v!=='--');const file=args[0];
if(!file){console.error('Usage: pnpm evidence:verify -- <bundle.zip|request.json> [--online --deployment <trusted-manifest.json> [--rpc <trusted-node>]]');process.exit(1);}
const option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};const path=option('--deployment');const pin=path?deploymentSchema.parse(JSON.parse(readFileSync(path,'utf8'))):undefined;
const bytes=readFileSync(file);const isZip=bytes[0]===0x50&&bytes[1]===0x4b;const result=isZip?await verifyBundle(bytes,pin):await verifyApprovalRequest(JSON.parse(bytes.toString('utf8')),pin);
const {packet,...report}=result;
let online:unknown;
if(args.includes('--online')){if(!pin)throw new Error('Online mode requires explicitly selected trusted deployment');if(!packet)throw new Error('No verified packet');online=await verifyOnlineSettlement(packet,pin,option('--rpc')??pin.rpcUrl);}
console.log(JSON.stringify({...report,...(online?{online}:{}),verificationMode:args.includes('--online')?'ONLINE_PINNED':'OFFLINE',businessFacts:'APPLICATION_REPORTED'},null,2));
if(('integrityValid' in result&&!result.integrityValid)||('artifactIntegrity'in result&&result.artifactIntegrity!=='VALID')||('signatureCorrespondence'in result&&result.signatureCorrespondence==='INVALID')||('signerEligibility'in result&&result.signerEligibility==='INVALID')||(online&&['MISMATCH','RPC_UNAVAILABLE'].includes((online as {settlement:string}).settlement)))process.exitCode=1;
