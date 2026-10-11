import {expect,test} from '@playwright/test';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {CaseDTO} from '../../apps/web/src/app/types';
import type {InboxItem} from '../../apps/web/src/features/inbox/types';

// Every API request is intercepted; these checks cannot mutate saved invoices or pay tokens.
const pdf=readFileSync('fixtures/user-tests/invoices/01-matching-invoice.pdf');
function savedItem():InboxItem{return {
 id:'paid-invoice',version:1,channel:'invoice',title:'Matching invoice',preview:'Invoice NS-TEST10-0001. 10 DEMO.',text:'Invoice reference: NS-TEST10-0001\nAmount: 10 DEMO',status:'needs_review',
 classification:{category:'invoice',label:'Invoice',confidence:'rule_match',summary:'Invoice source.'},
 stages:[{id:'client_finance',name:'Client & finance',status:'held',summary:'This invoice has already been paid.',evidence:[],mode:'deterministic_rules'}],risks:[],links:[],notifications:[],nextActions:[],linkedCaseId:'paid-case',payableId:'paid-payable',
 approval:{scope:'WORKFLOW_ONLY',decision:'hold',reason:'The existing finance check found a duplicate.'},
 reviewBlock:{code:'INVOICE_ALREADY_SETTLED',title:'Already paid',message:'This invoice has already been paid. A second payment is blocked. Use a different unpaid invoice for your next test.'},
 payment:{authorizationStatus:'CONSUMED',executionStatus:'CONFIRMED',settlementStatus:'SETTLED',requiresWalletSignature:true},
 source:{sha256:'synthetic-source',textHash:'synthetic-text',filename:'01-matching-invoice.pdf',mimeType:'application/pdf',extraction:'pdfjs',senderAuthentication:'unverified',transcription:{mode:'not_applicable',model:null}},reviewHistory:[],createdAt:'2026-10-11T10:00:00Z'
};}
function linkedCase():CaseDTO {
 const paid=item.payment?.settlementStatus==='SETTLED';
 return {id:'paid-case',version:1,invoiceKey:'synthetic-invoice-key',invoiceReference:'NS-TEST10-0001',supplierName:'Synthetic supplier',amountAtomic:'10000000',token:'DEMO',workflowStatus:paid?'CLOSED':'READY_FOR_REVIEW',authorizationStatus:paid?'CONSUMED':null,executionStatus:paid?'CONFIRMED':'NONE',settlementStatus:paid?'SETTLED':'UNSETTLED',mode:'fixture',lastEventId:'1',allowedActions:[],latestProposal:null,authorization:null,latestExecution:null,settlement:paid?{txHash:'0x'+'a'.repeat(64),digest:'0x'+'b'.repeat(64),amountAtomic:'10000000',recipient:'0x'+'1'.repeat(40)}:null,document:{id:'synthetic-source',filename:'01-matching-invoice.pdf',mimeType:'application/pdf',version:'1',text:item.text,pages:[]},analysis:{intake:null,finance:null,runs:[]},checks:[],attempts:[],evidenceCoverage:null};
}
let item:InboxItem,errors:string[],writes:string[],downloadMode:'pdf'|'exhausted'|'invalid'|'empty',downloads:number,signedIn:boolean;
test.beforeEach(async({context,page})=>{
 item=savedItem();errors=[];writes=[];downloads=0;downloadMode='pdf';signedIn=true;
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/api/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.replace('/api/v1','');
  if(!['GET','HEAD','OPTIONS'].includes(req.method())){writes.push(`${req.method()} ${path}`);return route.abort();}
  if(path==='/session')return route.fulfill({json:signedIn?{authenticated:true,user:{roles:['operator','reviewer'],tenantId:'synthetic-ui'},csrfToken:'synthetic-csrf'}:{authenticated:false}});
  if(path==='/config')return route.fulfill({json:{appEnv:'fuji',agentMode:'fixture',dataEnvironment:'synthetic',chainId:'43113',deployment:null,rpcAvailable:false,buildId:'read-only-paid-invoice-ui'}});
  if(path==='/bootstrap'||path==='/cases')return route.fulfill({json:{cases:[linkedCase()],cursor:'0'}});
  if(path==='/cases/paid-case')return route.fulfill({json:linkedCase()});
  if(path==='/payables')return route.fulfill({json:{payables:[]}});
  if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': synthetic read-only fixture\n\n'});
  if(path==='/inbox')return route.fulfill({json:{items:[item],total:1}});
  if(path==='/inbox/paid-invoice')return route.fulfill({json:item});
  if(path==='/inbox/notifications')return route.fulfill({json:{notifications:[]}});
  if(path==='/inbox/test-invoice.pdf'){
   downloads++;
   if(downloadMode==='exhausted')return route.fulfill({status:409,json:{code:'NO_UNUSED_TEST_INVOICE',message:'No unused registered 10 DEMO test invoice is available.'}});
   if(downloadMode==='invalid')return route.fulfill({json:{message:'This is not a PDF.'}});
   return route.fulfill({contentType:'application/pdf',headers:{'content-disposition':'attachment; filename="test-invoice-NS-TEST10-0005.pdf"'},body:downloadMode==='empty'?Buffer.alloc(0):pdf});
  }
  return route.fulfill({status:404,json:{message:'No synthetic fixture for this read-only request.'}});
 });
});
test.afterEach(()=>{expect(errors).toEqual([]);expect(writes,'No intake, review or payment writes').toEqual([]);});
for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844},{name:'narrow',width:320,height:740}])test(`settled duplicate gives a clear next step ${viewport.name}`,async({page},info)=>{
 await page.setViewportSize(viewport);await page.goto('/workflow?item=paid-invoice');
 const detail=page.locator('.sf-detail-page');
 await expect(detail.locator('.sf-decision-banner')).toContainText('Already paid');
 await expect(detail.locator('.sf-decision-banner')).toContainText('Use a different unpaid invoice');
 await expect(detail.getByRole('button',{name:'Approve workflow',exact:true})).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'Request information',exact:true})).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'Open payment review',exact:true})).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'View payment receipt',exact:true})).toBeVisible();
 await expect(detail.getByRole('button',{name:'Download PDF report',exact:true})).toBeVisible();
 await detail.getByRole('button',{name:'Dismiss duplicate',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Dismiss this duplicate?',exact:true})).toBeVisible();await expect(dialog).toContainText('The original payment and both records stay in your history.');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 if(viewport.width<=760){const authority=page.getByTestId('authority-summary'),copy=authority.locator('.wf-authority-error p'),retry=authority.getByRole('button',{name:'Retry authority check',exact:true});await expect(copy).toBeVisible();const textBox=await copy.boundingBox(),buttonBox=await retry.boundingBox();expect(textBox!.width,'Authority error text retains readable width').toBeGreaterThan(130);expect(buttonBox!.y,'Retry stacks below authority error text').toBeGreaterThanOrEqual(textBox!.y+textBox!.height);}
 await detail.locator('.sf-decision-banner').scrollIntoViewIfNeeded();
 const screenshots=join('var/paid-invoice-qa',info.project.name);mkdirSync(screenshots,{recursive:true});await page.screenshot({path:join(screenshots,`already-paid-${viewport.name}.png`),fullPage:true});
 const payment=page.getByRole('region',{name:'Payment review',exact:true}),receipt=payment.getByRole('heading',{name:'Verified onchain settlement',exact:true});
 await expect(receipt).toBeVisible();await expect(receipt).not.toBeInViewport();
 await detail.getByRole('button',{name:'View payment receipt',exact:true}).click();
 await expect(receipt).toBeInViewport();await expect(payment.getByText('10 DEMO · receipt verified',{exact:true})).toBeVisible();
 await expect(payment.getByRole('button',{name:'Execution & evidence',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page).toHaveURL(/item=paid-invoice/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('a settled invoice never hides a security hold',async({page})=>{
 item.status='quarantined';item.risks=[{code:'CREDENTIAL_REQUEST',severity:'high',title:'Sensitive credential request',detail:'Verify the sender through a trusted contact.'}];
 item.approval!.reason='A credential request was found.';
 await page.goto('/workflow?item=paid-invoice');const detail=page.locator('.sf-detail-page');
 await expect(detail.locator('.sf-decision-banner')).toContainText('Security hold');await expect(detail.locator('.sf-decision-banner')).toContainText('already paid');
 await expect(detail.getByRole('heading',{name:'Sensitive credential request',exact:true})).toBeVisible();
 await expect(detail.getByRole('button',{name:'Approve workflow',exact:true})).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'Request information',exact:true})).toBeVisible();
 await expect(detail.getByRole('button',{name:'Reject request',exact:true})).toBeVisible();
});
test('an unpaid review retains its review actions',async({page})=>{
 delete item.reviewBlock;item.payment!.settlementStatus='UNSETTLED';item.payment!.executionStatus='NONE';item.payment!.authorizationStatus=null;
 await page.goto('/workflow?item=paid-invoice');const detail=page.locator('.sf-detail-page');
 await expect(detail.getByRole('button',{name:'Approve workflow',exact:true})).toBeVisible();await expect(detail.getByRole('button',{name:'Request information',exact:true})).toBeVisible();
 await expect(detail.getByRole('button',{name:'Open payment review',exact:true})).toBeVisible();await expect(detail.getByText('Already paid',{exact:true})).toHaveCount(0);
});
test('the next invoice downloads with its own registered reference and does not submit it',async({page},info)=>{
 await page.goto('/workflow?new=invoice');const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:'Add & review',exact:true})).toBeDisabled();
 const screenshots=join('var/paid-invoice-qa',info.project.name);mkdirSync(screenshots,{recursive:true});await page.screenshot({path:join(screenshots,'next-test-invoice-dialog.png')});
 const waiting=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download next 10 DEMO test invoice',exact:true}).click();const download=await waiting;
 expect(download.suggestedFilename()).toBe('test-invoice-NS-TEST10-0005.pdf');expect(readFileSync((await download.path())!)).toEqual(pdf);
 await expect(dialog.getByRole('status')).toContainText('Upload the downloaded PDF to review it.');expect(downloads).toBe(1);
 await expect(dialog.getByRole('button',{name:'Add & review',exact:true})).toBeDisabled();
 await dialog.getByRole('radio',{name:'Email',exact:true}).check();await expect(dialog.getByRole('button',{name:'Download next 10 DEMO test invoice',exact:true})).toHaveCount(0);
});
for(const mode of ['exhausted','invalid','empty'] as const)test(`test-invoice download rejects ${mode} response and permits retry`,async({page})=>{
 downloadMode=mode;let saved=0;page.on('download',()=>saved++);await page.goto('/workflow?new=invoice');const dialog=page.getByRole('dialog'),button=dialog.getByRole('button',{name:'Download next 10 DEMO test invoice',exact:true});await button.click();
 await expect(dialog.getByRole('alert')).toContainText(mode==='exhausted'?'No unused registered 10 DEMO test invoice':'The server did not return a readable PDF invoice');expect(saved).toBe(0);await expect(button).toBeEnabled();
 downloadMode='pdf';const waiting=page.waitForEvent('download');await button.click();await waiting;await expect(dialog.getByRole('alert')).toHaveCount(0);expect(downloads).toBe(2);
});
test('signed-out users cannot access the invoice download action',async({page})=>{
 signedIn=false;await page.goto('/workflow?new=invoice');await expect(page.getByText('Sign in to add your invoice.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Download next 10 DEMO test invoice',exact:true})).toHaveCount(0);expect(downloads).toBe(0);
});
