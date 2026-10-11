import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({testDir:'.',testMatch:'approver-wallet.spec.ts',workers:1,timeout:30000,reporter:[['list']],outputDir:resolve('var/approver-wallet-artifacts'),use:{channel:'chrome',headless:true,viewport:{width:1280,height:900}}});
