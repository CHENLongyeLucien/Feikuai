import {defineConfig, chromium, firefox, webkit, type Project} from '@playwright/test';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

// Use an already-running copied preview. This suite starts no services and creates no fixtures.
const systemChrome = existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
if (!systemChrome && !existsSync(chromium.executablePath())) {
  throw new Error('Process-map QA requires an installed Chrome or Chromium browser.');
}
for (const [name, executable] of [['Firefox', firefox.executablePath()], ['WebKit', webkit.executablePath()]]) {
  if (!existsSync(executable!)) throw new Error(`Process-map QA requires the installed ${name} browser; it does not silently omit engines.`);
}

const projects: Project[] = [
  {
    name: systemChrome ? 'chromium-system-chrome' : 'chromium',
    use: {
      browserName: 'chromium',
      ...(systemChrome ? {channel: 'chrome'} : {}),
      launchOptions: {args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']},
    },
  },
  {name: 'firefox', use: {browserName: 'firefox', launchOptions: {}}},
  {name: 'webkit', use: {browserName: 'webkit', launchOptions: {}}},
];

export default defineConfig({
  testDir: '.',
  testMatch: 'process-map.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {timeout: 12_000},
  projects,
  reporter: [['list'], ['json', {outputFile: resolve('var/process-map-qa/results.json')}]],
  outputDir: resolve('var/process-map-qa/artifacts'),
  use: {
    baseURL: process.env.SF_PROCESS_WEB_URL || 'http://127.0.0.1:5283',
    headless: true,
    viewport: {width: 1440, height: 1000},
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
