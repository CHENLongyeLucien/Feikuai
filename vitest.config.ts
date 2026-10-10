import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({resolve:{alias:Object.fromEntries(['shared','chain','evidence'].map(name=>[`@secure-finance/${name}`,fileURLToPath(new URL(`./packages/${name}/src/index.ts`,import.meta.url))]))},test:{include:['tests/**/*.test.ts','packages/**/*.test.ts','apps/**/*.test.ts'],exclude:['tests/e2e/**','tests/recovery/**','tests/integration/**'],testTimeout:30000}});
