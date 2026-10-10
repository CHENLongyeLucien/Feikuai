import {defineConfig} from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({...base,test:{include:['tests/recovery/**/*.test.ts','tests/integration/**/*.test.ts'],exclude:['tests/e2e/**'],fileParallelism:false,testTimeout:120000,hookTimeout:60000}});
