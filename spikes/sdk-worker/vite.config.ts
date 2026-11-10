import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// VARIANT=embedded (default): the package's own entry; wasm is inlined as gzip+base64 inside the JS.
// VARIANT=split: bypass the package "exports" map to the tsc output (dist/sdk.js) and alias its wasm
// entry to a shim, so wasm_sdk_bg.wasm is a separate hashed asset loaded by instantiateStreaming
// (cacheable, browser code cache, brotli at the CDN).
const split = process.env.VARIANT === 'split';
const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: split ? 'dist-split' : 'dist-embedded', sourcemap: false, minify: true, rollupOptions: { input: { index: at('./index.html'), mainthread: at('./main-thread.html') } } },
  resolve: split
    ? { alias: { '@dashevo/evo-sdk': at('./node_modules/@dashevo/evo-sdk/dist/sdk.js'), '@dashevo/wasm-sdk/compressed': at('./src/wasm-split.ts') } }
    : {},
});
