import { defineConfig, devices } from '@playwright/test'

const live = process.env.E2E_LIVE === '1'
const fixturePort = 4173
const livePort = 4174
const port = live ? livePort : fixturePort

const profiles = {
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  phone: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
} as const

const fixtureProjects = (['desktop', 'phone'] as const).flatMap((form) =>
  (['light', 'dark'] as const).map((theme) => ({
    name: `${form}-${theme}`,
    grepInvert: /@live/,
    use: { ...profiles[form], colorScheme: theme },
  })),
)

const liveProject = {
  name: 'live',
  grep: /@live/,
  retries: 2,
  use: { ...profiles.desktop, colorScheme: 'light' as const },
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: !live,
  workers: live ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
  },
  projects: live ? [liveProject] : fixtureProjects,
  webServer: live
    ? {
        command: `pnpm --filter @radar/web build && node ../review/serve.mjs --dist ../apps/web/dist --port ${livePort}`,
        url: `http://127.0.0.1:${livePort}`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      }
    : {
        command:
          'pnpm --filter @radar/web build:e2e && pnpm --filter @radar/web preview:e2e --host 127.0.0.1',
        url: `http://127.0.0.1:${fixturePort}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
