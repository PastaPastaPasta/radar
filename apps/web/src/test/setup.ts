import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { resetHealthRegistry } from '@/data/health'
import { i18nReady } from '@/i18n'
import { setSourceModeFromLink, writeSourceMode } from '@/lib/source-mode'
import { installFixtureSdk } from './msw/sdk-transport'
import { takeFixtureMisses } from './msw/handlers'
import { server } from './server'

// Pages mount behind lazy route chunks that vite transforms on first import; on a cold, loaded runner that outlasts the 1 s default.
configure({ asyncUtilTimeout: 15000 })

await i18nReady
await installFixtureSdk()
// The app shell imports the You boot lazily; loading it here keeps that import from resolving after a test file has torn down.
await import('@/features/you/boot')

Element.prototype.scrollTo = () => undefined
Element.prototype.scrollIntoView = () => undefined
window.scrollTo = () => undefined

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  takeFixtureMisses()
  resetHealthRegistry()
  // A test that switched Decentralized only mode on must not leave it on for the next one.
  writeSourceMode('all')
  setSourceModeFromLink(undefined)
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
  const misses = takeFixtureMisses()
  if (misses.length > 0) {
    throw new Error(`No recorded fixture for:\n  ${misses.join('\n  ')}`)
  }
})
afterAll(() => server.close())
