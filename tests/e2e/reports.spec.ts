import {test,expect,type Cookie,type Page} from '@playwright/test';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

// Reuse saved records. Only local demo sign-in is allowed to write; no source,
// payment, approval, cancellation or notification is submitted by these tests.
let session:Cookie[]|undefined;
async function login(page:Page){
 if(session)await page.context().addCookies(session);
 else{const origin=process.env.SF_DESIGN_WEB_URL||'http://localhost:5183';const response=await page.request.post(`${origin}/api/v1/auth/demo`,{headers:{Origin:origin}});expect(response.status()).toBe(200);session=await page.context().cookies();}
 await page.goto('/evidence');await expect(page.getByRole('heading',{name:'History & reports',exact:true})).toBeVisible();
}
for(const size of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
 test(`PDF reports download and recover from failure on ${size.name}`,async({page,context},info)=>{
  await page.setViewportSize(size);const errors:string[]=[],writes:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/api/v1/**',async route=>{const req=route.request();if(!['GET','HEAD','OPTIONS'].includes(req.method())&&new URL(req.url()).pathname!=='/api/v1/auth/demo'){writes.push(req.method());return route.abort();}return route.continue();});
  await login(page);
  const library=page.getByRole('region',{name:'Saved reports'}),advanced=page.locator('.reports-advanced');
  await expect(library.locator('.report-row').first()).toBeVisible();
  await expect(advanced).not.toHaveAttribute('open','');
  expect(await page.locator('body').innerText()).not.toMatch(/\bJSON\b|\bZIP\b/);
  await page.getByRole('button',{name:'Inbox reviews',exact:true}).click();
  const sourceRow=library.locator('.report-row').first();await expect(sourceRow).toBeVisible();
  const sourceTitle=await sourceRow.locator('h3').innerText();
  await page.getByLabel('Find a report',{exact:true}).fill(sourceTitle);await expect(sourceRow).toContainText(sourceTitle);
  const sourcePath=await sourceRow.getByRole('link',{name:'Read review'}).getAttribute('href');
  expect(sourcePath).toMatch(/^\/inbox\//);
  let failOnce=true;
  await page.route(`**/api/v1${sourcePath}/report.pdf`,async route=>{if(failOnce){failOnce=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'TEMPORARY',message:'Please retry this report.'}})});}else await route.continue();});
  await sourceRow.getByRole('button',{name:'Download PDF',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('We couldn’t download this report.');
  const retryDownload=page.waitForEvent('download');await page.getByRole('alert').getByRole('button',{name:'Try again',exact:true}).click();
  const sourcePdf=await retryDownload;expect(sourcePdf.suggestedFilename()).toMatch(/\.pdf$/);const sourceFile=info.outputPath('inbox-review.pdf');await sourcePdf.saveAs(sourceFile);expect(readFileSync(sourceFile).subarray(0,5).toString()).toBe('%PDF-');
  await expect(page.getByRole('status').filter({hasText:'Your PDF download has started.'})).toBeVisible();
  await sourceRow.getByRole('link',{name:'Read review'}).click();await expect(page.getByRole('heading',{level:1,name:sourceTitle,exact:true})).toBeVisible();
  const detailDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF report',exact:true}).click();expect((await detailDownload).suggestedFilename()).toMatch(/\.pdf$/);
  await page.goto('/evidence');await page.getByRole('button',{name:'Payments',exact:true}).click();
  const paymentRow=library.locator('.report-row').first();await expect(paymentRow).toBeVisible();
  const paymentDownload=page.waitForEvent('download');await paymentRow.getByRole('button',{name:'Download PDF',exact:true}).click();const paymentPdf=await paymentDownload;expect(paymentPdf.suggestedFilename()).toMatch(/\.pdf$/);const paymentFile=info.outputPath('payment-review.pdf');await paymentPdf.saveAs(paymentFile);expect(readFileSync(paymentFile).subarray(0,5).toString()).toBe('%PDF-');
  await page.getByLabel('Find a report',{exact:true}).fill('no-matching-report-xyz');await expect(page.getByText('No matching payment reports',{exact:true})).toBeVisible();await page.getByLabel('Find a report',{exact:true}).fill('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync('var/pdf-report-qa/screenshots',{recursive:true});await page.screenshot({path:join('var/pdf-report-qa/screenshots',`${info.project.name}-${size.name}.png`),fullPage:false});
  await advanced.locator('summary').first().click();const input=page.getByLabel('Choose an evidence ZIP or approval request JSON',{exact:true});await expect(input).toBeVisible();
  await input.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{ invalid')});await expect(page.getByRole('heading',{name:'Integrity checks failed',exact:true})).toBeVisible();await expect(input).toHaveValue('');
  await advanced.locator('summary').first().click();await expect(input).not.toBeVisible();
  expect(writes).toEqual([]);expect(errors).toEqual([]);
 });
}
