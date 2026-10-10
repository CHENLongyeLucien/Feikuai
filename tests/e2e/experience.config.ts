import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';

// The current experience runs only on the isolated demo. The archived 5173
// workflow/campus specs are intentionally absent from both project matchers.
export default defineConfig({
 testDir:'.',fullyParallel:false,workers:1,timeout:120000,expect:{timeout:20000},
 reporter:[['list'],['json',{outputFile:resolve('docs/qa/experience-playwright-results.json')}]],
 outputDir:resolve('var/experience-playwright-artifacts'),
 projects:[
  {name:'inbox',testMatch:'inbox.spec.ts'},
  {name:'guided-approval',testMatch:'bridge.spec.ts',dependencies:['inbox']},
 ],
 use:{baseURL:'http://localhost:5183',channel:'chrome',headless:true,viewport:{width:1440,height:1000},
  video:'on',trace:'retain-on-failure',
  launchOptions:{args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}},
});
