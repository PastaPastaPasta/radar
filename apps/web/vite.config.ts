import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { dashhqAssets } from './build/dashhq-assets'
import { securityHeaders } from './build/security-headers'
import { hyphenProxy } from './src/data/hyphen/dev-proxy'

function appVersion(): string {
  const sha = process.env.GITHUB_SHA
  if (sha) return sha.slice(0, 12)
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    dashhqAssets(),
    securityHeaders(),
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
