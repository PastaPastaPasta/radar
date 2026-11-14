import { http, HttpResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { core } from '@/data/core/client'
import { setDapiTransport } from '@/data/dapi-core'
import { sdk, setSdkTransport, type SdkTransport } from '@/data/sdk/client'
import type { NetworkId } from '@/lib/network'
import { FixtureDapiTransport } from './dapi-transport'
import { FixtureSdkTransport } from './sdk-transport'
import { fixtureHandlers, HTTP_SOURCE_PATTERNS, onFixtureMiss } from './handlers'

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
  /** How many times the fixture DAPI transport has been asked for `method` (a DAPI method name). */
  dapiCalls(method: string): number
  /** How many reads a source turned away because `radar.fixture.down` lists it, not counting health probes and the shell's live tip; a page that never asked reads 0. */
  refusedReads(source: string): number
  /** The DAPI methods turned away, one entry per call. */
  refusedDapiMethods(): string[]
}

/** `sessionStorage` key a spec sets before the page loads: `{ [txid]: { instantLocked } }`, transactions to answer as unmined. */
export const FIXTURE_UNMINED_KEY = 'radar.fixture.unmined'

/**
 * `sessionStorage` key a spec sets before the page loads: a JSON array of the sources to answer as down, from
 * `radar`, `pe`, `hyphen`, `insight`, `sdk` and `dapi`. HTTP sources fail at the network, the SDK refuses every call
 * and the DAPI pool is cut, so a page shows what it does when that backend is gone.
 */
export const FIXTURE_DOWN_KEY = 'radar.fixture.down'

type DownSource = keyof typeof HTTP_SOURCE_PATTERNS | 'rate' | 'sdk' | 'dapi'

/** The live tip the shell keeps open on every page; a refusal of it says nothing about the page. */
const SHELL_TIP_STREAM = 'subscribeToBlockHeadersWithChainLocks'

const refusedBySource: Record<string, number> = {}
const countRefusal = (source: string) => {
  refusedBySource[source] = (refusedBySource[source] ?? 0) + 1
}

function downFromSession(): ReadonlySet<DownSource> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(FIXTURE_DOWN_KEY) ?? '[]') as DownSource[])
  } catch {
    return new Set()
  }
}

/** An SDK whose nodes are all unreachable. */
const unreachableSdk: SdkTransport = {
  connect: () => Promise.resolve({ sdkVersion: 'fixture', protocolVersion: 14, tookMs: 0 }),
  call: () => {
    countRefusal('sdk')
    return Promise.resolve({
      ok: false,
      error: { kind: 'network', message: 'The SDK is unreachable' },
    })
  },
  decode: () =>
    Promise.resolve({
      ok: false,
      error: { kind: 'unavailable', message: 'Local decoding is not recorded in fixtures' },
    }),
}

function unminedFromSession(): Record<string, { instantLocked: boolean }> {
  try {
    return JSON.parse(sessionStorage.getItem(FIXTURE_UNMINED_KEY) ?? '{}') as Record<
      string,
      { instantLocked: boolean }
    >
  } catch {
    return {}
  }
}

export async function startFixtureWorker(): Promise<void> {
  const dapi = new FixtureDapiTransport()
  for (const [txid, opts] of Object.entries(unminedFromSession())) dapi.answerAsUnmined(txid, opts)
  setDapiTransport(dapi)
  const hooks: RadarFixtureHooks = {
    breakLiveConnection: (net = 'mainnet') => dapi.breakConnection(net),
    restoreLiveConnection: (net = 'mainnet') => dapi.restoreConnection(net),
    dapiCalls: (method) => dapi.calls.filter((c) => c.method === method).length,
    refusedReads: (source) =>
      source === 'dapi'
        ? dapi.refused.filter((m) => m !== SHELL_TIP_STREAM).length
        : (refusedBySource[source] ?? 0),
    refusedDapiMethods: () => [...dapi.refused],
  }
  ;(window as unknown as { __radarFixtures: RadarFixtureHooks }).__radarFixtures = hooks
  const down = downFromSession()
  if (down.has('dapi')) for (const net of ['mainnet', 'testnet'] as const) dapi.breakConnection(net)
  setSdkTransport(() =>
    Promise.resolve(down.has('sdk') ? unreachableSdk : new FixtureSdkTransport()),
  )
  // The Core façade, so a spec can call it without a page that renders its answers.
  ;(window as unknown as { __radarCore: typeof core }).__radarCore = core
  ;(window as unknown as { __radarSdk: typeof sdk }).__radarSdk = sdk
  onFixtureMiss((request) => {
    fail(`no recorded fixture for ${request}`)
  })
  const refuse = (source: DownSource, pattern: string) =>
    http.all(pattern, ({ request }) => {
      const { pathname } = new URL(request.url)
      // A health probe is not a page reading the source.
      if (!pathname.endsWith('/status')) {
        countRefusal(source === 'pe' && pathname.endsWith('/rate') ? 'rate' : source)
      }
      return HttpResponse.error()
    })
  const refused = [...down].flatMap((source) =>
    source === 'sdk' || source === 'dapi'
      ? []
      : source === 'rate'
        ? HTTP_SOURCE_PATTERNS.pe.map((origin) => refuse(source, origin.replace(/\*$/, 'rate')))
        : HTTP_SOURCE_PATTERNS[source].map((pattern) => refuse(source, pattern)),
  )
  await setupWorker(...refused, ...fixtureHandlers, refuseUnrecorded).start({
    quiet: true,
    onUnhandledFrame: 'bypass',
  })
}
