import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
import design from './design.config';

export default defineConfig(design, {
  testMatch: ['simplified-inbox.spec.ts'],
  reporter: [['list'], ['json', {outputFile: resolve('var/simplified-inbox-qa/results.json')}]],
  outputDir: resolve('var/simplified-inbox-qa/artifacts'),
  use: {...design.use, baseURL: process.env.SF_DESIGN_WEB_URL || 'http://127.0.0.1:5283'},
});
