import {expect,test,type Page,type TestInfo} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {AgentGuardProjection} from '../../apps/api/src/agentguard/types';
import type {CaseDTO} from '../../apps/web/src/app/types';
import type {InboxItem} from '../../apps/web/src/features/inbox/types';

// Synthetic display fixtures only. No intake, review, payment or incident record
// is created. Even the PDF POST is fulfilled in the browser, never sent to the API.
const timestamp='2026-10-11T10:00:00.000Z';
const invoice:CaseDTO={id:'qa-case',version:1,invoiceKey:'qa-invoice',invoiceReference:'QA-10',supplierName:'Synthetic supplier',amountAtomic:'10000000',token:'DEMO',workflowStatus:'READY_FOR_REVIEW',authorizationStatus:null,executionStatus:'NONE',settlementStatus:'UNSETTLED',mode:'fixture',lastEventId:'1',allowedActions:[],latestProposal:null,authorization:null,latestExecution:null,settlement:null,document:{id:'qa-source',filename:'qa.txt',mimeType:'text/plain',version:'1',text:'Synthetic read-only source.',pages:[]},analysis:{intake:null,finance:null,runs:[]},checks:[],attempts:[],evidenceCoverage:null};
const source:InboxItem={id:'qa-inbox',version:1,channel:'email',title:'Synthetic security finding',sender:'sender@example.invalid',preview:'Read-only UI fixture.',text:'Synthetic source. No real customer data.',status:'quarantined',classification:{category:'client_request',label:'Client request',confidence:'rule_match',summary:'Synthetic source review.'},stages:[{id:'security',name:'Security review',status:'held',summary:'A source instruction cannot grant authority.',evidence:[],mode:'deterministic_rules'}],risks:[{code:'QA_INSTRUCTION',severity:'high',title:'Untrusted payment instruction',detail:'A source instruction cannot grant authority.'}],links:[],notifications:[],nextActions:[],linkedCaseId:null,payableId:null,approval:{scope:'WORKFLOW_ONLY',decision:'held',reason:'Check the source independently.'},payment:null,source:{sha256:'synthetic-hash',textHash:'synthetic-text-hash',filename:'qa.eml',mimeType:'message/rfc822',extraction:'utf8',senderAuthentication:'unverified',transcription:{mode:'not_applicable',model:null}},reviewHistory:[],createdAt:timestamp};
function projection(incident=false):AgentGuardProjection{return {schemaVersion:'secure-finance.agentguard-projection.v1',generatedAt:timestamp,subject:{kind:incident?'inbox':'case',id:incident?source.id:invoice.id,title:'Synthetic read-only authority',version:1},authority:{model:incident?'NONE':'HUMAN_WALLET',enforcement:incident?'NO_PAYMENT_WORKFLOW':'CONTRACT_PAYMENT_TERMS',status:incident?'NOT_APPLICABLE':'AWAITING_SIGNATURE',summary:incident?'This source does not grant payment permission.':'An exact wallet authorization is required before payment.',delegation:'NOT_IMPLEMENTED',dailyBudget:null,frequencyLimit:null,globalCircuit:'NOT_IMPLEMENTED',agentCanAuthorize:false},provenance:{sourceKind:incident?'EXTERNAL_MESSAGE':'EXTERNAL_DOCUMENT',channel:incident?'email':'invoice',sourceHash:'synthetic-hash',textHash:'synthetic-text-hash',senderAuthenticated:false,originAttested:false,transport:'NOT_RECORDED',summary:'The original sender and instruction origin have not been authenticated.',stages:[]},decision:{status:incident?'HELD':'READY_FOR_REVIEW',hold:incident?'Security findings need independent review.':null,checksCurrent:incident?true:null,checks:incident?[{code:'QA_INSTRUCTION',passed:false,severity:'HIGH',summary:'The source cannot approve a payment.'}]:[],workflowOnly:true},priority:{level:incident?'HIGH':'UNASSESSED',score:null,reasons:[],policyVersion:'agentguard-priority.v1',purpose:'REVIEW_ORDER_ONLY'},payment:{status:incident?'NOT_APPLICABLE':'NOT_RECORDED',executionStatus:'NONE',observedAt:null,blockNumber:null,summary:incident?'No payment workflow is linked.':'No verified settlement is recorded.'},evidence:{scope:'APPLICATION_REPORTED',anchoring:'NOT_RECORDED',summary:'The PDF summarizes application records; no incident anchor is recorded.'},incident:{relevant:incident,reason:'A recorded security finding is available for reviewer assessment.',draftEligible:incident},limitations:[]};}
let errors:string[]=[],writes:string[]=[],pdfBodies:Array<Record<string,unknown>>=[];
test.beforeEach(async({page,context})=>{
 errors=[];writes=[];pdfBodies=[];page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/api/v1/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.replace('/api/v1','');
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes.push(`${request.method()} ${path}`);return route.abort();}
  if(path==='/session')return route.fulfill({json:{authenticated:true,user:{address:'qa-reviewer',roles:['reviewer'],tenantId:'qa'},csrfToken:'synthetic-ui-csrf'}});
  if(path==='/config')return route.fulfill({json:{appEnv:'local-demo',agentMode:'fixture',dataEnvironment:'synthetic',chainId:'31337',deployment:null,rpcAvailable:false,buildId:'read-only-ui-test'}});
  if(path==='/cases')return route.fulfill({json:{cases:[invoice]}});
  if(path==='/cases/qa-case')return route.fulfill({json:invoice});
  if(path==='/bootstrap')return route.fulfill({json:{cases:[invoice],cursor:'0'}});
  if(path==='/events')return route.fulfill({status:200,contentType:'text/event-stream',body:': read-only fixture\n\n'});
  if(path==='/payables')return route.fulfill({json:{payables:[]}});
  if(path==='/inbox')return route.fulfill({json:{items:[source],total:1}});
  if(path==='/inbox/qa-inbox')return route.fulfill({json:source});
  if(path==='/inbox/notifications')return route.fulfill({json:{notifications:[]}});
  if(path==='/agentguard/cases/qa-case')return route.fulfill({json:projection()});
  if(path==='/agentguard/inbox/qa-inbox')return route.fulfill({json:projection(true)});
  return route.fulfill({status:404,json:{message:'No synthetic fixture for this read-only request.'}});
 });
});
test.afterEach(async({},info)=>{expect.soft(errors).toEqual([]);expect.soft(writes,'No request may mutate the API').toEqual([]);await info.attach('scope',{body:JSON.stringify({scope:'Intercepted synthetic UI fixtures only; no authority, financial or incident mutations.',errors,writes,pdfRequests:pdfBodies.length}),contentType:'application/json'});});
async function open(page:Page,incident=false){await page.goto(`/workflow?${incident?'item=qa-inbox':'case=qa-case'}`);await expect(page.getByTestId('authority-summary')).toBeVisible();}
async function fit(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
async function capture(page:Page,info:TestInfo,name:string){await fit(page);const dir=join('var/authority-qa',info.project.name);mkdirSync(dir,{recursive:true});await page.getByTestId('authority-summary').screenshot({path:join(dir,`${name}.png`)});}

for(const size of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844},{name:'narrow',width:320,height:740}])test(`recorded authority stays readable ${size.name}`,async({page},info)=>{
 await page.setViewportSize(size);await open(page);const summary=page.getByTestId('authority-summary');
 await expect(summary.getByText('Human wallet approval',{exact:true})).toBeVisible();await expect(summary.getByText('No verified payment recorded',{exact:true})).toBeVisible();
 await expect(summary.getByText('Sender and instruction origin are not verified.',{exact:true})).toBeVisible();await expect(summary.getByTestId('incident-draft')).toHaveCount(0);
 await summary.getByText('Policy and evidence details',{exact:true}).click();await expect(summary.getByText('The proposed AgentGuard extension is not deployed.',{exact:false})).toBeVisible();await expect(summary.getByText('Not available in the current vault',{exact:true})).toBeVisible();
 await capture(page,info,`${size.name}-authority-ui-fixture`);
});

test('authority is shown only for an authenticated selection and an unavailable read has retry',async({page})=>{
 await page.goto('/workflow');await expect(page.getByTestId('workflow-workspace')).toBeVisible();await expect(page.getByTestId('authority-summary')).toHaveCount(0);
 await page.route('**/api/v1/agentguard/cases/qa-case',route=>route.fulfill({status:503,json:{message:'Synthetic unavailable authority.'}}));await open(page);
 await expect(page.getByTestId('authority-summary').getByRole('alert')).toContainText('No permission or payment outcome has been inferred.');
 await page.unroute('**/api/v1/agentguard/cases/qa-case');await page.getByRole('button',{name:'Retry authority check',exact:true}).click();await expect(page.getByTestId('authority-summary').getByText('Human wallet approval',{exact:true})).toBeVisible();
 await page.route('**/api/v1/session',route=>route.fulfill({json:{authenticated:false}}));await page.reload();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();await expect(page.getByTestId('authority-summary')).toHaveCount(0);
});

test('incident PDF begins with unknown impact and does not file or change controls',async({page},info)=>{
 await page.route('**/api/v1/agentguard/inbox/qa-inbox/incident-draft',route=>{pdfBodies.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:'application/pdf',body:'%PDF-1.4\n% Synthetic UI download fixture, not an actual incident report.\n%%EOF'});});
 await page.setViewportSize({width:390,height:844});await open(page,true);const draft=page.getByTestId('incident-draft');await draft.getByText('Prepare an incident draft',{exact:true}).click();
 await expect(draft.getByText('Draft only · not filed · does not change payment controls',{exact:true})).toBeVisible();await expect(draft.getByLabel('Critical services affected',{exact:true})).not.toBeVisible();
 const download=page.waitForEvent('download');await draft.getByRole('button',{name:'Download incident draft PDF',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
 expect(pdfBodies).toHaveLength(1);const body=pdfBodies[0]!;expect(body.expectedVersion).toBe(1);expect(Object.values(body.impact as Record<string,unknown>).every(value=>value===null)).toBe(true);expect(Object.values(body.timeline as Record<string,unknown>).every(value=>value===null)).toBe(true);
 await expect(draft.getByRole('status')).toContainText('It has not been filed');await capture(page,info,'mobile-incident-draft-ui-fixture');
});

test('optional impact is explicit, dates validate, and PDF errors can retry',async({page})=>{
 let succeed=false;await page.route('**/api/v1/agentguard/inbox/qa-inbox/incident-draft',route=>{pdfBodies.push(route.request().postDataJSON());return succeed?route.fulfill({contentType:'application/pdf',body:'%PDF-1.4\n%%EOF'}):route.fulfill({status:503,json:{message:'Synthetic draft service unavailable. Try again.'}});});
 await open(page,true);const draft=page.getByTestId('incident-draft');await draft.getByText('Prepare an incident draft',{exact:true}).click();await draft.getByText('Impact assessment',{exact:true}).click();
 await draft.getByLabel('Critical services affected',{exact:true}).selectOption('yes');await draft.getByLabel('Affected clients',{exact:true}).fill('0');await draft.getByLabel('EU geographical impact',{exact:true}).selectOption('countries');await draft.getByLabel('EU member states meaningfully affected',{exact:true}).selectOption(['FR','DE']);
 await draft.getByText('Reporting dates',{exact:true}).click();await draft.getByLabel('Actual incident awareness',{exact:true}).fill('2026-10-11T12:00');await draft.getByLabel('Formal major-incident classification',{exact:true}).fill('2026-10-11T11:00');
 await draft.getByRole('button',{name:'Download incident draft PDF',exact:true}).click();await expect(draft.getByRole('alert')).toContainText('Check the reporting dates.');expect(pdfBodies).toHaveLength(0);
 await draft.getByLabel('Formal major-incident classification',{exact:true}).fill('2026-10-11T13:00');await draft.getByRole('button',{name:'Download incident draft PDF',exact:true}).click();await expect(draft.getByRole('alert')).toContainText('Synthetic draft service unavailable.');
 expect(pdfBodies[0]?.impact).toMatchObject({criticalServicesAffected:true,affectedClients:0,clientPercent:null,affectedMemberStates:expect.arrayContaining(['DE','FR'])});await expect(draft.getByLabel('Affected clients',{exact:true})).toHaveValue('0');
 succeed=true;const download=page.waitForEvent('download');await draft.getByRole('button',{name:'Download incident draft PDF',exact:true}).click();await download;expect(pdfBodies).toHaveLength(2);await expect(draft.getByRole('status')).toContainText('Your PDF draft is ready.');await fit(page);
});

test('a changed source cannot silently reuse impact notes on a newer version',async({page})=>{
 let version=1;
 await page.route('**/api/v1/agentguard/inbox/qa-inbox',route=>{const data=projection(true);data.subject.version=version;return route.fulfill({json:data});});
 await page.route('**/api/v1/agentguard/inbox/qa-inbox/incident-draft',route=>{const body=route.request().postDataJSON();pdfBodies.push(body);if(body.expectedVersion===1){version=2;return route.fulfill({status:409,json:{code:'VERSION_CONFLICT',message:'The source changed; refresh its recorded findings before generating a draft.'}});}return route.fulfill({contentType:'application/pdf',body:'%PDF-1.4\n%%EOF'});});
 await open(page,true);const draft=page.getByTestId('incident-draft');await draft.getByText('Prepare an incident draft',{exact:true}).click();await draft.getByText('Reviewer notes',{exact:true}).click();await draft.getByLabel('Context for the compliance reviewer',{exact:true}).fill('Notes for the earlier source only.');
 await draft.getByRole('button',{name:'Download incident draft PDF',exact:true}).click();await expect(draft.getByRole('button',{name:'Download incident draft PDF',exact:true})).toBeDisabled();expect(pdfBodies[0]?.expectedVersion).toBe(1);await expect(draft.getByLabel('Context for the compliance reviewer',{exact:true})).toHaveValue('Notes for the earlier source only.');
 await draft.getByRole('button',{name:'Refresh findings and clear draft',exact:true}).click();await expect(draft.getByLabel('Context for the compliance reviewer',{exact:true})).toHaveValue('');await expect(draft.getByRole('button',{name:'Download incident draft PDF',exact:true})).toBeEnabled();
 const download=page.waitForEvent('download');await draft.getByRole('button',{name:'Download incident draft PDF',exact:true}).click();await download;expect(pdfBodies[1]).toMatchObject({expectedVersion:2,notes:''});
});
