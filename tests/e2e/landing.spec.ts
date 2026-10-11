import {expect,test,type Locator,type Page,type TestInfo} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

// Synthetic transport fixtures exercise rendering only; they are never stored or
// represented as observed mainnet results. Every application write is blocked.
const timestamp='2026-10-11T12:30:00.000Z';
const transactions=Array.from({length:7},(_,index)=>({hash:'0x'+(index+1).toString(16).padStart(64,'a'),blockNumber:'12345678',blockHash:'0x'+'b'.repeat(64),timestamp,transactionIndex:index,from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),valueAtomic:'125000000000000000',valueAvax:'0.125',explorerUrl:'https://snowtrace.io/tx/0x'+(index+1).toString(16).padStart(64,'a'),executionStatus:'not_checked'}));
function fixture(status:'fresh'|'stale'|'unavailable'='fresh'){return {schemaVersion:'avalanche-c-chain-activity.v1',network:{name:'Avalanche C-Chain',chainId:'43114',environment:'mainnet',scope:'C-Chain only',nativeSymbol:'AVAX',nativeDecimals:18,geolocationAvailable:false},source:{name:'UI QA synthetic RPC fixture',rpcUrl:'https://example.invalid/rpc',documentationUrl:'https://example.invalid/docs',explorerUrl:'https://snowtrace.io',readOnly:true,finality:'rpc-finalized'},status,fetchedAt:status==='unavailable'?null:timestamp,servedAt:timestamp,ageMs:status==='stale'?60000:0,nextRefreshAfterMs:60000,latestBlock:status==='unavailable'?null:{number:'12345678',hash:'0x'+'b'.repeat(64),timestamp,transactionCount:7,explorerUrl:'https://snowtrace.io/block/12345678'},transactions:status==='unavailable'?[]:transactions,sample:{blockCount:1,transactionCount:status==='unavailable'?0:7,returnedTransactionCount:status==='unavailable'?0:7,limit:24},error:status==='unavailable'?{code:'RPC_UNAVAILABLE',message:'Synthetic unavailable response for UI QA.'}:null};}
let errors:string[]=[],writes:string[]=[];
test.beforeEach(async({page,context})=>{errors=[];writes=[];page.on('pageerror',error=>errors.push(error.message));await context.route('**/*',async route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){writes.push(route.request().method()+' '+new URL(route.request().url()).pathname);return route.abort();}return route.continue();});});
test.afterEach(async({},info)=>{expect.soft(errors).toEqual([]);expect.soft(writes).toEqual([]);await info.attach('scope',{body:JSON.stringify({scope:'Read-only UI QA with synthetic RPC response fixtures; no mainnet activity or payment execution claim.',errors,writes}),contentType:'application/json'});});
async function open(page:Page,status:'fresh'|'stale'|'unavailable'='fresh'){
 await page.route('**/api/v1/network/activity',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture(status))}));
 await page.goto('/');await expect(page.getByTestId('landing-page')).toBeVisible();await expect(page.getByRole('button',{name:'Start',exact:true})).toBeVisible();
}
async function state(page:Page){return JSON.parse(await page.getByTestId('landing-globe').locator('canvas').getAttribute('data-globe')||'{}') as {frame:number;drawCalls:number;rotation:number[];distance:number;transactionCount:number;arcMotion:boolean};}
async function rendered(page:Page){await expect.poll(async()=>(await state(page)).drawCalls||0).toBeGreaterThan(2);}
async function fillsViewport(page:Page,timeout=3000){await expect.poll(async()=>{const box=await page.getByTestId('landing-globe').locator('canvas').boundingBox(),viewport=page.viewportSize()!;return !!box&&Math.abs(box.x)<2&&Math.abs(box.y)<2&&Math.abs(box.width-viewport.width)<2&&Math.abs(box.height-viewport.height)<2;},{intervals:[30,50,100],timeout}).toBe(true);}
async function notConcealed(locator:Locator){
 await expect(locator).toBeVisible();
 await expect.poll(()=>locator.evaluate(element=>{let opacity=1;for(let node:Element|null=element;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);return opacity;}),{message:'Page content must not fade away during manual globe zoom'}).toBeGreaterThan(.8);
}
async function pointerTarget(locator:Locator){
 await notConcealed(locator);await locator.scrollIntoViewIfNeeded();
 await expect.poll(()=>locator.evaluate(element=>{const box=element.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return !!hit&&(hit===element||element.contains(hit));}),{message:'The retained page control must receive pointer input above the globe'}).toBe(true);
 return locator.boundingBox();
}
async function wheelOverExposedCanvas(page:Page,delta:number){
 const canvas=page.getByTestId('landing-globe').locator('canvas');
 const exposed=()=>canvas.evaluate(element=>{
  const box=element.getBoundingClientRect(),left=Math.max(8,box.left+8),right=Math.min(innerWidth-8,box.right-8),top=Math.max(8,box.top+8),bottom=Math.min(innerHeight-8,box.bottom-8);
  for(const y of [.35,.5,.65,.2,.8,.1,.9])for(const x of [.65,.5,.8,.35,.2,.9,.1]){
   const point={x:left+(right-left)*x,y:top+(bottom-top)*y};if(right>left&&bottom>top&&document.elementFromPoint(point.x,point.y)===element)return point;
  }
  return null;
 });
 await expect.poll(exposed,{message:'Wheel zoom needs an exposed, hit-testable canvas point'}).not.toBeNull();
 const point=(await exposed())!;await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,delta);
}
async function retainedPageContent(page:Page){
 await notConcealed(page.getByRole('heading',{level:1,name:/Every payment/}));
 await notConcealed(page.getByText('Bring the message, the checks and the decision into one calm workspace.',{exact:true}));
 await expect(page.getByRole('button',{name:'Start',exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:'Overview',exact:true})).toHaveCount(0);
 await pointerTarget(page.getByRole('link',{name:'SecureFinance home',exact:true}));
 await pointerTarget(page.getByRole('link',{name:'Network activity',exact:true}));
 await pointerTarget(page.getByTestId('landing-start'));await expect(page.getByTestId('landing-start')).toBeEnabled();
 await expect(page.getByText('Live network',{exact:true})).toBeVisible();await pointerTarget(page.getByRole('link',{name:/View transaction/}).first());
 for(const name of ['Zoom in on globe','Zoom out of globe','Rotate globe left','Rotate globe right','Reset globe view','Pause globe motion'])await pointerTarget(page.getByRole('button',{name,exact:true}));
}
async function capture(page:Page,info:TestInfo,name:string){
 const fit=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));expect(fit.scroll).toBeLessThanOrEqual(fit.width+1);
 await page.evaluate(()=>{const marker=document.createElement('div');marker.textContent='UI QA · synthetic RPC fixture';marker.style.cssText='position:fixed;right:12px;bottom:10px;z-index:1000;padding:5px 8px;background:#ffffffd9;color:#657769;font:9px sans-serif;border-radius:4px;pointer-events:none';document.body.append(marker);});
 const path=join('var/landing-qa',info.project.name);mkdirSync(path,{recursive:true});await page.screenshot({path:join(path,`${name}.png`),fullPage:true});
}
for(const size of [{name:'desktop',width:1440,height:1000},{name:'tablet',width:1024,height:900},{name:'mobile',width:390,height:844},{name:'narrow',width:320,height:740}]){
 test(`globe and activity fit ${size.name}`,async({page},info)=>{
  await page.setViewportSize(size);await open(page);await rendered(page);await expect(page.getByText('Live network',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:/View transaction/})).toHaveCount(size.width<=900?2:4);await expect.poll(async()=>(await state(page)).transactionCount).toBe(7);
  await expect(page.getByText('Positions are illustrative, never sender locations.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Pause globe motion'}).click();await capture(page,info,`${size.name}-qa-fixture`);
 });
}
test('keyboard rotation, reset, pause and cancellable Start use the actual globe',async({page},info)=>{
 await open(page);await rendered(page);await page.getByRole('button',{name:'Pause globe motion'}).click();
 const before=await state(page);const globe=page.getByRole('group',{name:/Interactive Earth/});await globe.focus();await page.keyboard.press('ArrowRight');
 await expect.poll(async()=>(await state(page)).rotation[1]).toBeGreaterThan(before.rotation[1]!+.1);
 await page.getByRole('button',{name:'Reset globe view'}).click();await expect.poll(async()=>Math.abs((await state(page)).rotation[1]!-.42)).toBeLessThan(.02);
 await page.getByRole('button',{name:'Resume globe motion'}).click();const distance=(await state(page)).distance;
 await page.getByRole('button',{name:'Start',exact:true}).click();await fillsViewport(page,900);await expect.poll(async()=>(await state(page)).distance,{intervals:[40,70,100],timeout:900}).toBeLessThan(distance-.2);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Start',exact:true})).toBeEnabled();await expect.poll(async()=>(await state(page)).distance).toBeGreaterThan(distance-.1);
 await page.waitForTimeout(1150);expect(new URL(page.url()).pathname).toBe('/');
 await capture(page,info,'cancelled-entry-qa-fixture');await page.getByRole('button',{name:'Start',exact:true}).click();await expect(page).toHaveURL(/\/workflow$/);await expect(page.getByRole('heading',{name:'One clear path.'})).toBeVisible();
});
for(const size of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}])test(`manual globe zoom fills the background while page content stays usable ${size.name}`,async({page},info)=>{
 await page.setViewportSize(size);await open(page);await rendered(page);
 const canvas=page.getByTestId('landing-globe').locator('canvas'),landing=page.getByTestId('landing-page');
 await canvas.scrollIntoViewIfNeeded();await wheelOverExposedCanvas(page,-650);
 await expect(landing).toHaveAttribute('data-expanded','true');await fillsViewport(page);
 await retainedPageContent(page);
 await expect.poll(()=>page.evaluate(()=>[getComputedStyle(document.body).overflowY,getComputedStyle(document.documentElement).overflowY].some(value=>value==='hidden'||value==='clip'))).toBe(false);
 if(size.name==='mobile'){
  await pointerTarget(page.getByRole('link',{name:'Network activity',exact:true}));await page.getByRole('link',{name:'Network activity',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Avalanche',exact:true})).toBeInViewport();
  const cardPoint=(await pointerTarget(page.getByText('Live network',{exact:true})))!,beforeScroll=await page.evaluate(()=>scrollY);expect(beforeScroll).toBeGreaterThan(100);
  await page.mouse.move(cardPoint.x+cardPoint.width/2,cardPoint.y+cardPoint.height/2);await page.mouse.wheel(0,-240);
  await expect.poll(()=>page.evaluate(()=>scrollY),{message:'The mobile page must scroll normally while the globe remains enlarged'}).toBeLessThan(beforeScroll-30);
  await expect(landing).toHaveAttribute('data-expanded','true');await fillsViewport(page);
 }
 const distance=(await state(page)).distance;
 await wheelOverExposedCanvas(page,-650);
 await expect.poll(async()=>(await state(page)).distance).toBeLessThan(distance-.2);
 for(let zoom=0;zoom<8;zoom++)await page.getByRole('button',{name:'Zoom in on globe',exact:true}).click();
 await expect.poll(async()=>(await state(page)).distance).toBeLessThan(3.2);await fillsViewport(page);
 await retainedPageContent(page);await capture(page,info,`${size.name}-background-zoom-qa-fixture`);
 await page.setViewportSize({width:size.width+40,height:size.height-30});await fillsViewport(page);
 await expect.poll(async()=>(await state(page)).distance).toBeLessThan(4);
 await page.setViewportSize(size);await fillsViewport(page);
 await page.keyboard.press('Escape');await expect(landing).toHaveAttribute('data-expanded','false');
 await expect.poll(async()=>await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await expect.poll(async()=>Math.round((await canvas.boundingBox())?.width||0)).not.toBe(size.width);
 await page.getByRole('button',{name:'Zoom in on globe',exact:true}).click();await expect(landing).toHaveAttribute('data-expanded','true');await fillsViewport(page);
 await pointerTarget(page.getByRole('button',{name:'Reset globe view',exact:true}));await page.getByRole('button',{name:'Reset globe view',exact:true}).click();await expect(landing).toHaveAttribute('data-expanded','false');
 await page.getByRole('button',{name:'Zoom in on globe',exact:true}).click();await expect(landing).toHaveAttribute('data-expanded','true');
 await pointerTarget(page.getByTestId('landing-start'));await page.getByTestId('landing-start').click();await fillsViewport(page,900);await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(landing).toHaveAttribute('data-expanded','false');
 await page.waitForTimeout(1150);expect(new URL(page.url()).pathname).toBe('/');
 await page.getByTestId('landing-start').click();await expect(page).toHaveURL(/\/workflow$/);await expect(page.getByRole('heading',{name:'One clear path.'})).toBeVisible();
});
test('reduced motion enters directly and pauses automatic globe motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await open(page);await rendered(page);await expect(page.getByRole('button',{name:'Globe motion reduced in Settings'})).toBeDisabled();
 const before=await state(page);await page.waitForTimeout(300);const after=await state(page);expect(after.rotation).toEqual(before.rotation);
 await page.getByRole('button',{name:'Start',exact:true}).click();await expect(page).toHaveURL(/\/workflow$/,{timeout:500});await expect(page.getByTestId('landing-page')).toHaveCount(0);
});
test('unavailable and stale feeds make no live activity claim',async({page},info)=>{
 await open(page,'unavailable');await rendered(page);await expect(page.getByText('Network unavailable',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:/View transaction/})).toHaveCount(0);expect((await state(page)).transactionCount).toBe(0);await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
 await page.unroute('**/api/v1/network/activity');await page.route('**/api/v1/network/activity',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture('stale'))}));await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByText('Last recorded activity',{exact:true})).toBeVisible();await expect(page.getByText('Live network',{exact:true})).toHaveCount(0);await capture(page,info,'stale-feed-qa-fixture');
});
test('client age and offline state stop the live claim and route pulses',async({page})=>{
 await open(page);await rendered(page);await expect(page.getByTestId('landing-page')).toHaveAttribute('data-network-state','fresh');await expect.poll(async()=>(await state(page)).arcMotion).toBe(true);
 await page.evaluate(()=>{const originalNow=Date.now;Date.now=()=>originalNow()+31000;});
 await expect(page.getByText('Last recorded activity',{exact:true})).toBeVisible();await expect.poll(async()=>(await state(page)).arcMotion).toBe(false);
 await page.reload();await rendered(page);await expect(page.getByTestId('landing-page')).toHaveAttribute('data-network-state','fresh');
 await page.context().setOffline(true);await expect(page.getByTestId('landing-page')).toHaveAttribute('data-network-state','stale');await expect.poll(async()=>(await state(page)).arcMotion).toBe(false);
});
test('WebGL fallback keeps live feed and Start usable',async({page},info)=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl'||type==='webgl2')return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
 await open(page);await expect(page.getByTestId('globe-fallback')).toBeVisible();await expect(page.getByText('Live network',{exact:true})).toBeVisible();await capture(page,info,'webgl-fallback-qa-fixture');
 await page.getByRole('button',{name:'Start',exact:true}).click();await expect(page).toHaveURL(/\/workflow$/,{timeout:500});
});
