import {defineConfig,chromium,firefox,webkit,type Project} from '@playwright/test';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

// These checks never submit intake, approval, execution, cancellation or notification writes.
// They reuse the already-running isolated demo; no webServer or financial fixture setup is started.
process.env.SF_DESIGN_RUN_ID ||= new Date().toISOString();
const baseURL=process.env.SF_DESIGN_WEB_URL||'http://localhost:5183';
const browsers:Project[]=[];
if(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))browsers.push({name:'chromium-system-chrome',use:{browserName:'chromium',channel:'chrome',launchOptions:{args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}}});
else if(existsSync(chromium.executablePath()))browsers.push({name:'chromium',use:{browserName:'chromium'}});
if(existsSync(firefox.executablePath()))browsers.push({name:'firefox',use:{browserName:'firefox'}});
if(existsSync(webkit.executablePath()))browsers.push({name:'webkit',use:{browserName:'webkit'}});
if(!browsers.length)throw new Error('No compatible installed browser found. Install an explicitly selected browser before running design QA.');

export default defineConfig({
 testDir:'.',testMatch:['design.spec.ts','design-records.spec.ts'],fullyParallel:false,workers:1,retries:0,timeout:45000,expect:{timeout:12000},
 reporter:[['list'],['json',{outputFile:resolve('var/design-qa/playwright-results.json')}]],
 outputDir:resolve('var/design-qa/artifacts'),projects:browsers,
 use:{baseURL,headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},
});
