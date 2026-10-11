import {test, expect, type BrowserContext, type Page, type TestInfo, type Cookie} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {InboxItem} from '../../apps/web/src/features/inbox/types';

const origin = process.env.SF_DESIGN_WEB_URL || 'http://127.0.0.1:5283';
const sizes = [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844},{name:'narrow',width:320,height:740}];
let writes:string[] = [], errors:string[] = [];
let session:Cookie[]|undefined;

async function guard(context:BrowserContext) {
  await context.route('**/api/v1/**', async route => {
    const request=route.request(), path=new URL(request.url()).pathname;
    if (!['GET','HEAD','OPTIONS'].includes(request.method()) && !(request.method()==='POST' && path==='/api/v1/auth/demo')) {
      writes.push(`${request.method()} ${path}`); await route.abort('blockedbyclient'); return;
    }
    await route.continue();
  });
}
async function login(page:Page, path='/') {
  if(session)await page.context().addCookies(session);
  else{const response=await page.request.post(`${origin}/api/v1/auth/demo`, {headers:{Origin:new URL(origin).origin}});
  expect(response.status(), 'Only the copied local demo login may create a session').toBe(200);session=await page.context().cookies();}
  await page.goto(path);
  await expect(page.getByRole('button',{name:/Northstar team/})).toBeVisible();
}
async function fit(page:Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow').toBe(true);
  const dialog=page.getByRole('dialog');
  if(await dialog.count()) expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'Dialog content should fit').toBe(true);
}
async function capture(page:Page, info:TestInfo, label:string) {
  const directory=join('var/simplified-inbox-qa',info.project.name);mkdirSync(directory,{recursive:true});
  await page.screenshot({path:join(directory,`${info.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${label}.png`),fullPage:await page.getByRole('dialog').count()===0,animations:'disabled'});
}
function quarantinedItem():InboxItem {
  return {
    id:'qa-ui-security',version:1,channel:'email',title:'Synthetic request for security review',sender:'Sender <sender@example.invalid>',
    preview:'Please enter your password to continue.',text:'Please enter your password at https://login.example.invalid/check.\nSynthetic UI test only.',
    status:'quarantined',classification:{category:'client_request',label:'Client request',confidence:'rule_match',summary:'A request needs review.'},
    stages:[['classification','Classification','passed'],['security','Security review','held'],['client_finance','Client & finance','passed'],['policy','Approval policy','held'],['final_audit','Independent final audit','held']].map(([id,name,status])=>({id:id!,name:name!,status:status!,summary:id==='security'?'The source requests a password.':'Synthetic saved check for read-only layout testing.',evidence:[{kind:'source',label:'Recorded source',quote:'Please enter your password.'}],mode:'deterministic_rules'})),
    risks:[{code:'CREDENTIAL_REQUEST',severity:'high',title:'Sensitive credential request',detail:'The message requests a password. Confirm the request through a trusted contact.',evidence:[{kind:'source',label:'Credential request',quote:'Please enter your password.'}]}],
    links:[{url:'https://login.example.invalid/check',status:'unverified',reason:'The link was not opened.'}],notifications:[],nextActions:[],linkedCaseId:null,payableId:null,
    approval:{scope:'WORKFLOW_ONLY',decision:'hold',reason:'A credential request was found. Human review is required.'},payment:null,
    source:{sha256:'synthetic-source-hash',textHash:'synthetic-text-hash',filename:'synthetic-review.eml',mimeType:'message/rfc822',extraction:'utf8',senderAuthentication:'unverified',transcription:{mode:'not_applicable',model:null}},
    reviewHistory:[{decision:'request_information',note:'Please confirm the source through a trusted channel.',reviewer:'synthetic-reviewer',createdAt:'2026-10-11T10:00:00Z'}],createdAt:'2026-10-11T09:00:00Z',
  };
}

test.beforeEach(async({page,context})=>{writes=[];errors=[];await guard(context);page.on('pageerror',error=>errors.push(error.message));});
test.afterEach(()=>{expect(writes,'No intake, review, notification or financial writes').toEqual([]);expect(errors,'No uncaught browser errors').toEqual([]);});

for (const size of sizes) {
  test(`single add flow preserves all source modes ${size.name}`, async({page},info)=>{
    await page.setViewportSize(size);await login(page);
    await expect(page.getByRole('heading',{level:1,name:'Inbox',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Add to inbox',exact:true})).toHaveCount(1);
    await expect(page.getByRole('searchbox',{name:'Search inbox',exact:true})).toHaveCount(0);
    await expect(page.getByRole('combobox',{name:'Filter by source',exact:true})).toBeVisible();
    await fit(page);await capture(page,info,'home');
    await page.getByRole('button',{name:'Add to inbox',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog.getByRole('heading',{name:'Add to inbox',exact:true})).toBeVisible();
    await expect(dialog.getByRole('radio',{name:'Invoice',exact:true})).toBeChecked();
    await expect(dialog.getByRole('button',{name:'Upload file',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(dialog.getByRole('button',{name:'Add & review',exact:true})).toBeDisabled();
    await capture(page,info,'invoice-upload');
    for(const source of ['Invoice','Email','Voice','Text']) {
      await dialog.getByRole('radio',{name:source,exact:true}).check();
      if(source!=='Text') await dialog.getByRole('button',{name:/^Paste (text|transcript)$/}).click();
      const textarea=dialog.getByRole('textbox',{name:source==='Email'?'Email message':source==='Voice'?'Transcript':'Source text',exact:true});
      await textarea.fill(`Synthetic ${source.toLowerCase()} request for unsubmitted interface testing.`);
      await expect(dialog.getByRole('button',{name:'Add & review',exact:true})).toBeEnabled();
      await fit(page);
      if(source!=='Text') {
        await dialog.getByRole('button',{name:'Upload file',exact:true}).click();
        const upload=dialog.locator('input[type=file]');
        await upload.setInputFiles({name:source==='Email'?'example.eml':source==='Voice'?'example.wav':'example.txt',mimeType:source==='Email'?'message/rfc822':source==='Voice'?'audio/wav':'text/plain',buffer:Buffer.from('Synthetic UI file; never submitted.')});
        await expect(dialog.getByRole('button',{name:'Add & review',exact:true})).toBeEnabled();
        await dialog.getByRole('button',{name:'Remove file',exact:true}).click();
        await expect(dialog.getByRole('button',{name:'Add & review',exact:true})).toBeDisabled();
        await upload.setInputFiles({name:'example.txt',mimeType:'text/plain',buffer:Buffer.from('Same-file retry; never submitted.')});
        await expect(dialog.getByRole('button',{name:'Add & review',exact:true})).toBeEnabled();
      }
    }
    await dialog.getByText('Optional details',{exact:true}).click();
    await dialog.getByRole('textbox',{name:'Title',exact:true}).fill('Synthetic title');
    await dialog.getByRole('textbox',{name:'Sender or speaker',exact:true}).fill('sender@example.invalid');
    await fit(page);await capture(page,info,'optional-details');
    await dialog.getByRole('button',{name:'Close add to inbox',exact:true}).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button',{name:'Add to inbox',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'Add & review',exact:true})).toBeDisabled();
    await dialog.getByRole('button',{name:'Close add to inbox',exact:true}).click();
  });

  test(`security hold and expandable detail remain clear ${size.name}`,async({page},info)=>{
    await page.setViewportSize(size);
    await page.route('**/api/v1/inbox/qa-ui-security',route=>route.fulfill({json:quarantinedItem()}));
    await page.route('**/api/v1/inbox/qa-ui-security/report.pdf',route=>route.fulfill({status:503,json:{error:'Synthetic report failure for read-only interface testing.'}}));
    await login(page,'/inbox/qa-ui-security');
    await expect(page.getByRole('heading',{name:'Security findings',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Sensitive credential request',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Approve workflow',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Request information',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Reject request',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Security review Passed',exact:true})).toHaveCount(0);
    await fit(page);await capture(page,info,'security-hold');
    await page.locator('.sf-checks-disclosure>summary').click();
    await page.getByRole('button',{name:/Independent final audit Needs attention/}).click();
    await expect(page.getByRole('heading',{name:'Independent final audit',exact:true})).toBeVisible();
    await page.getByText('Read original source',{exact:true}).click();
    await expect(page.locator('.sf-source-text')).toContainText('Synthetic UI test only.');
    await page.getByText('Review history',{exact:true}).click();
    await expect(page.getByText('Please confirm the source through a trusted channel.',{exact:true})).toBeVisible();
    await fit(page);await capture(page,info,'expanded-detail');
    await page.getByRole('button',{name:'Request information',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog.getByRole('button',{name:'Record decision',exact:true})).toBeDisabled();
    await dialog.getByRole('textbox',{name:'Reason for your decision'}).fill('Check the sender independently.');
    await expect(dialog.getByRole('button',{name:'Record decision',exact:true})).toBeEnabled();
    await expect(dialog).toContainText('This does not send a message to the sender.');
    await fit(page);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Download PDF report',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('We couldn’t download your report.');
    await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();await fit(page);
  });

  test(`inbox load error offers retry ${size.name}`,async({page},info)=>{
    await page.setViewportSize(size);
    await page.route('**/api/v1/inbox?*',route=>route.fulfill({status:503,json:{error:'Synthetic unavailable source for read-only interface testing.'}}));
    await login(page);
    await expect(page.getByRole('alert')).toContainText("We couldn't load your workspace");
    await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
    await fit(page);await capture(page,info,'error');
  });
}
