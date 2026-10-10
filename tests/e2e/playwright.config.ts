import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',fullyParallel:false,workers:1,timeout:90000,expect:{timeout:15000},reporter:[['list'],['json',{outputFile:resolve('docs/qa/playwright-results.json')}]],outputDir:resolve('var/playwright-artifacts'),use:{baseURL:'http://localhost:5173',channel:'chrome',headless:true,viewport:{width:1440,height:900},video:'on',trace:'retain-on-failure',launchOptions:{args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}}});
