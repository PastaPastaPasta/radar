import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { dashhqAssets } from './build/dashhq-assets'
import { hyphenProxy } from './src/data/hyphen/dev-proxy'

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    dashhqAssets(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { proxy: hyphenProxy() },
  preview: { proxy: hyphenProxy() },
  build: {
    manifest: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
