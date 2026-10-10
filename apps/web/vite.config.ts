import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname);
export default defineConfig({ root, resolve:{alias:Object.fromEntries(['shared','chain','evidence'].map(name=>[`@secure-finance/${name}`,resolve(root,`../../packages/${name}/src/index.ts`)]))}, plugins: [react(), tailwindcss()], server: { host: '127.0.0.1', port: Number(process.env.WEB_PORT||5173), strictPort: true, proxy: { '/api': process.env.API_PROXY_TARGET||'http://127.0.0.1:3001', '/health': process.env.API_PROXY_TARGET||'http://127.0.0.1:3001' } }, build: { chunkSizeWarningLimit: 1100 } });
