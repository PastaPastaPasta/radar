import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { dashhqAssets } from './build/dashhq-assets'
import { fixtureWorker } from './build/fixture-worker'
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

export default defineConfig(({ mode }) => {
  const fixtures = loadEnv(mode, process.cwd(), 'VITE_').VITE_DATA_MODE === 'fixtures'
  return {
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      dashhqAssets(),
      securityHeaders(),
      fixtureWorker(fixtures),
    ],
    resolve: {
      alias: [
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        {
          find: /^react-remove-scroll-bar$/,
          replacement: fileURLToPath(new URL('./src/app/remove-scroll-bar.ts', import.meta.url)),
        },
      ],
    },
    server: { proxy: fixtures ? undefined : hyphenProxy() },
    preview: { proxy: fixtures ? undefined : hyphenProxy() },
    build: {
      manifest: true,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
      setupFiles: ['src/test/setup.ts'],
    },
  }
})
