import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';

export default defineConfig({
 testDir:'.',testMatch:'landing.spec.ts',workers:1,fullyParallel:false,retries:0,timeout:45000,expect:{timeout:10000},
 reporter:[['list'],['json',{outputFile:resolve('var/landing-qa/results.json')}]],outputDir:resolve('var/landing-qa/artifacts'),
 projects:[{name:'chrome',use:{browserName:'chromium',channel:'chrome',launchOptions:{args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}}},{name:'firefox',use:{browserName:'firefox'}},{name:'webkit',use:{browserName:'webkit'}}],
 use:{baseURL:process.env.SF_LANDING_WEB_URL||'http://127.0.0.1:5283',headless:true,viewport:{width:1440,height:1000},reducedMotion:'no-preference',serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure'},
});
