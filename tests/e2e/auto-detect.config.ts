import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({testDir:'.',testMatch:'auto-detect.spec.ts',workers:1,timeout:60000,reporter:[['list']],outputDir:resolve('var/auto-detect-artifacts'),use:{baseURL:process.env.SF_DEMO_WEB_URL||'http://localhost:5183',channel:'chrome',headless:true,viewport:{width:1440,height:1000}}});
