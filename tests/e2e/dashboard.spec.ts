import {expect,test,type Page,type TestInfo} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {DashboardDTO} from '@secure-finance/shared';
import type {InboxItem} from '../../apps/web/src/features/inbox/types';

// Every API response is intercepted. All fixtures are synthetic and every
// mutation is blocked: these checks cannot create records or move test tokens.
const timestamp='2026-10-11T10:00:00.000Z';
const source:InboxItem={id:'dashboard-source',version:1,channel:'text',title:'Synthetic client request',sender:'client@example.invalid',preview:'Read-only dashboard UI fixture.',text:'Synthetic client request. No real customer data.',status:'approved',classification:{category:'client_request',label:'Client request',confidence:'rule_match',summary:'Synthetic source review.'},stages:[],risks:[],links:[],notifications:[],nextActions:[],linkedCaseId:null,payableId:null,approval:{scope:'WORKFLOW_ONLY',decision:'approved',reason:'Synthetic review fixture.'},payment:null,source:{sha256:'synthetic-hash',textHash:'synthetic-text-hash',filename:null,mimeType:'text/plain',extraction:'utf8',senderAuthentication:'unverified',transcription:{mode:'not_applicable',model:null}},reviewHistory:[],createdAt:timestamp};
function fixture(days:7|30|90=30):DashboardDTO{
 const end=new Date(timestamp),start=new Date(end);start.setUTCDate(end.getUTCDate()-days+1);start.setUTCHours(0,0,0,0);
 const daily=Array.from({length:days},(_,index)=>({date:new Date(start.getTime()+index*86400000).toISOString().slice(0,10),inboxCount:0,workflowApprovedCount:0,verifiedPaidCount:0,verifiedPaidAtomic:'0',threatCount:0,reviewCount:0}));
 daily[daily.length-3]={...daily[daily.length-3]!,inboxCount:3,workflowApprovedCount:1,verifiedPaidCount:1,verifiedPaidAtomic:'5000001'};
 daily[daily.length-1]={...daily[daily.length-1]!,inboxCount:2,workflowApprovedCount:2,verifiedPaidCount:1,verifiedPaidAtomic:'5000000'};
 return {schemaVersion:'finance-dashboard.v1',generatedAt:timestamp,window:{days,from:start.toISOString(),to:timestamp,timeZone:'UTC'},workspace:{name:'Synthetic QA workspace',environment:'local',dataEnvironment:'synthetic',accountRoles:['reviewer']},token:{symbol:'DEMO',decimals:6},totals:{registeredPayablesCount:3,registeredPayablesAtomic:'9007199254740993123456',verifiedPaidCount:2,verifiedPaidAtomic:'10000001',unpaidRegisteredCount:1,unpaidRegisteredAtomic:'9007199254740983123455',inboxCount:5,needsReviewCount:1,securityHoldCount:1,unresolvedPaymentCount:1},daily,outcomes:{approved:2,needsReview:1,quarantined:1,rejected:0,processing:1},threats:[{code:'CLAIMED_APPROVAL',title:'Approval is claimed inside the message',count:1}],pipeline:[{id:'receive',label:'Received',count:5,held:0},{id:'understand',label:'Understood',count:5,held:0},{id:'security',label:'Security cleared',count:4,held:1},{id:'finance',label:'Finance cleared',count:2,held:1},{id:'authorize',label:'Ready to sign',count:2,held:0},{id:'signed',label:'Signed',count:2,held:0},{id:'execute',label:'Executed',count:2,held:1},{id:'paid',label:'Paid (verified)',count:2,held:0}],payments:[],decisionTime:{medianMs:640,p95Ms:960,measured:4},channels:[{channel:'invoice',count:2},{channel:'email',count:1},{channel:'voice',count:1},{channel:'text',count:1}],suppliers:[{supplierKey:'synthetic-supplier',name:'Synthetic supplier',payablesCount:3,registeredAtomic:'9007199254740993123456',verifiedPaidCount:2,verifiedPaidAtomic:'10000001'}],recentActivity:[{id:'source:dashboard-source',kind:'source',title:source.title,status:'approved',occurredAt:timestamp,itemId:source.id}],coverage:{financialsAvailable:true,basis:'Synthetic read-only UI fixtures, not an observation of the workspace.',excludedUnverifiedCount:1,undatedSettlementsCount:0,limitations:['Amounts are synthetic test-token figures. No personal wealth or revenue is represented.']}};
}
let errors:string[]=[],writes:string[]=[],windows:number[]=[],dashboardCalls=0,signedIn=true,fail=false,empty=false,unavailable=false;
test.beforeEach(async({page,context})=>{
 errors=[];writes=[];windows=[];dashboardCalls=0;signedIn=true;fail=false;empty=false;unavailable=false;
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/api/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.replace('/api/v1','');
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes.push(`${request.method()} ${path}`);return route.abort();}
  if(path==='/session')return route.fulfill({json:signedIn?{authenticated:true,user:{address:'synthetic-reviewer',roles:['reviewer'],tenantId:'synthetic-qa'},csrfToken:'synthetic-csrf'}:{authenticated:false}});
  if(path==='/config')return route.fulfill({json:{appEnv:'local',agentMode:'fixture',dataEnvironment:'synthetic',chainId:'31337',deployment:null,rpcAvailable:false,buildId:'read-only-dashboard-ui'}});
  if(path==='/cases')return route.fulfill({json:{cases:[]}});
  if(path==='/bootstrap')return route.fulfill({json:{cases:[],cursor:'0'}});
  if(path==='/events')return route.fulfill({status:200,contentType:'text/event-stream',body:': synthetic read-only fixture\n\n'});
  if(path==='/payables')return route.fulfill({json:{payables:[]}});
  if(path==='/inbox')return route.fulfill({json:{items:[],total:0}});
  if(path==='/inbox/dashboard-source')return route.fulfill({json:source});
  if(path==='/inbox/notifications')return route.fulfill({json:{notifications:[]}});
  if(path==='/dashboard'){
   dashboardCalls++;const days=Number(url.searchParams.get('days')||30) as 7|30|90;windows.push(days);
   if(fail)return route.fulfill({status:503,json:{message:'Synthetic read-only service unavailable.'}});
   const data=fixture(days);
   if(empty){for(const key of Object.keys(data.totals) as Array<keyof DashboardDTO['totals']>){if(key.endsWith('Atomic'))(data.totals as unknown as Record<string,unknown>)[key]='0';else(data.totals as unknown as Record<string,unknown>)[key]=0;}data.daily=data.daily.map(day=>({...day,inboxCount:0,workflowApprovedCount:0,verifiedPaidCount:0,verifiedPaidAtomic:'0'}));data.channels=[];data.suppliers=[];data.recentActivity=[];data.coverage.excludedUnverifiedCount=0;}
   data.coverage.financialsAvailable=!unavailable;
   return route.fulfill({json:data});
  }
  return route.fulfill({status:404,json:{message:'No synthetic fixture for this read-only request.'}});
 });
});
test.afterEach(async({},info)=>{expect.soft(errors).toEqual([]);expect.soft(writes,'Dashboard performs no financial or source mutations').toEqual([]);await info.attach('scope',{body:JSON.stringify({scope:'Intercepted synthetic Dashboard UI fixtures only.',errors,writes,dashboardCalls,windows}),contentType:'application/json'});});
async function open(page:Page){await page.goto('/workflow');await page.getByRole('button',{name:'Dashboard',exact:true}).click();await expect(page.getByTestId('dashboard-panel')).toBeVisible();}
async function fit(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);const panel=page.getByTestId('workflow-drawer');if(await panel.count())expect(await panel.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);}
async function capture(page:Page,info:TestInfo,name:string){await fit(page);const dir=join('var/dashboard-qa',info.project.name);mkdirSync(dir,{recursive:true});await page.screenshot({path:join(dir,`${name}-synthetic-ui.png`)});}

for(const size of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844},{name:'narrow',width:320,height:740}])test(`Dashboard remains readable and money stays exact ${size.name}`,async({page},info)=>{
 await page.setViewportSize(size);await open(page);const dashboard=page.getByTestId('dashboard-panel');
 await expect(dashboard.getByRole('heading',{name:'Security & payments overview',exact:true})).toBeVisible();
 const registered=dashboard.locator('section').filter({has:page.getByText('Registered payables',{exact:true})});await expect(registered.getByText('9,007,199,254,740,993.123456',{exact:false})).toBeVisible();
 const paid=dashboard.locator('section').filter({has:page.getByText('Verified payments',{exact:true})});await expect(paid.getByText('10.000001',{exact:false})).toBeVisible();
 await capture(page,info,`${size.name}-finances`);
 await dashboard.getByText('View daily figures',{exact:true}).click();await expect(dashboard.getByRole('table')).toBeVisible();await expect(dashboard.getByRole('cell',{name:'5.000001',exact:true})).toBeVisible();await fit(page);
 await dashboard.getByText('About these figures',{exact:true}).click();await expect(dashboard.getByText('Synthetic demonstration records',{exact:true})).toBeVisible();await expect(dashboard.getByText('Only verified settlements count as paid.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Close panel',exact:true}).click();await expect(page.getByRole('button',{name:'Dashboard',exact:true})).toBeFocused();await fit(page);
});

test('time windows, chart measures and exact daily figures are accessible',async({page},info)=>{
 await open(page);const dashboard=page.getByTestId('dashboard-panel');
 await expect(dashboard.getByRole('img',{name:'Verified payments over 30 days',exact:false})).toBeVisible();
 await dashboard.getByRole('button',{name:'7 days',exact:true}).click();await expect(dashboard.getByRole('img',{name:'Verified payments over 7 days',exact:false})).toBeVisible();expect(windows).toContain(7);
 await dashboard.getByRole('button',{name:'Arrivals',exact:true}).click();await expect(dashboard.getByRole('img',{name:'Items received over 7 days',exact:false})).toBeVisible();
 await dashboard.getByRole('button',{name:'Approvals',exact:true}).click();await expect(dashboard.getByRole('img',{name:'Workflow approvals over 7 days',exact:false})).toBeVisible();await expect(dashboard.getByText('A workflow approval is a completed review, not a payment.',{exact:false})).toBeVisible();
 await dashboard.getByRole('button',{name:'90 days',exact:true}).click();await expect(dashboard.getByRole('button',{name:'90 days',exact:true})).toHaveAttribute('aria-pressed','true');expect(windows).toContain(90);
 await dashboard.getByText('View daily figures',{exact:true}).click();await expect(dashboard.getByRole('table').getByRole('row')).toHaveCount(91);
 await dashboard.getByRole('button',{name:'Refresh Dashboard',exact:true}).click();await expect.poll(()=>windows.filter(value=>value===90).length).toBeGreaterThanOrEqual(2);
 await capture(page,info,'activity-and-daily-figures');
});

test('empty records and unavailable finances remain distinct',async({page})=>{
 empty=true;await open(page);const dashboard=page.getByTestId('dashboard-panel');await expect(dashboard.getByText('No recorded activity yet.',{exact:true})).toBeVisible();await expect(dashboard.getByText('No verified payments recorded in this period.',{exact:true})).toBeVisible();await expect(dashboard.getByText('No registered suppliers yet.',{exact:true})).toBeVisible();
 unavailable=true;await dashboard.getByRole('button',{name:'Refresh Dashboard',exact:true}).click();await expect(dashboard.getByRole('status')).toContainText('Financial data is unavailable');await expect(dashboard.locator('.df-totals').getByText('Unavailable',{exact:true})).toHaveCount(3);await expect(dashboard.getByRole('img')).toHaveCount(0);
 await dashboard.getByRole('button',{name:'Arrivals',exact:true}).click();await expect(dashboard.getByRole('img',{name:'Items received over 30 days',exact:false})).toBeVisible();await expect(dashboard.getByText('No items received recorded in this period.',{exact:true})).toBeVisible();
});

test('failed loads retry without inventing totals and failed refreshes retain a labeled snapshot',async({page})=>{
 fail=true;await open(page);const dashboard=page.getByTestId('dashboard-panel');await expect(dashboard.getByRole('heading',{name:'Dashboard couldn’t load.',exact:true})).toBeVisible();await expect(dashboard.getByText('No balances or payment outcomes have been inferred.',{exact:true})).toBeVisible();
 fail=false;await dashboard.getByRole('button',{name:'Retry Dashboard',exact:true}).click();await expect(dashboard.getByRole('heading',{name:'Security & payments overview',exact:true})).toBeVisible();
 fail=true;await dashboard.getByRole('button',{name:'Refresh Dashboard',exact:true}).click();await expect(dashboard.getByRole('alert')).toContainText('Showing the last recorded snapshot.');await expect(dashboard.getByText('10.000001',{exact:false}).first()).toBeVisible();
 fail=false;await dashboard.getByRole('button',{name:'Try again',exact:true}).click();await expect(dashboard.getByRole('alert')).toHaveCount(0);
});

test('initial loading shows progress without placeholder money',async({page})=>{
 let release:()=>void=()=>{};const ready=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/dashboard?**',async route=>{await ready;await route.fulfill({json:fixture()});});
 try{await open(page);await expect(page.getByTestId('dashboard-panel')).toHaveAttribute('role','status');await expect(page.getByRole('heading',{name:'Loading your Dashboard…',exact:true})).toBeVisible();await expect(page.getByText('Registered payables',{exact:true})).toHaveCount(0);}finally{release();}
 await expect(page.getByRole('heading',{name:'Security & payments overview',exact:true})).toBeVisible();
});

test('signed out Dashboard never requests tenant figures',async({page})=>{
 signedIn=false;await open(page);const dashboard=page.getByTestId('dashboard-panel');await expect(dashboard.getByRole('button',{name:'Sign in to view Dashboard',exact:true})).toBeVisible();expect(dashboardCalls).toBe(0);await expect(dashboard.getByText('Recorded finances.',{exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(page.getByTestId('workflow-drawer')).toHaveCount(0);await expect(page.getByRole('button',{name:'Dashboard',exact:true})).toBeFocused();
});

test('recent activity returns to the same workspace and a selected item survives the drawer',async({page})=>{
 await open(page);await page.getByTestId('dashboard-panel').getByRole('button',{name:'Open Synthetic client request',exact:true}).click();await expect(page).toHaveURL(/\/workflow\?item=dashboard-source$/);await expect(page.getByTestId('workflow-drawer')).toHaveCount(0);await expect(page.getByRole('heading',{name:source.title,exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();await expect(page).toHaveURL(/item=dashboard-source&panel=dashboard/);await page.keyboard.press('Escape');await expect(page).toHaveURL(/\/workflow\?item=dashboard-source$/);await expect(page.getByRole('button',{name:'Dashboard',exact:true})).toBeFocused();
});
