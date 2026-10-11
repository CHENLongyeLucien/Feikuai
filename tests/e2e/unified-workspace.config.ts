import {defineConfig,chromium,firefox,webkit,type Project} from '@playwright/test';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

// Existing isolated preview only. No service, source, wallet or financial fixture setup.
const systemChrome=existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
if(!systemChrome&&!existsSync(chromium.executablePath()))throw new Error('Unified workspace QA requires Chrome or Chromium.');
for(const [name,browser] of [['Firefox',firefox],['WebKit',webkit]] as const){
 if(!existsSync(browser.executablePath()))throw new Error(`Unified workspace QA requires installed ${name}; engines are not silently omitted.`);
}
const projects:Project[]=[
 {name:systemChrome?'chromium-system-chrome':'chromium',use:{browserName:'chromium',...(systemChrome?{channel:'chrome'}:{}),launchOptions:{args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}}},
 {name:'firefox',use:{browserName:'firefox'}},
 {name:'webkit',use:{browserName:'webkit'}},
];
export default defineConfig({
 testDir:'.',testMatch:'unified-workspace.spec.ts',fullyParallel:false,workers:1,retries:0,
 timeout:60_000,expect:{timeout:12_000},projects,
 reporter:[['list'],['json',{outputFile:resolve('var/unified-workspace-qa/results.json')}]],
 outputDir:resolve('var/unified-workspace-qa/artifacts'),
 use:{baseURL:process.env.SF_UNIFIED_WEB_URL||'http://127.0.0.1:5283',headless:true,viewport:{width:1440,height:1000},reducedMotion:'no-preference',serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure'},
});
