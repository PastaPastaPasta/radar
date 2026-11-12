import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { resetHealthRegistry } from '@/data/health'
import { i18nReady } from '@/i18n'
import { installFixtureSdk } from './msw/sdk-transport'
import { takeFixtureMisses } from './msw/handlers'
import { server } from './server'

await i18nReady
await installFixtureSdk()

Element.prototype.scrollTo = () => undefined
Element.prototype.scrollIntoView = () => undefined
window.scrollTo = () => undefined

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  takeFixtureMisses()
  resetHealthRegistry()
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
