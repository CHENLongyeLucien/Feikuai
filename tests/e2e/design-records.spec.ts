import {test,expect,type BrowserContext,type Page,type TestInfo,type Cookie} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {CaseDTO} from '../../apps/web/src/app/types';
import type {InboxItem} from '../../apps/web/src/features/inbox/types';

// Reuse existing private demo records. The only authorized write is creation of a local login session.
// No source, proposal, authorization, payment, cancellation or notification is created by this suite.
const mainOrigin=process.env.SF_DESIGN_WEB_URL||'http://localhost:5183';
const approverOrigin=process.env.SF_DESIGN_APPROVER_URL||'http://localhost:5184';
const sizes=[{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}];
const allowedRpcReads=new Set(['eth_chainId','eth_getCode','eth_getBlockByNumber','eth_getBlockByHash','eth_call','eth_blockNumber','eth_getTransactionReceipt','eth_getTransactionByHash','net_version']);
let session:Cookie[]|undefined;
let blockedWrites:string[]=[],uncaughtErrors:string[]=[],observations:Record<string,unknown>={};
const slug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const privateDirectory=(info:TestInfo)=>{const directory=join('var/design-qa',info.project.name,slug(info.title));mkdirSync(directory,{recursive:true,mode:0o700});return directory;};

async function guard(context:BrowserContext){
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  if(['GET','HEAD','OPTIONS'].includes(method)){await route.continue();return;}
  if(method==='POST'&&url.origin===new URL(mainOrigin).origin&&url.pathname==='/api/v1/auth/demo'){await route.continue();return;}
  if(method==='POST'&&!url.pathname.startsWith('/api/')){
   try{const parsed=request.postDataJSON(),messages=Array.isArray(parsed)?parsed:[parsed];if(messages.length&&messages.every((message:unknown)=>typeof message==='object'&&message!==null&&'method'in message&&allowedRpcReads.has(String(message.method)))){await route.continue();return;}}catch{/* Non-RPC writes remain blocked. */}
  }
  blockedWrites.push(`${method} ${url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,':id')}`);
  await route.abort('blockedbyclient');
 });
}
async function login(page:Page,path='/'){
 if(session)await page.context().addCookies(session);
 else{const response=await page.request.post(`${mainOrigin}/api/v1/auth/demo`,{headers:{Origin:new URL(mainOrigin).origin}});
 expect(response.status(),'Only the explicitly authorized local demo sign-in may create a session').toBe(200);session=await page.context().cookies();}
 await page.goto(path);await expect(page.getByRole('button',{name:/Northstar team/})).toBeVisible();
}
async function readJson<T>(page:Page,path:string):Promise<T>{
 expect(path.startsWith('/api/v1/'),'All record requests are read-only API GETs').toBe(true);
 const response=await page.request.get(`${mainOrigin}${path}`);expect(response.status(),`Read-only ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,':id')}`).toBe(200);return response.json() as Promise<T>;
}
async function existingCase(page:Page){
 const {cases}=await readJson<{cases:CaseDTO[]}>(page,'/api/v1/cases');
 const saved=cases.find(item=>item.latestProposal&&item.settlementStatus==='SETTLED'&&item.paymentRoute!=='REGISTERED_POLICY');
 expect(saved,'A previously settled human-approval case must already exist; this suite never creates one').toBeTruthy();
 return saved!;
}
async function existingExports(page:Page,info:TestInfo){
 const saved=await existingCase(page);
 const packetResponse=await page.request.get(`${mainOrigin}/api/v1/proposals/${saved.latestProposal!.id}/approval-request`);
 expect(packetResponse.status()).toBe(200);const packet=await packetResponse.body();
 const bundleResponse=await page.request.get(`${mainOrigin}/api/v1/cases/${saved.id}/evidence`);
 expect(bundleResponse.status()).toBe(200);const bundle=await bundleResponse.body();
 expect(bundleResponse.headers()['content-type']).toContain('application/zip');
 const directory=privateDirectory(info);
 const packetPath=join(directory,'existing-approval-request.json'),bundlePath=join(directory,'existing-evidence.zip');
 writeFileSync(packetPath,packet,{mode:0o600});writeFileSync(bundlePath,bundle,{mode:0o600});
 return {saved,packet,bundle,packetPath,bundlePath};
}
async function fit(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Saved-record interface must fit without horizontal document scrolling').toBe(true);}
async function capture(page:Page,info:TestInfo,label:string){await fit(page);await page.screenshot({path:join(privateDirectory(info),`${label}.png`),fullPage:true,animations:'disabled'});}
function safeObservation(info:TestInfo,page:Page){writeFileSync(join(privateDirectory(info),'results.json'),JSON.stringify({observedAt:new Date().toISOString(),title:info.title,project:info.project.name,status:info.status,viewport:page.viewportSize(),scope:'Existing records only. Local sign-in is the sole allowed application write. No wallet action, signing or financial mutation.',blockedMutationCount:blockedWrites.length,uncaughtErrorTypes:uncaughtErrors,...observations},null,2)+'\n',{mode:0o600});}

test.beforeEach(async({page,context})=>{blockedWrites=[];uncaughtErrors=[];observations={};await guard(context);page.on('pageerror',error=>uncaughtErrors.push(error.name));});
test.afterEach(async({page},info)=>{expect.soft(blockedWrites,'No application or RPC mutation may be attempted').toEqual([]);expect.soft(uncaughtErrors,'No uncaught browser errors').toEqual([]);safeObservation(info,page);});

for(const size of sizes){
 test(`saved source stages and payment review fit ${size.name} ${size.width}px`,async({page},info)=>{
  await page.setViewportSize(size);await login(page);
  const {items}=await readJson<{items:InboxItem[]}>(page,'/api/v1/inbox?limit=100');
  const item=items.find(value=>value.status==='quarantined'&&value.stages.length===5)||items.find(value=>value.stages.length===5);
  expect(item,'An existing source with five recorded stages is required; no source is submitted by this suite').toBeTruthy();
  await page.goto(`/inbox/${item!.id}`);await expect(page.getByRole('heading',{level:1,name:item!.title,exact:true})).toBeVisible();
  const stages=page.getByRole('group',{name:'Review stages'}).or(page.locator('.sf-pipeline'));
  await expect(stages.locator('.sf-pipeline-step')).toHaveCount(5);
  for(let index=0;index<item!.stages.length;index++){
   await stages.locator('.sf-pipeline-step').nth(index).click();
   await expect(page.locator('.sf-stage-detail').getByRole('heading',{name:item!.stages[index]!.name,exact:true})).toBeVisible();await fit(page);
  }
  if(item!.status==='quarantined')await expect(page.getByRole('button',{name:'Approve workflow',exact:true})).toHaveCount(0);
  const source=page.locator('.sf-source-disclosure');await source.locator('summary').click();
  await expect(source.locator('pre')).toHaveText(item!.text);await fit(page);await source.locator('summary').click();
  await expect(source).not.toHaveAttribute('open','');
  await page.locator('.sf-pipeline-step').nth(1).click();await capture(page,info,'saved-source-review');
  const saved=await existingCase(page);await page.goto(`/cases/${saved.id}`);
  const workspace=page.getByTestId('case-workspace');await expect(workspace.getByRole('heading',{name:saved.invoiceReference,exact:true})).toBeVisible();
  await expect(workspace.getByRole('heading',{name:'Review outcome',exact:true})).toBeVisible();
  const original=workspace.locator('details').filter({has:page.locator('summary',{hasText:'Read original source'})});
  await original.locator('summary').click();await expect(original.locator('pre')).toBeVisible();await fit(page);await original.locator('summary').click();
  await workspace.getByRole('button',{name:'Review & approval',exact:true}).click();
  await expect(workspace.getByRole('heading',{name:'Authorize this payment',exact:true})).toBeVisible();
  await expect(workspace.getByRole('button',{name:'Review payment',exact:true})).toBeDisabled();
  await expect(workspace.getByRole('button',{name:'Request execution',exact:true})).toBeDisabled();
  await capture(page,info,'saved-payment-approval');
  await workspace.getByRole('button',{name:'Execution & evidence',exact:true}).click();
  await expect(workspace.getByRole('heading',{name:'Verified onchain settlement',exact:true})).toBeVisible();
  await expect(workspace.getByRole('heading',{name:'Review report',exact:true})).toBeVisible();
  await capture(page,info,'saved-payment-receipt');
  observations={savedSourceStatus:item!.status,recordedStageCount:item!.stages.length,savedPaymentStatus:saved.settlementStatus,disabledResubmissionVerified:true};
 });

 test(`saved JSON and ZIP evidence verify with invalid-file recovery at ${size.name} ${size.width}px`,async({page},info)=>{
  await page.setViewportSize(size);await login(page,'/evidence');
  const exports=await existingExports(page,info);
  await expect(page.getByRole('heading',{level:1,name:'History & reports',exact:true})).toBeVisible();
  await page.getByText('Advanced verification', {exact:true}).click();
  const input=page.getByLabel('Choose an evidence ZIP or approval request JSON',{exact:true});
  const report=page.getByRole('region',{name:'Verification result',exact:true});
  await input.setInputFiles(exports.packetPath);
  await expect(report.getByRole('heading',{name:'Integrity checks passed',exact:true})).toBeVisible();
  await expect(report.getByRole('heading',{name:'Unsigned approval request',exact:true})).toBeVisible();
  await expect(report.getByRole('heading',{name:'Not checked offline',exact:true})).toBeVisible();
  await expect(report.locator('.evidence-check').filter({hasText:'Signer authority'}).getByRole('heading',{name:'Not checked',exact:true})).toBeVisible();
  await expect(report.locator('.evidence-details')).not.toHaveAttribute('open','');
  await capture(page,info,'valid-approval-evidence');
  const invalid={name:'invalid-approval-request.json',mimeType:'application/json',buffer:Buffer.from('{ invalid json')};
  await input.setInputFiles(invalid);
  await expect(report.getByRole('heading',{name:'Integrity checks failed',exact:true})).toBeVisible();
  await expect(report.getByText('Do not rely on this package as intact evidence. Obtain a complete, unchanged export and check it again.',{exact:true})).toBeVisible();
  await expect(input).toBeEnabled();await expect(input).toHaveValue('');
  await capture(page,info,'invalid-evidence-recovery');
  await input.setInputFiles(invalid);await expect(report.getByRole('heading',{name:'Integrity checks failed',exact:true})).toBeVisible();
  await input.setInputFiles(exports.packetPath);await expect(report.getByRole('heading',{name:'Integrity checks passed',exact:true})).toBeVisible();
  await input.setInputFiles(exports.bundlePath);
  await expect(report.getByRole('heading',{name:'Integrity checks passed',exact:true})).toBeVisible();
  await expect(report.getByRole('heading',{name:'Matches this request',exact:true})).toBeVisible();
  await expect(report.getByRole('heading',{name:'Not checked offline',exact:true})).toBeVisible();
  await expect(report.getByText(/Business facts remain application reported/)).toBeVisible();
  await capture(page,info,'valid-signed-bundle');
  observations={approvalRequestIntegrity:'VALID',requestSignature:'REQUEST_ONLY',invalidJsonIntegrity:'INVALID',sameFileRetry:true,bundleIntegrity:'VALID',bundleSignatureCorrespondence:'VALID',settlementClaim:'NOT_CHECKED_OFFLINE',signerAuthority:'NOT_CHECKED'};
 });

 test(`saved resolved approval remains readable and cannot sign at ${size.name} ${size.width}px`,async({page},info)=>{
  await page.setViewportSize(size);await login(page);
  const exports=await existingExports(page,info);
  await page.goto(approverOrigin);
  await expect(page.getByRole('heading',{level:1,name:'Review. Sign. Return.',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign exact payment',exact:true})).toHaveCount(0);
  const input=page.getByLabel('Approval request file',{exact:true});
  await input.setInputFiles(exports.packetPath);
  await expect(page.getByText('Evidence verified',{exact:true})).toBeVisible();
  await expect(page.getByText('Signing unavailable',{exact:true})).toBeVisible();
  await expect(page.getByText('This authorization has already been used or cancelled.',{exact:true})).toBeVisible();
  await expect(page.getByText('This invoice already has a payment recorded onchain.',{exact:true})).toBeVisible();
  await expect(page.getByText('This request has expired. You can still inspect it or cancel an unused nonce.',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Exact payment terms',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign exact payment',exact:true})).toBeDisabled();
  const cancellation=page.locator('details').filter({has:page.locator('summary',{hasText:'Cancel this authorization'})});
  await cancellation.locator('summary').click();
  await expect(page.getByRole('button',{name:'Cancel nonce in wallet',exact:true})).toBeDisabled();
  await cancellation.locator('summary').click();
  await expect(page.locator('details').filter({has:page.locator('summary',{hasText:'All signed fields and payment policy'})})).not.toHaveAttribute('open','');
  await capture(page,info,'resolved-approval');
  await page.getByRole('button',{name:'Refresh checks',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Payment eligibility has been checked again.');
  await expect(page.getByRole('button',{name:'Sign exact payment',exact:true})).toBeDisabled();
  const source=page.locator('section').filter({has:page.getByRole('heading',{name:'Check the source',exact:true})});
  const sourceDetails=source.locator(':scope > details').first();await sourceDetails.locator(':scope > summary').click();
  await expect(sourceDetails.getByRole('button',{name:'Download verified source',exact:true})).toBeEnabled();await expect(sourceDetails.locator('pre')).toBeVisible();await fit(page);await sourceDetails.locator(':scope > summary').click();
  observations={integrity:'VERIFIED',eligibility:'SIGNING_UNAVAILABLE',expiredRequest:true,nonceResolved:true,invoiceAlreadySettled:true,signButtonDisabled:true,cancellationButtonDisabled:true,walletInteraction:false,freshReadOnlyRefresh:true};
 });
}
