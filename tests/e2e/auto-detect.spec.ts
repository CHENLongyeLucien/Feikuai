import {test,expect} from '@playwright/test';

// Runs against the isolated demo (pnpm demo:start). One drop zone, automatic type detection, and the redesigned dashboard.
test.beforeEach(async({page})=>{
 await page.goto('/workflow');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Explore the demo',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
});
test('adding items needs no type choice; each file is detected and labelled',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Add item'}).first().click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('heading',{name:'Add to inbox',exact:true})).toBeVisible();
 await expect(dialog.getByRole('radio')).toHaveCount(0);
 await dialog.locator('input[type=file]').setInputFiles([
  {name:'agenda.eml',mimeType:'message/rfc822',buffer:Buffer.from('From: a@example.invalid\r\nSubject: Agenda\r\n\r\nCould you please schedule a meeting next week?')},
  {name:'call.wav',mimeType:'audio/wav',buffer:Buffer.from('RIFF')},
  {name:'invoice.txt',mimeType:'text/plain',buffer:Buffer.from('Invoice reference: NS-TEST10-0999\nAmount: 10.00 DEMO')},
 ]);
 const files=dialog.getByRole('list',{name:'Files to add'});
 await expect(files.getByText('Email',{exact:true})).toBeVisible();
 await expect(files.getByText('Voice',{exact:true})).toBeVisible();
 await expect(files.getByText('Invoice',{exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Add 3 items',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Remove call.wav',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Add 2 items',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Paste text instead',exact:true}).click();
 await dialog.getByRole('textbox',{name:/Paste a message/}).fill('Could you please schedule a support meeting next Tuesday?');
 await expect(dialog.getByText('Detected: Text',{exact:false})).toBeVisible();
 await dialog.getByRole('button',{name:'Add & review',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'detected as text'})).toBeVisible();
 expect(errors).toEqual([]);
});
test('dashboard shows outcomes, pipeline, threats and payments',async({page})=>{
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Security & payments overview',exact:true})).toBeVisible();
 for(const name of ['Decision outcomes','Payment pipeline','Threats detected','Verified payments','Where requests come from','Recent activity'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Threats',exact:true}).click();
 await expect(page.getByRole('img',{name:/Threats quarantined over 30 days/})).toBeVisible();
});
test('a multi-document upload is followed live through the workflow',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const run=Date.now().toString(36);
 await page.getByRole('button',{name:'Add item'}).first().click();
 const dialog=page.getByRole('dialog');
 await dialog.locator('input[type=file]').setInputFiles([
  {name:`meeting-${run}.eml`,mimeType:'message/rfc822',buffer:Buffer.from(`From: Dana <dana@example.invalid>\r\nSubject: Planning ${run}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nCould you please schedule a meeting with our platform team next Wednesday to review the project milestones?\r\n`)},
  {name:`cfo-${run}.txt`,mimeType:'text/plain',buffer:Buffer.from(`Keep this confidential (${run}). I am boarding a flight, so please wire the Atlas payment today and do not call me.`)},
  {name:`renewal-${run}.txt`,mimeType:'text/plain',buffer:Buffer.from(`Please approve the contract renewal ${run} for the managed database plan before the end of the month.`)},
  {name:`invoice-${run}.txt`,mimeType:'text/plain',buffer:Buffer.from(`ATLAS CLOUD SERVICES - INVOICE\nInvoice reference: UNKNOWN-${run}\nAmount: 10.00 DEMO`)},
 ]);
 await dialog.getByRole('button',{name:'Add 4 items',exact:true}).click();
 await expect(dialog).toBeHidden();
 const tracker=page.getByTestId('batch-tracker');
 await expect(tracker).toBeVisible();
 await expect(tracker.getByRole('listitem')).toHaveCount(4);
 await expect(tracker.getByRole('heading',{name:'All 4 documents checked'})).toBeVisible({timeout:30000});
 await expect(tracker.getByRole('button',{name:/Quarantined/})).toHaveCount(1);
 await expect(tracker.getByRole('button',{name:/Cleared/})).toHaveCount(1);
 await expect(tracker.getByRole('button',{name:/Needs review/})).toHaveCount(2);
 await expect(tracker.getByRole('progressbar')).toHaveAttribute('aria-valuenow','100');
 await tracker.screenshot({path:'var/auto-detect-artifacts/batch-tracker.png'});
 await tracker.getByRole('button',{name:/Quarantined/}).click();
 await expect(page.getByText('FOLLOWING THIS ITEM')).toBeVisible();
 await expect(tracker).toBeVisible();
 await page.reload();await expect(page.getByTestId('batch-tracker')).toBeVisible();
 await page.getByRole('button',{name:'Dismiss batch tracker'}).click();await expect(page.getByTestId('batch-tracker')).toHaveCount(0);
 expect(errors).toEqual([]);
});
