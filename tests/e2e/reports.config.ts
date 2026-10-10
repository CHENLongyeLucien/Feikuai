import {defineConfig} from '@playwright/test';
import design from './design.config';
import {resolve} from 'node:path';
export default defineConfig({...design,testMatch:['reports.spec.ts'],reporter:[['list'],['json',{outputFile:resolve('var/pdf-report-qa/browser-results.json')}]],outputDir:resolve('var/pdf-report-qa/browser-artifacts')});
