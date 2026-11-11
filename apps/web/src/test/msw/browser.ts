import { http, HttpResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { core } from '@/data/core/client'
import { setDapiTransport } from '@/data/dapi-core'
import { sdk, setSdkTransport } from '@/data/sdk/client'
import type { NetworkId } from '@/lib/network'
import { FixtureDapiTransport } from './dapi-transport'
import { FixtureSdkTransport } from './sdk-transport'
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

/** What a spec can reach from the page in a fixture build. */
export interface RadarFixtureHooks {
  /** Cuts the Core connection: streams fail, calls fail and the DAPI source reports down (IN-15). */
  breakLiveConnection(net?: NetworkId): void
  restoreLiveConnection(net?: NetworkId): void
}

export async function startFixtureWorker(): Promise<void> {
  const dapi = new FixtureDapiTransport()
  setDapiTransport(dapi)
  const hooks: RadarFixtureHooks = {
    breakLiveConnection: (net = 'mainnet') => dapi.breakConnection(net),
    restoreLiveConnection: (net = 'mainnet') => dapi.restoreConnection(net),
  }
  ;(window as unknown as { __radarFixtures: RadarFixtureHooks }).__radarFixtures = hooks
  setSdkTransport(() => Promise.resolve(new FixtureSdkTransport()))
  // The Core façade, so a spec can call it without a page that renders its answers.
  ;(window as unknown as { __radarCore: typeof core }).__radarCore = core
  ;(window as unknown as { __radarSdk: typeof sdk }).__radarSdk = sdk
  onFixtureMiss((request) => {
    fail(`no recorded fixture for ${request}`)
  })
  await setupWorker(...fixtureHandlers, refuseUnrecorded).start({
    quiet: true,
    onUnhandledFrame: 'bypass',
  })
}
