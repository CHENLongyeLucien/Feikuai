import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';

export default defineConfig({
  testDir: '.', testMatch: 'inbox.spec.ts', fullyParallel: false, workers: 1,
  timeout: 120000, expect: {timeout: 20000},
  reporter: [['list'], ['json', {outputFile: resolve('docs/qa/redesign-playwright-results.json')}]],
  outputDir: resolve('var/redesign-playwright-artifacts'),
  use: {baseURL: 'http://localhost:5183', channel: 'chrome', headless: true,
    viewport: {width: 1440, height: 1000}, video: 'on', trace: 'retain-on-failure',
    launchOptions: {args: ['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}}
});
