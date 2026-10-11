import {test,expect} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,http,decodeEventLog,type Address,type Hex} from 'viem';
import {deploymentSchema,paymentGuardAbi,demoTokenAbi,automationGuardAbi} from '../../packages/chain/src/index';
import {fixtureText} from '../../apps/api/src/db/seed';
import {formatAmount} from '../../packages/shared/src/index';

test('guided human approval returns its wallet signature across origins and settles the exact registered payable',async({page},testInfo)=>{
 const deployment=deploymentSchema.parse(JSON.parse(readFileSync('var/experience-demo/deployment.json','utf8')));
 const registry=JSON.parse(readFileSync('var/experience-demo/registry.json','utf8')) as {payables:Array<{id:string;scenarioId:string;invoiceKey:Hex;recipient:Address;supplierKey:Hex;supplierName:string;invoiceReference:string;amountAtomic:string}>};
 const automation=JSON.parse(readFileSync('var/experience-demo/automation.json','utf8')) as {vault:Address;rpcUrl:string;approvedPayableIds:string[]};
 const rpc=createPublicClient({transport:http('http://127.0.0.1:18545')});
 expect(deployment.rpcUrl).toBe('http://127.0.0.1:18545');expect(await rpc.getChainId()).toBe(31337);
 expect(automation.rpcUrl).toBe(deployment.rpcUrl);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 mkdirSync('docs/qa',{recursive:true});
 await page.goto('/workflow');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Explore the demo',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeHidden();
 const casesResponse=await page.request.get('/api/v1/cases');expect(casesResponse.ok()).toBe(true);
 const existingCases=(await casesResponse.json()).cases as Array<{invoiceKey:string}>;
 const usedInvoices=new Set(existingCases.map(entry=>entry.invoiceKey));
 const candidates=registry.payables.filter(entry=>(/^SMALL-10-/.test(entry.scenarioId)||/^BENIGN-/.test(entry.scenarioId)&&!/^BENIGN-0[1-5]$/.test(entry.scenarioId))&&!automation.approvedPayableIds.includes(entry.id)&&!usedInvoices.has(entry.invoiceKey)).sort((a,b)=>Number(!a.scenarioId.startsWith('SMALL-10-'))-Number(!b.scenarioId.startsWith('SMALL-10-')));
 let payable:typeof registry.payables[number]|undefined;
 for(const candidate of candidates){
  const [consumed,registered]=await Promise.all([
   rpc.readContract({address:deployment.vault,abi:paymentGuardAbi,functionName:'invoiceSettlementDigest',args:[candidate.invoiceKey]}),
   rpc.readContract({address:automation.vault,abi:automationGuardAbi,functionName:'obligations',args:[candidate.invoiceKey]})
  ]);
  if(consumed==='0x'+'0'.repeat(64)&&registered[3]==='0x'+'0'.repeat(64)){payable=candidate;break;}
 }
 if(!payable)throw new Error('No unused human-payment fixture remains in the preserved isolated demo. All candidates already have cases, settlements or registered automatic authority. Prepare another reviewed synthetic payable; this test will not reset state or replay a paid invoice.');
 const expectedAmount=BigInt(payable.amountAtomic);
 expect(expectedAmount,'Use the exact positive amount recorded for this payable').toBeGreaterThan(0n);
 if(payable.scenarioId.startsWith('SMALL-10-'))expect(expectedAmount,'New small-invoice fixtures must be exactly 10 DEMO').toBe(10_000_000n);
 // Intake goes through the authenticated API; this test exercises the approval and payment UI.
 const inboxId=await page.evaluate(async({text,payableId})=>{const session=await (await fetch('/api/v1/session')).json();const response=await fetch('/api/v1/inbox',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken,'idempotency-key':crypto.randomUUID()},body:JSON.stringify({channel:'invoice',title:'Invoice with human payment review',text,payableId})});if(!response.ok)throw new Error(`Intake failed: ${response.status} ${await response.text()}`);return (await response.json()).id as string;},{text:fixtureText(payable),payableId:payable.id});
 const item=()=>page.request.get(`/api/v1/inbox/${inboxId}`).then(response=>response.json());
 await expect.poll(async()=>(await item()).stages.map((stage:{status:string})=>stage.status),{timeout:60000}).toEqual(['passed','passed','passed','passed','passed']);
 expect((await item()).payment.requiresWalletSignature).toBe(true);
 const caseId=(await item()).linkedCaseId as string;expect(caseId).toBeTruthy();
 await page.goto(`/workflow?case=${caseId}`);
 await expect(page.getByTestId('case-workspace')).toBeVisible();
 await page.getByRole('button',{name:'Review & approval',exact:true}).click();
 await expect(page.getByRole('button',{name:'Request execution',exact:true})).toBeDisabled();
 const popup=page.waitForEvent('popup');
 await page.getByRole('button',{name:`Approve & pay ${formatAmount(payable.amountAtomic)} DEMO to ${payable.supplierName}`,exact:true}).click();
 const approval=await popup;approval.on('pageerror',error=>errors.push(error.message));
 await expect(approval).toHaveURL(/^http:\/\/localhost:5184\/#review=[a-f0-9-]+$/);
 // No request (and no signing window) exists until the approval wallet is ready.
 await expect(approval.getByRole('heading',{name:'1 · Prepare your approval wallet',exact:true})).toBeVisible();
 expect((await page.request.get(`/api/v1/cases/${caseId}`).then(response=>response.json())).latestProposal).toBeNull();
 await approval.getByRole('button',{name:'Use demo approval wallet',exact:true}).click();
 await expect(approval.getByRole('button',{name:'Demo wallet selected',exact:true})).toBeDisabled();
 await approval.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await expect(approval.getByRole('heading',{name:'Approval wallet ready',exact:true})).toBeVisible();
 await expect(approval.getByRole('heading',{name:'Exact payment terms',exact:true})).toBeVisible();
 await expect(approval.getByText('Evidence verified',{exact:true})).toBeVisible();
 await expect(approval.locator('.supplier-name')).toHaveText(payable.supplierName);
 await expect(approval.locator('.essential-terms')).toContainText(`${formatAmount(payable.amountAtomic)} DEMO`);
 await approval.getByText('All signed fields and payment policy',{exact:true}).click();
 await expect(approval.locator('.payment-review')).toContainText(payable.amountAtomic);
 await expect(approval.locator('.payment-review')).toContainText(deployment.vault);
 await expect(approval.locator('.payment-review')).toContainText(payable.recipient);
 await approval.getByText('All signed fields and payment policy',{exact:true}).click();
 await approval.getByText('original.txt',{exact:true}).click();
 await expect(approval.locator('pre:visible').filter({hasText:payable.invoiceReference})).toBeVisible();
 await approval.getByText('original.txt',{exact:true}).click();
 await expect(approval.getByRole('button',{name:'Sign exact payment',exact:true})).toBeDisabled();
 await approval.getByRole('checkbox').check();
 await approval.screenshot({path:'docs/qa/guided-approval-before-signing.png',fullPage:true});
 const before=await rpc.readContract({address:deployment.token,abi:demoTokenAbi,functionName:'balanceOf',args:[payable.recipient]});
 await approval.getByRole('button',{name:'Sign exact payment',exact:true}).click();
 await expect(approval.getByRole('status')).toContainText('received and verified');
 // Approve & pay submits once automatically; no second click is needed.
 await approval.getByRole('button',{name:'Return to case',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Verified onchain settlement',exact:true})).toBeVisible({timeout:60000});
 const current=await page.request.get(`/api/v1/cases/${caseId}`).then(response=>response.json());
 const receipt=await rpc.getTransactionReceipt({hash:current.settlement.txHash});expect(receipt.status).toBe('success');
 const decoded=receipt.logs.filter(log=>log.address.toLowerCase()===deployment.vault).map(log=>decodeEventLog({abi:paymentGuardAbi,data:log.data,topics:log.topics}));
 const payment=decoded.find(log=>log.eventName==='PaymentExecuted');expect(payment).toBeTruthy();
 if(payment?.eventName!=='PaymentExecuted')throw new Error('Verified receipt lacks payment event');
 expect(payment.args.invoiceKey).toBe(payable.invoiceKey);expect(payment.args.recipient.toLowerCase()).toBe(payable.recipient);
 expect(payment.args.amountAtomic).toBe(expectedAmount);
 const after=await rpc.readContract({address:deployment.token,abi:demoTokenAbi,functionName:'balanceOf',args:[payable.recipient]});
 expect(after-before).toBe(expectedAmount);
 await page.screenshot({path:'docs/qa/guided-approval-settled.png',fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF report',exact:true}).click();
 await (await downloadPromise).saveAs(testInfo.outputPath('guided-payment-report.pdf'));
 expect(errors).toEqual([]);
 writeFileSync('docs/qa/guided-payment-result.json',JSON.stringify({inboxId,caseId,invoiceReference:payable.invoiceReference,scenarioId:payable.scenarioId,transactionHash:receipt.transactionHash,recipientDeltaAtomic:String(after-before),receiptStatus:receipt.status,bridgeOrigins:['http://localhost:5183','http://localhost:5184'],walletSignatureReturned:true,errors},null,2));
});
