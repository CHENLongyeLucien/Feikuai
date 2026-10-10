import {defineConfig} from 'vitest/config';
import base from './vitest.config.ts';
// Process-kill recovery has a separate lifecycle and artifact policy; it is not implicitly run here.
// SF_INTEGRATION_MANIFEST_PATH and SF_INTEGRATION_RPC_URL select an isolated loopback test chain.
export default defineConfig({...base,test:{include:['tests/integration/**/*.test.ts'],exclude:['tests/e2e/**','tests/recovery/**'],fileParallelism:false,testTimeout:120000,hookTimeout:60000}});
