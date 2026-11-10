import { http, HttpResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { fixtureHandlers, onFixtureMiss } from './handlers'

export const FIXTURE_ERROR_PREFIX = '[radar-fixtures]'

function fail(message: string): void {
  console.error(`${FIXTURE_ERROR_PREFIX} ${message}`)
}

/**
 * Anything that would leave the page for another origin, or go through the Hyphen pass-through
 * without a recording, is an error and is answered with a network failure instead of being sent.
 */
const refuseUnrecorded = http.all('*', ({ request }) => {
  const url = new URL(request.url)
  if (url.origin === location.origin && !url.pathname.startsWith('/x/hy/')) return undefined
  fail(`unhandled request ${request.method} ${request.url}`)
  return HttpResponse.error()
})

export async function startFixtureWorker(): Promise<void> {
  onFixtureMiss((request) => {
    fail(`no recorded fixture for ${request}`)
  })
  await setupWorker(...fixtureHandlers, refuseUnrecorded).start({
    quiet: true,
    onUnhandledFrame: 'bypass',
  })
}
