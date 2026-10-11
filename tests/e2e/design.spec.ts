import {test,expect,chromium,firefox,webkit,type Page,type BrowserContext,type Cookie,type TestInfo} from '@playwright/test';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';

const sizes=[{name:'desktop',width:1440,height:1000},{name:'tablet',width:1024,height:900},{name:'mobile',width:390,height:844},{name:'narrow',width:320,height:740}];
const runId=process.env.SF_DESIGN_RUN_ID||new Date().toISOString();
const installed={chromiumBundled:existsSync(chromium.executablePath()),chromiumSystemChrome:existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),firefox:existsSync(firefox.executablePath()),webkit:existsSync(webkit.executablePath())};
let session:Cookie[]|undefined,blockedWrites:string[]=[],pageErrors:string[]=[],observations:Record<string,unknown>={};
const slug=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const origin=process.env.SF_DESIGN_WEB_URL||'http://localhost:5183';

async function login(page:Page,path='/'){
 if(session)await page.context().addCookies(session);
 else{const response=await page.request.post(`${origin}/api/v1/auth/demo`,{headers:{Origin:new URL(origin).origin}});expect(response.status(),'Only the authorized local demo login is created by this suite').toBe(200);session=await page.context().cookies();}
 await page.goto(path);await expect(page.getByRole('button',{name:/Northstar team/})).toBeVisible();
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}))).toEqual(expect.objectContaining({document:expect.any(Number),viewport:expect.any(Number)}));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Document should fit without horizontal scrolling').toBe(true);}
function navigation(page:Page){return page.getByRole('navigation',{name:(page.viewportSize()?.width||1440)<=760?'Mobile navigation':'Primary navigation',exact:true});}
async function navigateTool(page:Page,name:string){await navigation(page).getByRole('link',{name,exact:true}).click();}
async function screenshot(page:Page,testInfo:TestInfo,label:string){const directory=join('var/design-qa',testInfo.project.name);mkdirSync(directory,{recursive:true});await page.screenshot({path:join(directory,`${slug(testInfo.title)}-${label}.png`),fullPage:true,animations:'disabled'});}
async function readOnlyGuard(context:BrowserContext){await context.route('**/api/v1/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;if(!['GET','HEAD','OPTIONS'].includes(request.method())&&!(request.method()==='POST'&&path==='/api/v1/auth/demo')){blockedWrites.push(`${request.method()} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g,':id')}`);await route.abort('blockedbyclient');return;}await route.continue();});}

test.beforeEach(async({page,context})=>{blockedWrites=[];pageErrors=[];observations={};await readOnlyGuard(context);page.on('pageerror',error=>pageErrors.push(error.name));});
test.afterEach(async({page},testInfo)=>{
 expect.soft(blockedWrites,'No application data mutation is permitted in design QA').toEqual([]);expect.soft(pageErrors,'No uncaught browser errors').toEqual([]);
 const reportPath=process.env.SF_DESIGN_REPORT_PATH||'docs/qa/design-results.json';mkdirSync(dirname(reportPath),{recursive:true});let previous:any={runId,results:[]};if(existsSync(reportPath)){const read=JSON.parse(readFileSync(reportPath,'utf8'));if(read.runId===runId)previous=read;}
 const result={project:testInfo.project.name,title:testInfo.title,status:testInfo.status,expectedStatus:testInfo.expectedStatus,durationMs:testInfo.duration,viewport:page.viewportSize(),blockedMutationCount:blockedWrites.length,uncaughtErrorTypes:pageErrors,...observations};
 const results=previous.results.filter((old:any)=>old.project!==result.project||old.title!==result.title);results.push(result);
 writeFileSync(reportPath,JSON.stringify({runId,observedAt:new Date().toISOString(),scope:'Read-only interface checks; only local demo sign-in may create a session. No intake, invoice, approval, payment, cancellation or notification writes.',installedBrowsers:installed,unavailableBrowsers:Object.entries(installed).filter(([,available])=>!available).map(([name])=>name),results},null,2)+'\n');
});

for(const size of sizes){
 test(`welcome and navigation fit ${size.name} ${size.width}px`,async({page},testInfo)=>{
  await page.setViewportSize(size);await page.goto('/');await expect(page.getByRole('heading',{level:1,name:/^Inbox$/})).toBeVisible();await expect(page.getByRole('button',{name:'Explore the demo',exact:true})).toBeVisible();await noOverflow(page);
  const nav=navigation(page);await expect(nav).toBeVisible();
  const destinations=[['Inbox','/'],['Payments','/workspace'],['Alerts','/notifications'],['History & reports','/evidence'],['Operations campus','/operations'],['Agents','/agents'],['Business overview','/business'],['Settings','/settings']];
  await expect(nav.getByRole('link')).toHaveCount(destinations.length);
  await expect(nav.getByRole('link',{name:'Connections',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/More (navigation|workspace tools)/})).toHaveCount(0);
  for(const [label,url] of destinations){
   const link=nav.getByRole('link',{name:label,exact:true});await expect(link).toHaveCount(1);await expect(link).toBeVisible();await expect(link).toHaveAttribute('href',url);
   await link.click();await expect.poll(()=>new URL(page.url()).pathname).toBe(url);await expect(link).toHaveAttribute('aria-current','page');await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);await noOverflow(page);
  }
  await navigateTool(page,'Inbox');await page.evaluate(()=>window.scrollTo(0,0));
  await screenshot(page,testInfo,'welcome');
 });
 test(`workspace search works at ${size.name} ${size.width}px`,async({page},testInfo)=>{
  await page.setViewportSize(size);await login(page);
  if(size.width<=760){await page.getByRole('button',{name:'Search workspace',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Search your workspace'})).toBeVisible();await dialog.getByRole('textbox',{name:'Search your workspace',exact:true}).fill('design-qa-no-match');await noOverflow(page);await screenshot(page,testInfo,'search-dialog');await dialog.getByRole('button',{name:'Search inbox',exact:true}).click();await expect(dialog).not.toBeVisible();}
  else{await page.keyboard.press('ControlOrMeta+k');await expect(page.getByRole('textbox',{name:'Search your workspace',exact:true})).toBeFocused();await page.getByRole('textbox',{name:'Search your workspace',exact:true}).fill('design-qa-no-match');}
  await expect(page.locator('.sf-inbox-row')).toHaveCount(0);await noOverflow(page);await screenshot(page,testInfo,'filtered');
 });
 test(`payments add invoice opens an unsubmitted form at ${size.name} ${size.width}px`,async({page},testInfo)=>{
  await page.setViewportSize(size);await login(page,'/workspace');await expect(page.getByRole('heading',{level:1,name:'Payments'})).toBeVisible();await noOverflow(page);await screenshot(page,testInfo,'payments');
  await page.getByRole('button',{name:'Add invoice',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Add to inbox',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Add & review',exact:true})).toBeDisabled();await noOverflow(page);await screenshot(page,testInfo,'invoice-form');await dialog.getByRole('button',{name:'Close add to inbox',exact:true}).click();await expect(dialog).not.toBeVisible();
 });
 test(`settings toggles change the campus preference at ${size.name} ${size.width}px`,async({page},testInfo)=>{
  await page.setViewportSize(size);await login(page,'/settings');await expect(page.getByRole('heading',{level:1,name:'Workspace settings.'})).toBeVisible();const pause=page.getByRole('checkbox',{name:/Pause campus animation/}),reduce=page.getByRole('checkbox',{name:/Reduce motion/});await pause.check();await reduce.check();await expect(pause).toBeChecked();await expect(reduce).toBeChecked();await noOverflow(page);await screenshot(page,testInfo,'settings');
  await navigateTool(page,'Operations campus');await expect(page.getByRole('button',{name:'Resume scene motion',exact:true})).toBeVisible();await navigateTool(page,'Settings');await expect(pause).toBeChecked();await expect(reduce).toBeChecked();await pause.uncheck();await reduce.uncheck();await expect(pause).not.toBeChecked();await expect(reduce).not.toBeChecked();
 });
 test(`operations campus supports read-only controls at ${size.name} ${size.width}px`,async({page},testInfo)=>{
  await page.setViewportSize(size);await login(page,'/operations');const canvas=page.getByTestId('campus-canvas').locator('canvas');await expect(canvas).toBeVisible();await expect.poll(async()=>JSON.parse(await canvas.getAttribute('data-camera')||'{}').drawCalls||0).toBeGreaterThan(50);await noOverflow(page);
  const before=JSON.parse((await canvas.getAttribute('data-camera'))!);await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect.poll(async()=>JSON.parse((await canvas.getAttribute('data-camera'))!).zoom).toBeGreaterThan(before.zoom);
  await page.getByRole('button',{name:'Rotate right',exact:true}).click();await expect.poll(async()=>Math.abs(JSON.parse((await canvas.getAttribute('data-camera'))!).position[0]-before.position[0])).toBeGreaterThan(.1);
  await page.getByRole('button',{name:'Campus overview',exact:true}).click();await page.getByRole('button',{name:'Pause scene motion',exact:true}).click();await expect(page.getByRole('button',{name:'Resume scene motion',exact:true})).toBeVisible();
  if(await page.getByRole('navigation',{name:'Campus panels',exact:true}).isVisible())await page.getByRole('navigation',{name:'Campus panels',exact:true}).getByRole('button',{name:'Activity',exact:true}).click();
  await page.getByRole('button',{name:'Agents 2',exact:true}).click();await page.getByTestId('entity-table').getByRole('button',{name:/Intake Agent/}).click();await expect(page.getByTestId('entity-inspector').getByRole('heading',{name:'Intake Agent',exact:true})).toBeVisible();await page.getByRole('button',{name:'Focus selected',exact:true}).click();await noOverflow(page);
  observations={camera:JSON.parse((await canvas.getAttribute('data-camera'))!),actualRenderer:'Browser WebGL using configured software-rendering flags'};await screenshot(page,testInfo,'campus');
 });
 test(`independent approver landing fits ${size.name} ${size.width}px`,async({page},testInfo)=>{
  await page.setViewportSize(size);await page.goto(process.env.SF_DESIGN_APPROVER_URL||'http://localhost:5184');await expect(page.getByRole('heading',{level:1,name:'Review. Sign. Return.'})).toBeVisible();await expect(page.getByLabel('Approval request file', {exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sign exact payment',exact:true})).toHaveCount(0);await noOverflow(page);await screenshot(page,testInfo,'approver');
 });
}
