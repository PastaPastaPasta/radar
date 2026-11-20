import { http, HttpResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { core } from '@/data/core/client'
import { setDapiTransport } from '@/data/dapi-core'
import { PROBE_FRAGMENT } from '@/data/http'
import { sdk, setSdkTransport, type SdkTransport } from '@/data/sdk/client'
import type { NetworkId } from '@/lib/network'
import { FixtureDapiTransport } from './dapi-transport'
import { FixtureSdkTransport } from './sdk-transport'
import { advancePlatformTip, cutPlatform } from './platform-tip'
import { addPlatformBlocks, fixtureHandlers, HTTP_SOURCE_PATTERNS, onFixtureMiss } from './handlers'

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
  /** Platform Explorer's newest-blocks list answers with `n` blocks on top of the recorded ones from the next read on. */
  addPlatformBlocks(n: number): void
  /** The SDK's current-epoch read and DAPI's validator sets answer `n` more blocks on, each `blockMs` apart, every turn taken. */
  advancePlatformTip(n: number, blockMs?: number): void
  /** Every SDK call and DAPI validator-set read fails while `down`, as with no evonode reachable. */
  cutPlatform(down: boolean): void
  /** Every `/assets/` file not loaded yet (whose path holds `only`, when given) answers as gone (`missing`) or as broken JavaScript, until the `radar.fixture.chunks` key is removed. */
  failNewChunks(mode: 'missing' | 'broken', only?: string): void
}

/** `sessionStorage` key a spec sets before the page loads: `{ [txid]: { instantLocked } }`, transactions to answer as unmined. */
export const FIXTURE_UNMINED_KEY = 'radar.fixture.unmined'

/**
 * `sessionStorage` key a spec sets before the page loads: a JSON array of the sources to answer as down, from
 * `radar`, `pe`, `hyphen`, `insight`, `sdk` and `dapi`. HTTP sources fail at the network, the SDK refuses every call
 * and the DAPI pool is cut, so a page shows what it does when that backend is gone.
 */
export const FIXTURE_DOWN_KEY = 'radar.fixture.down'

/**
 * `sessionStorage` key a spec sets before the page loads: a JSON array of ProTx hashes DAPI's masternode list leaves
 * out, as for a masternode that left the list after the recording was made.
 */
export const FIXTURE_LEFT_KEY = 'radar.fixture.mn-left'

function leftFromSession(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(FIXTURE_LEFT_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/**
 * `sessionStorage` key `failNewChunks` sets: `{ mode, known }`. Every `/assets/` file the page had not loaded when it was
 * set answers as gone (404, as after a deploy) or, for its scripts, as broken JavaScript, across reloads, until the key is removed.
 */
export const FIXTURE_CHUNKS_KEY = 'radar.fixture.chunks'

interface ChunkFailure {
  mode: 'missing' | 'broken'
  known: string[]
  /** Only files whose path holds this fail, such as one page's chunks. */
  only?: string
}

function chunkFailureFromSession(): ChunkFailure | undefined {
  try {
    const raw = sessionStorage.getItem(FIXTURE_CHUNKS_KEY)
    return raw ? (JSON.parse(raw) as ChunkFailure) : undefined
  } catch {
    return undefined
  }
}

const failingChunks = http.get('/assets/*', ({ request }) => {
  const failing = chunkFailureFromSession()
  const { pathname } = new URL(request.url)
  if (!failing || failing.known.includes(pathname)) return undefined
  if (failing.only && !pathname.includes(failing.only)) return undefined
  if (failing.mode === 'broken' && !pathname.endsWith('.js')) return undefined
  return failing.mode === 'missing'
    ? new HttpResponse('Not found', { status: 404 })
    : new HttpResponse('export default (', { headers: { 'content-type': 'text/javascript' } })
})

function failNewChunks(mode: ChunkFailure['mode'], only?: string): void {
  const known = performance
    .getEntriesByType('resource')
    .map((e) => new URL(e.name).pathname)
    .filter((p) => p.startsWith('/assets/'))
  sessionStorage.setItem(FIXTURE_CHUNKS_KEY, JSON.stringify({ mode, known, only }))
}

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
    addPlatformBlocks,
    advancePlatformTip,
    cutPlatform,
    failNewChunks,
  }
  ;(window as unknown as { __radarFixtures: RadarFixtureHooks }).__radarFixtures = hooks
  const down = downFromSession()
  if (down.has('dapi')) for (const net of ['mainnet', 'testnet'] as const) dapi.breakConnection(net)
  setSdkTransport(() =>
    Promise.resolve(down.has('sdk') ? unreachableSdk : new FixtureSdkTransport()),
  )
  const left = leftFromSession()
  if (left.length > 0) {
    const list = core.masternodeList.bind(core)
    core.masternodeList = async (net, signal) => {
      const answer = await list(net, signal)
      const kept = new Map(answer.data)
      for (const protx of left) kept.delete(protx)
      return { ...answer, data: kept }
    }
  }
  // The Core façade, so a spec can call it without a page that renders its answers.
  ;(window as unknown as { __radarCore: typeof core }).__radarCore = core
  ;(window as unknown as { __radarSdk: typeof sdk }).__radarSdk = sdk
  onFixtureMiss((request) => {
    fail(`no recorded fixture for ${request}`)
  })
  const refuse = (source: DownSource, pattern: string) =>
    http.all(pattern, ({ request }) => {
      const { pathname, hash } = new URL(request.url)
      // A health probe is not a page reading the source; a page reading /status is.
      if (hash !== PROBE_FRAGMENT) {
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
  await setupWorker(failingChunks, ...refused, ...fixtureHandlers, refuseUnrecorded).start({
    quiet: true,
    onUnhandledFrame: 'bypass',
  })
}
