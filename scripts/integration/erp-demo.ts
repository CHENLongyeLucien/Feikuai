/**
 * Plays the role of a customer's ERP calling the Feikuai integration API, step by step.
 * Usage: FEIKUAI_TOKEN=sfk_... tsx scripts/integration/erp-demo.ts [--attack] [--url http://localhost:3001]
 *  --attack  sends an invoice whose payout wallet differs from the ERP's supplier record.
 *  --wait    after printing the approval link, follow the execution until it is confirmed.
 * The script never signs or pays: it prints the approval link a person must open.
 */
import {readFileSync} from 'node:fs';

const arg=(name:string)=>{const i=process.argv.indexOf(`--${name}`);return i>0?process.argv[i+1]:undefined;};
const url=(arg('url')??process.env.FEIKUAI_URL??'http://localhost:3001').replace(/\/$/,'')+'/api/v1/integrations',token=process.env.FEIKUAI_TOKEN,attack=process.argv.includes('--attack');
if(!token){console.error('Set FEIKUAI_TOKEN (create one with: pnpm integration:token issue --tenant <tenant> --name acme-erp).');process.exit(2);}
const registry=JSON.parse(readFileSync(arg('registry')??'fixtures/trusted-registry.fuji.json','utf8')) as {suppliers:Array<{name:string;supplierKey:string;recipient:string;version:string}>};
const atlas=registry.suppliers.find(s=>s.name==='Atlas Cloud Services')??registry.suppliers[0]!;
const run=Date.now().toString(36).toUpperCase(),externalId=`ap-${run}`,invoiceReference=`ACME-${run}`;
async function call(method:string,path:string,body?:unknown,form?:FormData){
 const response=await fetch(url+path,{method,headers:{authorization:`Bearer ${token}`,...(method==='POST'?{'idempotency-key':`${path}:${run}`}:{}),...(body?{'content-type':'application/json'}:{})},body:form??(body?JSON.stringify(body):undefined)});
 const data=await response.json() as any;if(!response.ok)throw new Error(`${method} ${path} → ${response.status} ${data.error?.code}: ${data.error?.message}`);return data;
}
const step=(n:number,text:string)=>console.log(`\n\x1b[1m${n}. ${text}\x1b[0m`);

step(1,`ERP sends the payable  POST /payables  (${externalId})`);
const payable=await call('POST','/payables',{externalId,sourceSystem:'acme-erp',invoiceReference,supplier:{externalId:'atlas-cloud',name:atlas.name,recipient:atlas.recipient,version:atlas.version??'1',supplierKey:atlas.supplierKey},amount:{atomic:'10000000',token:'DEMO'}});
console.log(`   registered ${payable.invoiceReference}: ${Number(payable.amount.atomic)/1e6} DEMO to ${payable.supplier.name}`);

step(2,`ERP sends the supplier's invoice  POST /cases${attack?'  (payout wallet altered by the sender)':''}`);
const recipient=attack?'0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c':atlas.recipient;
const text=['ATLAS CLOUD SERVICES - INVOICE',`Invoice reference: ${invoiceReference}`,`Supplier: ${atlas.name}`,`Supplier reference: ${atlas.supplierKey}`,'Amount: 10.00 DEMO',`Recipient: ${recipient}`,'Service: Managed cloud platform. Synthetic data; DEMO has no monetary value.'].join('\n');
const form=new FormData();form.append('sourceSystem','acme-erp');form.append('payableExternalId',externalId);form.append('file',new Blob([text],{type:'text/plain'}),`${invoiceReference}.txt`);
let c=await call('POST','/cases',undefined,form);console.log(`   case ${c.id}: ${c.status}`);

step(3,'ERP waits for the checks  GET /cases/{id}');
const started=Date.now();
while(c.status==='PROCESSING'&&Date.now()-started<90000){await new Promise(r=>setTimeout(r,1500));c=await call('GET',`/cases/${c.id}`);}
console.log(`   status after ${((Date.now()-started)/1000).toFixed(1)} s: \x1b[1m${c.status}\x1b[0m`);
for(const check of c.checks.filter((x:any)=>!x.passed))console.log(`   ✗ ${check.code}: ${check.summary}`);
if(c.holdReason)console.log(`   reason: ${c.holdReason}`);
console.log(`   next: ${c.nextAction}`);

if(c.status==='READY_FOR_APPROVAL'){
 step(4,'A person approves in the approval application (the API cannot)');
 console.log(`   open: ${c.approval.approvalUrl}\n   then click "Approve & pay", connect the approver wallet and sign.`);
 if(!process.argv.includes('--wait')){console.log('\n   (run again with --wait to follow the execution after approval)');process.exit(0);}
 step(5,'ERP follows the execution  GET /executions/{id}  (waiting up to 10 minutes)');
 const waitStart=Date.now();
 while(!c.execution&&Date.now()-waitStart<600000){await new Promise(r=>setTimeout(r,3000));c=await call('GET',`/cases/${c.id}`);}
 if(c.execution){let e=await call('GET',`/executions/${c.execution.id}`);while(!['CONFIRMED','REVERTED','UNKNOWN','INCONSISTENT'].includes(e.status)){await new Promise(r=>setTimeout(r,3000));e=await call('GET',`/executions/${c.execution.id}`);}
  console.log(`   execution ${e.status}${e.txHash?`  tx ${e.txHash}`:''}${e.settlement?'  (receipt verified)':''}`);}
 else console.log('   no approval yet; run GET /cases/{id} later.');
}
