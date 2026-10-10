import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({testDir:'.',testMatch:'bridge.spec.ts',fullyParallel:false,workers:1,timeout:120000,expect:{timeout:20000},
 reporter:[['list'],['json',{outputFile:resolve('docs/qa/approval-bridge-results.json')}]],outputDir:resolve('var/approval-bridge-artifacts'),
 use:{baseURL:'http://localhost:5183',channel:'chrome',headless:true,viewport:{width:1440,height:1000},video:'on',trace:'retain-on-failure'}});
