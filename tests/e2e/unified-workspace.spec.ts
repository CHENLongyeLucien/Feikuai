import {test,expect,type BrowserContext,type Cookie,type Page,type TestInfo} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {CaseDTO} from '../../apps/web/src/app/types';
import type {InboxItem,InboxList} from '../../apps/web/src/features/inbox/types';

// Saved sources and invoices only. Authentication is the sole permitted write.
// Never submit intake, a decision, signature, cancellation, reconciliation or payment.
const origin=process.env.SF_UNIFIED_WEB_URL||'http://127.0.0.1:5283';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Unified workspace QA must use an isolated loopback preview.');
const sizes=[{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844},{name:'narrow',width:320,height:740}];
let cookies:Cookie[]|undefined;
let blockedWrites:string[]=[];
let pageErrors:string[]=[];
let observations:Record<string,unknown>={};

async function readOnlyGuard(context:BrowserContext){
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(['GET','HEAD','OPTIONS'].includes(request.method()))return route.continue();
  if(request.method()==='POST'&&url.origin===new URL(origin).origin&&['/api/v1/auth/demo','/api/v1/auth/logout'].includes(url.pathname))return route.continue();
  blockedWrites.push(`${request.method()} ${url.pathname}`);
  return route.abort('blockedbyclient');
 });
}
async function authenticate(page:Page){
 if(cookies){await page.context().addCookies(cookies);return;}
 // APIRequestContext bypasses browser interception. This explicit login is its only POST.
 const response=await page.request.post(`${origin}/api/v1/auth/demo`,{headers:{Origin:new URL(origin).origin}});
 expect(response.status(),'The isolated copied preview must permit demo authentication').toBe(200);
 cookies=await page.context().cookies();
}
async function readJson<T>(page:Page,path:string):Promise<T>{
 expect(path.startsWith('/api/v1/'),'Direct data reads stay within the local application API').toBe(true);
 const response=await page.request.get(`${origin}${path}`);
 expect(response.status(),`Read-only ${path}`).toBe(200);
 return response.json() as Promise<T>;
}
async function records(page:Page){
 const [inbox,cases]=await Promise.all([readJson<InboxList>(page,'/api/v1/inbox?limit=100'),readJson<{cases:CaseDTO[]}>(page,'/api/v1/cases')]);
 expect(inbox.items.length,'Use previously saved sources; do not generate QA fixtures').toBeGreaterThanOrEqual(2);
 expect(cases.cases.length,'Use a previously saved payment review').toBeGreaterThan(0);
 return {items:inbox.items,cases:cases.cases};
}
const workspace=(page:Page)=>page.getByTestId('workflow-workspace');
const list=(page:Page)=>page.getByTestId('workflow-list');
const sourceReview=(page:Page)=>page.locator('.sf-detail-page[data-embedded="true"]');
const itemRow=(page:Page,id:string)=>page.getByTestId(`workflow-item-${id}`);
const caseRow=(page:Page,id:string)=>page.getByTestId(`workflow-case-${id}`);
async function atWorkspace(page:Page){await expect(workspace(page)).toBeVisible();await expect(page.getByRole('button',{name:'Add item',exact:true})).toBeVisible();}
async function showList(page:Page){const expand=page.getByRole('button',{name:'Expand item list',exact:true});if(await expand.isVisible())await expand.click();}
async function selected(page:Page,kind:'item'|'case',id:string){
 await expect.poll(()=>{const url=new URL(page.url());return {path:url.pathname,id:url.searchParams.get(kind)};}).toEqual({path:'/workflow',id});
 await atWorkspace(page);
}
async function fit(page:Page){
 const result=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
 expect(result.width,'No horizontal page overflow').toBeLessThanOrEqual(result.viewport+1);
 const bounds=await workspace(page).boundingBox();
 expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(-1);
 expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width+1);
}
async function capture(page:Page,info:TestInfo,name:string){
 await fit(page);
 const slug=info.titlePath.join('-').toLowerCase().replace(/[^a-z0-9]+/g,'-');
 const directory=join('var/unified-workspace-qa',info.project.name,slug);
 mkdirSync(directory,{recursive:true,mode:0o700});
 await page.screenshot({path:join(directory,`${name}.png`),fullPage:true,animations:'disabled'});
}
function linkedHuman(items:InboxItem[],cases:CaseDTO[]){
 const source=items.find(item=>item.linkedCaseId&&cases.some(invoice=>invoice.id===item.linkedCaseId&&invoice.paymentRoute!=='REGISTERED_POLICY'));
 expect(source,'A saved source with a human-route invoice is required; QA never creates one').toBeTruthy();
 return {source:source!,invoice:cases.find(invoice=>invoice.id===source!.linkedCaseId)!};
}
function savedInvoiceNeedsAttention(invoice:CaseDTO|undefined){
 if(!invoice)return false;
 const automatic=invoice.paymentRoute==='REGISTERED_POLICY',record=invoice.automationPayment;
 const settled=automatic
  ?record?.settlementStatus==='SETTLED'&&record.executionStatus==='CONFIRMED'&&!!record.txHash&&record.receipt?.transactionHash===record.txHash&&record.receipt?.invoiceKey===invoice.invoiceKey
  :invoice.settlementStatus==='SETTLED';
 if(settled)return false;
 if(['HELD','NEEDS_INFORMATION'].includes(invoice.workflowStatus))return true;
 return !automatic&&invoice.workflowStatus==='READY_FOR_REVIEW'&&
  !['VALID','CONSUMED','CANCELLATION_PENDING'].includes(invoice.authorizationStatus??'')&&
  !['PREPARING','PREPARED','SUBMITTED','PENDING','UNKNOWN','INCONSISTENT'].includes(invoice.executionStatus);
}

test.beforeEach(async({page,context})=>{
 blockedWrites=[];pageErrors=[];observations={};
 await readOnlyGuard(context);
 page.on('pageerror',error=>pageErrors.push(error.message));
 await authenticate(page);
});
test.afterEach(async({page,browser},info)=>{
 expect.soft(blockedWrites,'No source or financial mutation may even be attempted').toEqual([]);
 expect.soft(pageErrors,'No uncaught browser errors').toEqual([]);
 await info.attach('read-only-observations',{body:JSON.stringify({browser:browser.version(),viewport:page.viewportSize(),blockedWrites,pageErrors,scope:'Saved records only. Demo login/logout are the only allowed writes.',...observations},null,2),contentType:'application/json'});
});

for(const size of sizes)test.describe(`${size.name} ${size.width}×${size.height}`,()=>{
 test.use({viewport:{width:size.width,height:size.height}});

 test('Start opens the unified workspace and intake can be inspected then cancelled',async({page},info)=>{
  await page.goto('/');
  const documentTime=await page.evaluate(()=>performance.timeOrigin);
  await expect(page.getByRole('button',{name:'Start',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).pathname).toBe('/workflow');
  await atWorkspace(page);
  expect(await page.evaluate(()=>performance.timeOrigin),'Start uses in-app navigation').toBe(documentTime);
  await expect(page.getByRole('complementary',{name:'Workspace navigation'})).toHaveCount(0);
  for(const name of ['Agents','Business overview','Connections'])await expect(page.getByRole('link',{name,exact:true})).toHaveCount(0);
  for(const name of ['Reports','Alerts','Settings'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add item',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Add to inbox',exact:true});
  await expect(dialog).toBeVisible();
  for(const name of ['Invoice','Email','Voice','Text'])await expect(dialog.getByRole('radio',{name,exact:true})).toBeVisible();
  const textRadio=dialog.getByRole('radio',{name:'Text',exact:true});
  // The styled radio is visually hidden; users activate its visible label.
  await dialog.locator('.sf-source-choices label:has(input[value="text"])').click();
  await expect(textRadio).toBeChecked();
  await dialog.getByLabel('Source text',{exact:true}).fill('Read-only QA draft. This text is never submitted.');
  await dialog.getByRole('button',{name:'Close add to inbox',exact:true}).click();
  await expect(dialog).toHaveCount(0);await atWorkspace(page);
  expect(await page.evaluate(()=>performance.timeOrigin)).toBe(documentTime);
  observations={enteredWithoutReload:true,draftCancelledWithoutSubmission:true};
  await capture(page,info,'workspace');
 });

 test('source and payment review remain mounted through Reports Alerts and Settings',async({page},info)=>{
  const saved=await records(page),{source,invoice}=linkedHuman(saved.items,saved.cases);
  await page.goto(`/workflow?item=${encodeURIComponent(source.id)}`);
  await selected(page,'item',source.id);
  const review=sourceReview(page),payment=page.getByTestId('case-workspace');
  await expect(review).toBeVisible();await expect(payment).toContainText(invoice.invoiceReference);
  const sourceNode=await review.elementHandle(),paymentNode=await payment.elementHandle();
  expect(sourceNode).not.toBeNull();expect(paymentNode).not.toBeNull();
  const original=review.locator('details').filter({has:page.getByText('Read original source',{exact:true})});
  await original.locator('summary').click();await expect(original).toHaveAttribute('open','');
  await payment.getByRole('button',{name:'Source & checks',exact:true}).click();
  const documentTime=await page.evaluate(()=>performance.timeOrigin);
  for(const name of ['Reports','Alerts','Settings']){
   await page.getByRole('button',{name,exact:true}).click();
   const drawer=page.getByRole('dialog',{name,exact:true});await expect(drawer).toBeVisible();
   expect(await sourceNode!.evaluate(node=>node.isConnected),`${name} keeps the current source mounted`).toBe(true);
   expect(await paymentNode!.evaluate(node=>node.isConnected),`${name} keeps the approval bridge owner mounted`).toBe(true);
   await fit(page);
   await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);
   await selected(page,'item',source.id);
   await expect(original).toHaveAttribute('open','');
   await expect(payment.getByRole('button',{name:'Source & checks',exact:true})).toHaveAttribute('aria-current','page');
  }
  expect(await page.evaluate(()=>performance.timeOrigin)).toBe(documentTime);
  observations={sourceId:source.id,caseId:invoice.id,drawerDomPreservation:true,sourceDisclosurePreserved:true,paymentTabPreserved:true};
  await capture(page,info,'selected-source');
 });

 test('legacy bookmarks and browser history restore the correct selected record',async({page},info)=>{
  const saved=await records(page),first=saved.items[0]!,second=saved.items[1]!,invoice=saved.cases[0]!;
  await page.goto(`/inbox/${encodeURIComponent(first.id)}`);await selected(page,'item',first.id);await expect(sourceReview(page)).toBeVisible();
  await page.goto(`/cases/${encodeURIComponent(invoice.id)}`);await selected(page,'case',invoice.id);await expect(page.getByTestId('case-workspace')).toContainText(invoice.invoiceReference);
  await page.goto('/workflow');await atWorkspace(page);
  await showList(page);
  await page.getByRole('button',{name:'All items',exact:true}).click();
  const documentTime=await page.evaluate(()=>performance.timeOrigin);
  await itemRow(page,first.id).click();await selected(page,'item',first.id);
  await showList(page);
  await itemRow(page,second.id).click();await selected(page,'item',second.id);
  await page.goBack();await selected(page,'item',first.id);
  await page.goForward();await selected(page,'item',second.id);
  expect(await page.evaluate(()=>performance.timeOrigin),'Selecting and restoring records keeps the same document').toBe(documentTime);
  observations={legacyInboxRestored:first.id,legacyCaseRestored:invoice.id,backForwardRestored:[first.id,second.id]};
  await capture(page,info,'history-restored');
 });

 test('filters show saved review and payment records without starting an action',async({page},info)=>{
  const saved=await records(page);
  await page.goto('/workflow');await atWorkspace(page);
  await showList(page);
  for(const name of ['All items','Needs review','Payments'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Needs review',exact:true}).click();
  await expect(page.getByRole('button',{name:'Needs review',exact:true})).toHaveAttribute('aria-pressed','true');
  const linkedAttentionIds=saved.items.filter(item=>!!item.linkedCaseId&&savedInvoiceNeedsAttention(saved.cases.find(invoice=>invoice.id===item.linkedCaseId))).map(item=>item.id);
  const reviewIds=saved.items.filter(item=>['needs_review','quarantined'].includes(item.status)||linkedAttentionIds.includes(item.id)).map(item=>item.id);
  const reviewCaseIds=saved.cases.filter(invoice=>!saved.items.some(item=>item.linkedCaseId===invoice.id)&&savedInvoiceNeedsAttention(invoice)).map(invoice=>invoice.id);
  expect(reviewIds.length,'Copied records must contain a saved source requiring attention').toBeGreaterThan(0);
  for(const item of saved.items)await expect(itemRow(page,item.id)).toHaveCount(reviewIds.includes(item.id)?1:0);
  for(const item of saved.items.filter(item=>item.status==='approved'&&linkedAttentionIds.includes(item.id))){
   const invoice=saved.cases.find(invoice=>invoice.id===item.linkedCaseId)!;
   await expect(itemRow(page,item.id)).toContainText(['HELD','NEEDS_INFORMATION'].includes(invoice.workflowStatus)?'Payment on hold':'Needs payment approval');
  }
  for(const invoice of saved.cases)await expect(caseRow(page,invoice.id)).toHaveCount(reviewCaseIds.includes(invoice.id)?1:0);
  await expect(list(page)).toContainText(`${reviewIds.length+reviewCaseIds.length} need your attention`);
  await page.getByRole('button',{name:'Payments',exact:true}).click();
  await expect(page.getByRole('button',{name:'Payments',exact:true})).toHaveAttribute('aria-pressed','true');
  for(const item of saved.items)await expect(itemRow(page,item.id)).toHaveCount(item.linkedCaseId?1:0);
  const invoice=saved.cases[0]!;
  const linked=saved.items.find(item=>item.linkedCaseId===invoice.id);
  if(linked){await itemRow(page,linked.id).click();await selected(page,'item',linked.id);}
  else{await expect(caseRow(page,invoice.id)).toBeVisible();await caseRow(page,invoice.id).click();await selected(page,'case',invoice.id);}
  await expect(page.getByTestId('case-workspace')).toContainText(invoice.invoiceReference);
  await showList(page);
  await page.getByRole('button',{name:'All items',exact:true}).click();
  await expect(page.getByRole('button',{name:'All items',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(list(page)).toBeVisible();
  observations={reviewIds,linkedAttentionIds,reviewCaseIds,openedExistingInvoice:invoice.id,selectionDidNotExecute:true};
  await capture(page,info,'payment-review');
 });

 test('stage jump buttons reveal the selected source checks payment and reports',async({page},info)=>{
  const saved=await records(page),{source,invoice}=linkedHuman(saved.items,saved.cases);
  await page.goto(`/workflow?item=${encodeURIComponent(source.id)}`);
  await selected(page,'item',source.id);
  const review=sourceReview(page),payment=page.getByTestId('case-workspace');
  await expect(review).toBeVisible();await expect(payment).toContainText(invoice.invoiceReference);
  const sourceNode=await review.elementHandle(),paymentNode=await payment.elementHandle();
  const stages=page.getByRole('navigation',{name:'Process stages',exact:true});
  const documentTime=await page.evaluate(()=>performance.timeOrigin);
  for(const id of ['receive','security','finance','decision','payment','report']){
   const stage=stages.locator(`button[data-stage="${id}"]`);
   await stage.click();await expect(stage).toHaveAttribute('aria-pressed','true');
   const inspector=page.getByTestId('process-inspector');await expect(inspector).toBeVisible();
   await inspector.getByRole('button',{name:id==='report'?'Open reports':id==='payment'?'Go to payment':'Go to review',exact:true}).click();
   if(id==='receive'){
    const original=review.locator('.sf-source-panel');await expect(original).toHaveAttribute('open','');await expect(original.locator('summary')).toBeInViewport();
   }else if(id==='security'||id==='finance'){
    const checks=review.locator('.sf-checks-disclosure');await expect(checks).toHaveAttribute('open','');await expect(checks.locator('summary')).toBeInViewport();
    // Close after security so finance must independently reveal its target.
    if(id==='security')await checks.locator('summary').click();
   }else if(id==='payment')await expect(page.getByRole('region',{name:'Payment review',exact:true}).getByRole('heading',{name:'Payment review',exact:true})).toBeInViewport();
   else if(id==='report'){
    const drawer=page.getByRole('dialog',{name:'Reports',exact:true});await expect(drawer).toBeVisible();
    expect(await sourceNode!.evaluate(node=>node.isConnected)).toBe(true);expect(await paymentNode!.evaluate(node=>node.isConnected)).toBe(true);
    await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);
   }
   await selected(page,'item',source.id);
   await inspector.getByRole('button',{name:'Close stage details',exact:true}).click();
   await expect(inspector).toHaveCount(0);await expect(stage).toBeFocused();
  }
  expect(await page.evaluate(()=>performance.timeOrigin)).toBe(documentTime);
  observations={sourceId:source.id,caseId:invoice.id,stageJumpControls:['receive','security','finance','decision','payment','report'],stageCloseReturnsFocus:true};
  await capture(page,info,'stage-navigation');
 });

 test('keyboard drawers and intake restore focus and search opens on small screens',async({page},info)=>{
  const saved=await records(page),source=saved.items[0]!;
  await page.goto(`/workflow?item=${encodeURIComponent(source.id)}`);await selected(page,'item',source.id);
  for(const name of ['Reports','Alerts','Settings']){
   const opener=page.getByRole('button',{name,exact:true});await opener.focus();await page.keyboard.press('Enter');
   const drawer=page.getByRole('dialog',{name,exact:true});await expect(drawer).toBeVisible();
   expect(await drawer.evaluate(element=>element.contains(document.activeElement)),`${name} moves focus inside the dialog`).toBe(true);
   await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(opener).toBeFocused();
   await selected(page,'item',source.id);
  }
  const add=page.getByRole('button',{name:'Add item',exact:true});await add.focus();await page.keyboard.press('Enter');
  const intake=page.getByRole('dialog',{name:'Add to inbox',exact:true});await expect(intake).toBeVisible();
  await page.keyboard.press('Escape');await expect(intake).toHaveCount(0);await expect(add).toBeFocused();
  await page.keyboard.press('Control+k');
  const search=page.getByRole('searchbox',{name:'Search items',exact:true});await expect(search).toBeVisible();await expect(search).toBeFocused();
  await search.fill('read-only unmatched search phrase');await expect(list(page)).toContainText('Nothing in this view.');await search.clear();
  observations={keyboardDrawerFocusRestored:true,intakeFocusRestored:true,searchShortcutExpandedAndFocused:true,sourceSelectionPreserved:source.id};
  await capture(page,info,'keyboard-navigation');
 });

 test('signing out hides private records even when history restores a selected source',async({page},info)=>{
  const saved=await records(page),{source,invoice}=linkedHuman(saved.items,saved.cases);
  await page.goto(`/workflow?item=${encodeURIComponent(source.id)}`);await selected(page,'item',source.id);
  await expect(sourceReview(page)).toBeVisible();await expect(page.getByTestId('case-workspace')).toContainText(invoice.invoiceReference);
  const documentTime=await page.evaluate(()=>performance.timeOrigin);
  const logout=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/auth/logout'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();expect((await logout).status()).toBe(200);
  // The previous worker cookie has been revoked. Later tests require a fresh demo login.
  cookies=undefined;
  await expect.poll(()=>new URL(page.url()).pathname).toBe('/');
  const session=await readJson<{authenticated:boolean}>(page,'/api/v1/session');expect(session.authenticated).toBe(false);
  for(const path of [`/api/v1/inbox/${encodeURIComponent(source.id)}`,`/api/v1/cases/${encodeURIComponent(invoice.id)}`]){
   const response=await page.request.get(`${origin}${path}`);expect(response.status(),`${path} denies access after sign out`).toBe(401);
  }
  await page.goBack();await selected(page,'item',source.id);await showList(page);
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(sourceReview(page)).toHaveCount(0);await expect(page.getByTestId('case-workspace')).toHaveCount(0);
  await expect(page.locator('[data-testid^="workflow-item-"],[data-testid^="workflow-case-"]')).toHaveCount(0);
  await expect(workspace(page)).not.toContainText(invoice.invoiceReference);
  await expect(workspace(page)).not.toContainText(source.title);
  await page.getByRole('button',{name:'Reports',exact:true}).click();
  const reports=page.getByRole('dialog',{name:'Reports',exact:true});await expect(reports).toContainText('Your reports belong to your workspace');
  await expect(reports.getByRole('region',{name:'Saved reports',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(reports).toHaveCount(0);
  await page.getByRole('button',{name:'Add item',exact:true}).click();
  const login=page.getByRole('dialog',{name:'Welcome to SecureFinance',exact:true});await expect(login).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Add to inbox',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(login).toHaveCount(0);
  expect(await page.evaluate(()=>performance.timeOrigin)).toBe(documentTime);
  observations={signedOut:true,privateApiStatus:401,historyDoesNotRestorePrivateDom:true,authenticationStillRequiredForIntake:true};
  await capture(page,info,'signed-out-history');
 });
});
