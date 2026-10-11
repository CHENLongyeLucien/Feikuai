import {test, expect, type Page} from '@playwright/test';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createPublicClient,http,parseEventLogs} from 'viem';
import {demoTokenAbi,automationGuardAbi} from '../../packages/chain/src/index.js';
import {fixtureText} from '../../apps/api/src/db/seed';

test.describe.configure({mode: 'serial'});
const jsonItem = (page: Page) => page.request.get(`/api/v1/inbox/${new URL(page.url()).pathname.split('/')[2]}`).then(response => response.json());
async function enterDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name: 'Explore the demo', exact: true}).click();
  await expect(page.getByRole('button', {name: /Northstar team/})).toBeVisible();
  await expect(page.getByText('Reconnecting to live updates. We are checking for changes in the background.',{exact:true})).toHaveCount(0,{timeout:5000});
}
async function openSource(page: Page, channel: 'Invoice' | 'Email' | 'Voice' | 'Text', method: 'text' | 'file' = 'text') {
  await page.getByRole('button', {name: 'Add to inbox', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', {name: 'Add to inbox', exact: true})).toBeVisible();
  await dialog.getByRole('radio', {name: channel, exact: true}).check();
  if (channel !== 'Text') await dialog.getByRole('button', {name: method === 'file' ? 'Upload file' : channel === 'Voice' ? 'Paste transcript' : 'Paste text', exact: true}).click();
  return dialog;
}
async function submitText(page: Page, channel: 'Email' | 'Voice' | 'Text', title: string, text: string) {
  const dialog = await openSource(page, channel);
  await dialog.getByText('Optional details', {exact: true}).click();
  await dialog.getByLabel('Title', {exact: false}).fill(title);
  await dialog.getByRole('textbox', {name: channel === 'Voice' ? 'Transcript' : channel === 'Email' ? 'Email message' : 'Source text', exact: false}).fill(text);
  await dialog.getByRole('button', {name: 'Add & review'}).click();
  await expect(page).toHaveURL(/\/inbox\/[a-f0-9-]+$/);
  await expect(page.getByRole('heading', {name: title, exact: true})).toBeVisible();
}
async function capture(page: Page, path: string, fullPage = true) {
  const dismiss = page.getByRole('button', {name: 'Dismiss notification', exact: true});
  if (await dismiss.isVisible()) await dismiss.click();
  await page.evaluate(() => window.scrollTo({top: 0, left: 0, behavior: 'instant'}));
  await page.screenshot({path, fullPage, animations: 'disabled'});
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('inbox is the welcoming default, local demo needs no wallet, and navigation fits mobile', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', {level: 1, name: 'Inbox', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Explore the demo', exact: true})).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/0x[a-fA-F0-9]{40}/);
  await noHorizontalOverflow(page);
  mkdirSync('docs/qa', {recursive: true});
  await capture(page, 'docs/qa/redesign-welcome.png');
  await page.setViewportSize({width: 390, height: 844});
  await expect(page.getByRole('navigation', {name: 'Primary navigation', exact: true})).toBeHidden();
  await noHorizontalOverflow(page);
  await capture(page, 'docs/qa/redesign-mobile.png', false);
  await expect(page.getByRole('navigation', {name: 'Mobile navigation', exact: true}).getByRole('link', {name: 'Connections', exact: true})).toHaveCount(0);
  await page.goto('/connections');
  await expect(page.getByRole('heading', {name: /Your sources/})).toBeVisible();
  await expect(page.getByText('Sign in to check', {exact: true}).first()).toBeVisible();
  await expect(page.getByRole('button', {name: /^Connect(?: Gmail| Outlook)?$/})).toHaveCount(0);
  await noHorizontalOverflow(page);
  await page.setViewportSize({width: 1440, height: 1000});
  await enterDemo(page);
  await expect(page.locator('.sf-welcome-state')).toHaveCount(0);
  await expect(page.getByRole('button', {name: /^All items\b/})).toBeVisible();
  expect(errors).toEqual([]);
});

test('a synthetic invoice completes five checks and reports an actual registered-policy settlement', async ({page}, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await enterDemo(page);
  // The everyday demo example uses the 10-DEMO wallet route. Standing-policy
  // coverage explicitly selects an independently registered isolated obligation.
  const manifest=JSON.parse(readFileSync('var/experience-demo/automation.json','utf8'));
  const chain=createPublicClient({transport:http('http://127.0.0.1:18545')});
  expect(await chain.getChainId()).toBe(31337);
  const payables=(await (await page.request.get('/api/v1/payables')).json()).payables;
  const existingCases=(await (await page.request.get('/api/v1/cases')).json()).cases;
  const usedInvoices=new Set(existingCases.map((entry:any)=>entry.invoiceKey));
  let payable:any;
  for(const candidate of payables.filter((entry:any)=>manifest.approvedPayableIds.includes(entry.id)&&!usedInvoices.has(entry.invoiceKey))){
    const obligation=await chain.readContract({address:manifest.vault,abi:automationGuardAbi,functionName:'obligations',args:[candidate.invoiceKey]});
    if(obligation[3]==='0x'+'0'.repeat(64)){payable=candidate;break;}
  }
  if(!payable)throw new Error('No unused registered standing-policy fixture remains in the isolated demo. This test will not reset state or reuse a settled invoice.');
  const dialog=await openSource(page,'Invoice','text');
  await dialog.getByText('Optional details',{exact:true}).click();
  await dialog.getByLabel('Title',{exact:true}).fill('Synthetic invoice ready to check');
  await dialog.getByLabel('Match to a registered invoice',{exact:false}).selectOption(payable.id);
  await dialog.getByRole('textbox',{name:'Source text',exact:true}).fill(fixtureText(payable));
  const before=await chain.readContract({address:manifest.token,abi:demoTokenAbi,functionName:'balanceOf',args:[payable.recipient]});
  await dialog.getByRole('button', {name: 'Add & review'}).click();
  await expect(page).toHaveURL(/\/inbox\/[a-f0-9-]+$/);
  await expect(page.getByText('Workflow review complete', {exact: true})).toBeVisible({timeout: 60000});
  await expect.poll(async () => (await jsonItem(page)).stages.map((stage: {status: string}) => stage.status), {timeout: 60000}).toEqual(['passed','passed','passed','passed','passed']);
  await expect.poll(async () => (await jsonItem(page)).payment?.settlementStatus, {timeout: 60000}).toBe('SETTLED');
  const actual = await jsonItem(page);
  expect(actual.payment.txHash).toMatch(/^0x[\da-f]{64}$/);
  expect(actual.payment.requiresWalletSignature).toBe(false);
  const receipt=await chain.getTransactionReceipt({hash:actual.payment.txHash});
  expect(receipt.status).toBe('success');expect(receipt.to?.toLowerCase()).toBe(manifest.vault.toLowerCase());
  const events=parseEventLogs({abi:automationGuardAbi,logs:receipt.logs,eventName:'AutomationPaymentExecuted'});
  expect(events).toHaveLength(1);expect(events[0]!.args.invoiceKey).toBe(payable.invoiceKey);expect(events[0]!.args.amountAtomic).toBe(BigInt(payable.amountAtomic));
  const after=await chain.readContract({address:manifest.token,abi:demoTokenAbi,functionName:'balanceOf',args:[payable.recipient]});
  expect(after-before).toBe(BigInt(payable.amountAtomic));
  writeFileSync('docs/qa/automatic-payment-result.json',JSON.stringify({observedAt:new Date().toISOString(),environment:'isolated local chain 31337',invoiceReference:payable.invoiceReference,transactionHash:receipt.transactionHash,receiptStatus:receipt.status,blockNumber:receipt.blockNumber.toString(),recipientDeltaAtomic:(after-before).toString(),authorityModel:actual.payment.authorityModel,walletSignatureRequired:false},null,2)+'\n');
  await expect(page.getByText('A payment receipt has been verified.', {exact: true})).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/0x[a-fA-F0-9]{40}/);
  await page.getByText('Review checks', {exact: true}).click();
  for (const name of ['Classification','Security review','Client & finance','Approval policy','Independent final audit']) {
    await page.locator('.sf-pipeline').getByRole('button', {name: new RegExp(name.replace('&', '\\&'))}).click();
    await expect(page.locator('.sf-stage-detail').getByRole('heading', {name, exact: true})).toBeVisible();
  }
  await capture(page, 'docs/qa/redesign-invoice-detail.png');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Download PDF report'}).click();
  const report = await downloaded;
  const reportPath = testInfo.outputPath('verified-invoice-report.pdf'); await report.saveAs(reportPath);
  expect(report.suggestedFilename()).toMatch(/\.pdf$/);
  expect(readFileSync(reportPath).subarray(0,5).toString()).toBe('%PDF-');
  const artifact = await page.request.get(`/api/v1/inbox/${actual.id}/incident-report`).then(response => response.json());
  expect(artifact.schemaVersion).toBe('secure-finance.incident-report.v1');
  expect(artifact.item.payment.txHash).toBe(actual.payment.txHash);
  await page.getByRole('button', {name: 'Back to inbox'}).click();
  await expect(page.getByTestId(`inbox-row-${actual.id}`)).toContainText('Payment verified');
  expect(errors).toEqual([]);
});

test('phishing is quarantined with evidence, no approval button, no fetched links and a durable alert', async ({page}, testInfo) => {
  await enterDemo(page);
  const external: string[] = []; page.on('request', req => {if (new URL(req.url()).hostname.endsWith('.invalid')) external.push(req.url());});
  await page.getByRole('button', {name: 'Demo walkthrough', exact: false}).click();
  await page.locator('.sf-example-grid').getByRole('button', {name: /Suspicious payment update/}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Add & review'}).click();
  await expect(page.getByText('Security hold', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Approve workflow', exact: true})).toHaveCount(0);
  await expect(page.getByRole('heading', {name: 'Sensitive credential request', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Payment destination change requested', exact: true})).toBeVisible();
  await expect(page.getByRole('link', {name: /verify-payments/})).toHaveCount(0);
  const item = await jsonItem(page); expect(item.status).toBe('quarantined'); expect(item.linkedCaseId).toBeNull(); expect(item.payment).toBeNull();
  expect(item.source.senderAuthentication).toBe('not_verified');
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', {name: 'Download PDF report'}).click();
  const report = await downloadEvent; const saved = testInfo.outputPath('phishing-incident.pdf'); await report.saveAs(saved);
  expect(report.suggestedFilename()).toMatch(/\.pdf$/);
  expect(readFileSync(saved).subarray(0,5).toString()).toBe('%PDF-');
  expect(item.risks.length).toBeGreaterThan(1);
  await capture(page, 'docs/qa/redesign-security-review.png');
  await page.getByRole('link', {name: 'Alerts', exact: true}).click();
  const notice = page.locator('.sf-activity-list article').filter({hasText: 'Security review required'}).first();
  await expect(notice).toBeVisible(); await notice.getByRole('button', {name: 'Mark read'}).click();
  await expect(notice.getByRole('button', {name: 'Mark read'})).toHaveCount(0);
  await page.reload(); await expect(page.locator('.sf-activity-list article').filter({hasText: 'Security review required'}).first().getByRole('button', {name: 'Mark read'})).toHaveCount(0);
  expect(external).toEqual([]);
});

test('voice financial requests need human context and record requests for information without sending messages', async ({page}) => {
  await enterDemo(page);
  await submitText(page, 'Voice', 'Recorded supplier question', 'Please review a supplier payment request and confirm the agreed amount before anyone proceeds.');
  await expect(page.getByText('Your review is needed', {exact: true})).toBeVisible();
  await expect.poll(async () => (await jsonItem(page)).status).toBe('needs_review');
  await page.getByRole('button', {name: 'Request information', exact: true}).click();
  await expect(page.getByRole('dialog').getByText('Record what is missing. This does not send a message to the sender.', {exact: true})).toBeVisible();
  await page.getByRole('dialog').getByRole('textbox', {name: 'Reason for your decision'}).fill('Please provide the supplier invoice and confirm its amount using our trusted records.');
  await page.getByRole('dialog').getByRole('button', {name: 'Record decision'}).click();
  await page.getByText('Review history', {exact: true}).click();
  await expect(page.getByText('Please provide the supplier invoice and confirm its amount using our trusted records.', {exact: true})).toBeVisible();
  const item = await jsonItem(page); expect(item.source.transcription.mode).toBe('manual'); expect(item.reviewHistory.at(-1).decision).toBe('request_information'); expect(item.payment).toBeNull();
  await page.getByRole('button', {name: 'Back to inbox'}).click();
  await page.getByRole('button', {name: /^Needs review\b/}).click();
  await expect(page.locator('.sf-inbox-row').filter({hasText:'Recorded supplier question'}).first()).toBeVisible();
  await expect(page.locator('.sf-inbox-row').filter({hasText: 'Synthetic invoice ready to check'})).toHaveCount(0);
  await page.getByRole('textbox', {name: 'Search your workspace'}).fill('Recorded supplier');
  await expect.poll(async () => {const texts = await page.locator('.sf-inbox-row').allTextContents();return texts.length > 0 && texts.every(text => text.includes('Recorded supplier'));}).toBe(true);
  await page.getByRole('textbox', {name: 'Search your workspace'}).fill('');
  await page.getByRole('button', {name: /^All items\b/}).click();
  await page.getByRole('combobox', {name: 'Filter by source'}).selectOption('voice');
  await expect.poll(async () => {const rows = await page.locator('.sf-inbox-row').count();return rows > 0 && await page.locator('.sf-inbox-row .sf-channel-voice').count() === rows;}).toBe(true);
});

test('email files import safely, modal close resets input and a failed attachment can be corrected', async ({page}) => {
  await enterDemo(page);
  let dialog = await openSource(page, 'Email', 'file');
  const eml = {name:'client-request.eml',mimeType:'message/rfc822',buffer:Buffer.from('From: client@example.invalid\nSubject: Quarterly planning\n\nCould you schedule a meeting next week to review our milestones?')};
  await dialog.locator('input[type=file]').setInputFiles(eml);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  dialog = await openSource(page, 'Email', 'file');
  await expect(dialog.locator('input[type=file]')).toHaveValue('');
  await dialog.locator('input[type=file]').setInputFiles({name:'unsupported.bin',mimeType:'application/octet-stream',buffer:Buffer.from('not supported')});
  await dialog.getByRole('button', {name: 'Add & review'}).click(); await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.locator('input[type=file]').setInputFiles(eml);
  await dialog.getByRole('button', {name: 'Add & review'}).click();
  await expect(page.getByRole('heading', {name: 'client-request.eml', exact: true})).toBeVisible();
  await expect.poll(async () => (await jsonItem(page)).status).toBe('approved');
  const actual = await jsonItem(page); expect(actual.source.filename).toBe(eml.name); expect(actual.source.senderAuthentication).toBe('not_verified'); expect(actual.source.extraction).toBe('rfc822-untrusted-utf8-text-v1');
  await page.getByText('Read original source', {exact: true}).click(); await expect(page.locator('.sf-source-text')).toContainText('client@example.invalid');
  await page.getByRole('button', {name: 'Back to inbox'}).click();
  dialog = await openSource(page, 'Email', 'file');
  await dialog.locator('input[type=file]').setInputFiles({name:'plain-request.txt',mimeType:'text/plain',buffer:Buffer.from('Please schedule a customer support meeting next Tuesday.')});
  await dialog.getByRole('button', {name: 'Add & review'}).click();
  await expect(page.getByRole('heading', {name:'plain-request.txt',exact:true})).toBeVisible();
  await expect.poll(async () => (await jsonItem(page)).status).toBe('approved');
});

test('populated inbox, review and connections stay readable on desktop and mobile without wallet references', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await enterDemo(page);
  await expect(page.locator('.sf-inbox-row').first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/0x[a-fA-F0-9]{40}/);
  await noHorizontalOverflow(page); await capture(page,'docs/qa/redesign-inbox.png');
  await page.getByRole('button', {name:/^Needs review\b/}).click();
  await expect(page.getByRole('button', {name:/^Needs review\b/})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sf-inbox-row').filter({hasText:'Synthetic invoice ready to check'})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844}); await expect(page.getByRole('navigation', {name: 'Primary navigation', exact: true})).toBeHidden(); await noHorizontalOverflow(page);
  await page.locator('.sf-inbox-row').filter({hasText:'Recorded supplier question'}).first().click();
  await page.getByText('Review checks', {exact: true}).click();
  await expect(page.locator('.sf-pipeline-step')).toHaveCount(5); await expect(page.locator('.sf-pipeline-step').first()).toBeVisible(); await noHorizontalOverflow(page);
  await capture(page,'docs/qa/redesign-mobile-review.png',false);
  await page.goto('/connections');
  await noHorizontalOverflow(page); await expect(page.locator('.sf-provider-status').getByText('Not configured',{exact:true})).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('the optional operations campus keeps real geometry and clear overlays inside the new shell', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await enterDemo(page);
  await page.getByRole('link', {name: 'Operations campus', exact: false}).click();
  await expect(page).toHaveURL(/\/operations$/);
  const canvas = page.getByTestId('campus-canvas').locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1200);
  for (const label of await page.locator('.pm-node').all()) {
    const box = await label.boundingBox(); expect(box?.width).toBeLessThan(260); expect(box?.height).toBeLessThan(65);
  }
  const diagnostics = JSON.parse(await canvas.getAttribute('data-camera') || '{}');
  expect(diagnostics.drawCalls).toBeGreaterThan(50);
  for (const viewport of [{width:1440,height:900},{width:1280,height:800}]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(400); await noHorizontalOverflow(page);
    await expect(page.getByRole('navigation',{name:'Process stages'}).getByRole('button')).toHaveCount(6);
    const controls=await page.getByRole('button',{name:'Fit map',exact:true}).boundingBox();
    expect(controls!.x).toBeGreaterThanOrEqual(0);
    await capture(page,`docs/qa/redesign-operations-${viewport.width}.png`,false);
  }
  await page.getByRole('button', {name: 'Pause scene motion', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Resume scene motion'})).toBeVisible();
  await page.getByRole('link', {name: 'Inbox', exact: true}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Inbox', exact: true})).toBeVisible();
  expect(errors).toEqual([]);
});
