// Offline fixture validation only: no database, API, provider or chain connection.
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseAmount} from '@secure-finance/shared';
import {extract} from '../apps/api/src/security/artifacts.js';
import {fixtureIntake} from '../apps/api/src/agents/runner.js';
import {classify, financeDecision, securityReview} from '../apps/api/src/inbox/pipeline.js';
import type {InboxChannel} from '../apps/api/src/inbox/types.js';

type Sample = {file:string; channel:InboxChannel; outcome:string; risks:string[]; fact?:string};
const samples:Sample[] = [
  {file:'invoices/01-matching-invoice.pdf',channel:'invoice',outcome:'approved',risks:[],fact:'MATCH'},
  {file:'invoices/02-amount-discrepancy.pdf',channel:'invoice',outcome:'needs_review',risks:[],fact:'AMOUNT_MISMATCH'},
  {file:'invoices/03-missing-supplier-reference.pdf',channel:'invoice',outcome:'needs_review',risks:[],fact:'MISSING_SUPPLIER_REFERENCE'},
  {file:'invoices/04-unregistered-invoice.pdf',channel:'invoice',outcome:'needs_review',risks:[],fact:'NO_REGISTERED_PAYABLE'},
  {file:'invoices/05-changed-payment-details.pdf',channel:'invoice',outcome:'quarantined',risks:['PAYMENT_DESTINATION_CHANGE'],fact:'MATCH'},
  {file:'emails/01-routine-client-request.eml',channel:'email',outcome:'approved',risks:[]},
  {file:'emails/02-incomplete-invoice-request.eml',channel:'email',outcome:'needs_review',risks:[]},
  {file:'emails/03-urgent-ceo-payment-request.eml',channel:'email',outcome:'quarantined',risks:['CLAIMED_APPROVAL','PAYMENT_DESTINATION_CHANGE']},
  {file:'emails/04-phishing-login-request.eml',channel:'email',outcome:'quarantined',risks:['CREDENTIAL_REQUEST','UNVERIFIED_LINK']},
  {file:'emails/05-embedded-agent-instructions.eml',channel:'email',outcome:'quarantined',risks:['EMBEDDED_INSTRUCTIONS']},
  {file:'voice/01-support-call.txt',channel:'voice',outcome:'approved',risks:[]},
  {file:'voice/02-urgent-transfer.txt',channel:'voice',outcome:'needs_review',risks:[]},
  {file:'voice/03-claimed-executive-approval.txt',channel:'voice',outcome:'quarantined',risks:['CLAIMED_APPROVAL']},
  {file:'voice/04-new-bank-details.txt',channel:'voice',outcome:'quarantined',risks:['PAYMENT_DESTINATION_CHANGE']},
  {file:'voice/05-unclear-voicemail.txt',channel:'voice',outcome:'needs_review',risks:[]},
  {file:'text/01-project-agenda.txt',channel:'text',outcome:'approved',risks:[]},
  {file:'text/02-purchase-contract.txt',channel:'text',outcome:'needs_review',risks:[]},
  {file:'text/03-missing-context.txt',channel:'text',outcome:'needs_review',risks:[]},
  {file:'text/04-workflow-instruction.txt',channel:'text',outcome:'quarantined',risks:['EMBEDDED_INSTRUCTIONS']},
  {file:'text/05-active-markup.txt',channel:'text',outcome:'quarantined',risks:['EXECUTABLE_CONTENT']},
];
const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'fixtures/user-tests');
const registry = JSON.parse(await readFile(resolve(root,'fixtures/trusted-registry.local.json'),'utf8')) as {
  payables:Array<{invoiceReference:string;supplierKey:string;amountAtomic:string}>;
};

for (const [folder, extension] of [['invoices','.pdf'],['emails','.eml'],['voice','.txt'],['voice','.wav'],['text','.txt']]) {
  assert.equal((await readdir(resolve(directory,folder!))).filter(file=>file.endsWith(extension!)).length,5,`${folder}: five ${extension} examples`);
}
const smallFiles=(await readdir(resolve(directory,'small-payments'))).filter(file=>file.endsWith('.txt'));
assert.equal(smallFiles.length,20);
for(const file of smallFiles){
  const {pages}=await extract(await readFile(resolve(directory,'small-payments',file)),'text/plain');
  const facts=fixtureIntake(pages),payable=registry.payables.find(row=>row.invoiceReference===facts.invoiceReference);
  assert.ok(payable,`${file}: trusted payable required`);
  assert.equal(payable.amountAtomic,'10000000');
  assert.equal(parseAmount(facts.amountDecimalCandidate!),payable.amountAtomic);
  assert.equal(facts.supplierReference,payable.supplierKey);
  assert.deepEqual(facts.missingFields,[]);
  assert.equal(facts.claimedRecipient,null);
  assert.equal(file,`${facts.invoiceReference}.txt`);
}
console.log('20/20 clean small-payment sources match distinct 10 DEMO trusted records.');
for (const sample of samples) {
  const bytes = await readFile(resolve(directory,sample.file));
  assert.ok(bytes.length>0 && bytes.length<=10*1024*1024, sample.file);
  const pdf = sample.file.endsWith('.pdf');
  const {pages} = await extract(bytes,pdf?'application/pdf':'text/plain');
  const text = pages.map(page=>page.text).join('\n');
  let clear = false;
  if (pdf) {
    assert.equal(pages.length,1);
    const facts = fixtureIntake(pages);
    const payable = registry.payables.find(row=>row.invoiceReference===facts.invoiceReference);
    const fact = !payable ? 'NO_REGISTERED_PAYABLE' : !facts.supplierReference ? 'MISSING_SUPPLIER_REFERENCE' : parseAmount(facts.amountDecimalCandidate!)!==payable.amountAtomic ? 'AMOUNT_MISMATCH' : 'MATCH';
    assert.equal(fact,sample.fact,`${sample.file}: extracted facts`);
    assert.equal(facts.claimedRecipient,null,'No wallet destination is supplied by these documents');
    if (payable && facts.supplierReference) assert.equal(facts.supplierReference,payable.supplierKey);
    if (fact==='MATCH') assert.equal(facts.missingFields.length,0);
    clear = fact==='MATCH';
  }
  for (const url of text.match(/https?:\/\/[^\s<>"']+/g)??[]) {
    assert.ok(new URL(url).hostname.endsWith('.invalid'),'Every example link must use a reserved .invalid domain');
  }
  const classification = classify(text,sample.channel);
  const security = securityReview(text,classification);
  assert.deepEqual(security.risks.map(risk=>risk.code).sort(),[...sample.risks].sort(),sample.file);
  // Projection assumes fresh, matching, unpaid records. This is not an end-to-end settlement test.
  const projection = pdf && clear ? {id:'offline-fixture',invoiceKey:'offline-only',workflowStatus:'READY_FOR_REVIEW',settlementStatus:'NONE',executionStatus:'NONE',checks:[{passed:true}]} : null;
  const finance = financeDecision(text,classification,projection);
  const outcome = security.risks.length ? 'quarantined' : finance.clear ? 'approved' : 'needs_review';
  assert.equal(outcome,sample.outcome,sample.file);
  console.log(`PASS ${sample.file}: ${outcome}${sample.fact?' / '+sample.fact:''}${sample.risks.length?' / '+sample.risks.join(', '):''}`);
}
console.log('20/20 offline source checks passed. Live processing, audio transcription, authority and settlement were not tested.');
