import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({
 testDir:'.',testMatch:'paid-invoice.spec.ts',workers:1,fullyParallel:false,retries:0,timeout:30000,expect:{timeout:8000},
 reporter:[['list'],['json',{outputFile:resolve('var/paid-invoice-qa/results.json')}]],outputDir:resolve('var/paid-invoice-qa/artifacts'),
 projects:[{name:'chrome',use:{browserName:'chromium',channel:'chrome',launchOptions:{args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}}},{name:'firefox',use:{browserName:'firefox'}},{name:'webkit',use:{browserName:'webkit'}}],
 use:{baseURL:process.env.SF_INVOICE_WEB_URL||'http://127.0.0.1:5283',headless:true,viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure'},
});
