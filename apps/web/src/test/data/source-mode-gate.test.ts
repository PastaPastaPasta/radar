import { QueryClient } from '@tanstack/query-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HOSTED_SOURCES, sourceInUse, sourceOff } from '@/data/endpoints'
import { isDisabledByMode, isSourceError, type SourceError } from '@/data/errors'
import { healthRegistry } from '@/data/health'
import { healthQueries } from '@/data/health-queries'
import { fetchSourced } from '@/data/http'
import { hyphen } from '@/data/hyphen/client'
import { hyQueries } from '@/data/hyphen/queries'
import { insight } from '@/data/insight/client'
import { pe } from '@/data/pe/client'
import { peQueries } from '@/data/pe/queries'
import {
  createQueryClientConfig,
  hostedSourceOfKey,
  prefetchItem,
  resetForSourceMode,
  watchSourceMode,
} from '@/data/query'
import { radar } from '@/data/radar/client'
import { radarQueries } from '@/data/radar/queries'
import { rate } from '@/data/rate/client'
import { rateQueries } from '@/data/rate/queries'
import { coreQueries } from '@/data/core/queries'
import { setSourceModeFromLink, writeSourceMode } from '@/lib/source-mode'
import { server } from '@/test/server'

const ADDRESS = 'XuUGDZHrKLo841CyamDbG5W7n59epA71h2'
const TXID = 'a'.repeat(64)

const failure = async (p: Promise<unknown>): Promise<SourceError> => {
  try {
    await p
  } catch (e) {
    if (isSourceError(e)) return e
    throw e
  }
  throw new Error('expected a SourceError')
}

/** Every request the app tries to send, whoever would have answered it. */
function watchRequests(): string[] {
  const seen: string[] = []
  server.events.on('request:start', ({ request }) => {
    seen.push(request.url)
  })
  return seen
}

beforeEach(() => {
  writeSourceMode('decentralized')
})
afterEach(() => {
  server.events.removeAllListeners()
  writeSourceMode('all')
  setSourceModeFromLink(undefined)
  vi.restoreAllMocks()
})

describe('Decentralized only mode: the gate in each hosted client @X-05 @X-09', () => {
  const calls: [string, () => Promise<unknown>][] = [
    ['radar: status', () => radar.status(undefined, 'mainnet')],
    ['radar: summary', () => radar.summary('mainnet')],
    ['radar: geo', () => radar.geo('testnet')],
    ['radar: masternode', () => radar.masternode('mainnet', TXID)],
    ['pe: status', () => pe.status('mainnet')],
    ['pe: epoch', () => pe.epoch('testnet')],
    ['hyphen: status', () => hyphen.status('mainnet')],
    ['hyphen: address', () => hyphen.address('mainnet', ADDRESS)],
    ['hyphen: tx', () => hyphen.tx('testnet', TXID)],
    ['hyphen: mempool', () => hyphen.mempool('mainnet')],
    ['hyphen: search', () => hyphen.search('mainnet', ADDRESS)],
    ['hyphen: stream', () => hyphen.stream('mainnet')],
    ['insight: status', () => insight.status('mainnet')],
    ['insight: address', () => insight.address('testnet', ADDRESS)],
    ['insight: tx', () => insight.tx('mainnet', TXID)],
    ['rate: usd', () => rate.usd()],
  ]

  it.each(calls)('%s refuses before any request', async (name, call) => {
    const requests = watchRequests()
    const fetched = vi.spyOn(globalThis, 'fetch')
    const error = await failure(call())
    expect(error.kind).toBe('disabled-by-mode')
    expect(error.source).toBe(name.split(':')[0])
    expect(isDisabledByMode(error)).toBe(true)
    expect(fetched).not.toHaveBeenCalled()
    expect(requests).toEqual([])
  })

  it.each(HOSTED_SOURCES)('fetchSourced refuses %s and leaves its health alone', async (source) => {
    const fetched = vi.spyOn(globalThis, 'fetch')
    const error = await failure(
      fetchSourced({
        source,
        net: 'mainnet',
        url: 'https://example.test/x',
        schema: z.unknown(),
      }),
    )
    expect(error).toMatchObject({ source, kind: 'disabled-by-mode' })
    expect(fetched).not.toHaveBeenCalled()
    expect(healthRegistry.get('mainnet', source).state).toBe('unknown')
    expect(healthRegistry.get('mainnet', source).lastError).toBeUndefined()
  })

  it('says a refusal is the mode, not an outage', async () => {
    const error = await failure(hyphen.status('mainnet'))
    expect(error.message).toMatch(/Decentralized only/)
    expect(error.message).not.toMatch(/answer|unreachable|down/i)
  })

  it('answers again as soon as the mode is switched off', async () => {
    writeSourceMode('all')
    const status = await hyphen.status('mainnet')
    expect(status.source).toBe('hyphen')
  })

  it('is switched on by the link as well as by the remembered choice', async () => {
    writeSourceMode('all')
    expect(sourceOff('hyphen')).toBe(false)
    setSourceModeFromLink('decentralized')
    expect(sourceOff('hyphen')).toBe(true)
    expect((await failure(pe.status('mainnet'))).kind).toBe('disabled-by-mode')
  })

  it('never turns DAPI, the SDK or the browser off', () => {
    for (const source of ['dapi', 'sdk', 'local'] as const) expect(sourceOff(source)).toBe(false)
    for (const source of HOSTED_SOURCES) {
      expect(sourceOff(source)).toBe(true)
      expect(sourceInUse('mainnet', source)).toBe(false)
    }
  })
})

describe('Decentralized only mode: queries, prefetches and the cache @X-05 @X-09', () => {
  const client = () => new QueryClient(createQueryClientConfig())

  it('names the hosted source a key reads, and its freshness probe', () => {
    expect(hostedSourceOfKey(hyQueries.mempool('mainnet').queryKey)).toBe('hyphen')
    expect(hostedSourceOfKey(peQueries.status('testnet').queryKey)).toBe('pe')
    expect(hostedSourceOfKey(radarQueries.summary('mainnet').queryKey)).toBe('radar')
    expect(hostedSourceOfKey(rateQueries.usd().queryKey)).toBe('rate')
    expect(hostedSourceOfKey(healthQueries.insight('mainnet').queryKey)).toBe('insight')
    expect(hostedSourceOfKey(coreQueries.tip('mainnet').queryKey)).toBeUndefined()
  })

  it('fails a hosted query at once with the mode error, without running it or retrying', async () => {
    const queryFn = vi.fn()
    const c = client()
    const error = await failure(c.fetchQuery({ ...hyQueries.mempool('mainnet'), queryFn }))
    expect(error.kind).toBe('disabled-by-mode')
    expect(queryFn).not.toHaveBeenCalled()
    const state = c.getQueryState(hyQueries.mempool('mainnet').queryKey)
    expect(state?.fetchFailureCount).toBe(1)
  })

  it('does not run a freshness probe, so an index is never measured against DAPI either', async () => {
    const requests = watchRequests()
    const error = await failure(client().fetchQuery(healthQueries.hyphen('mainnet')))
    expect(error).toMatchObject({ source: 'hyphen', kind: 'disabled-by-mode' })
    expect(requests).toEqual([])
  })

  it('starts no prefetch of a hosted source', async () => {
    const c = client()
    const prefetch = vi.spyOn(c, 'prefetchQuery')
    await prefetchItem('http', radarQueries.summary('mainnet')).start(c)
    await prefetchItem('http', peQueries.status('mainnet')).start(c)
    await prefetchItem('http', healthQueries.hyphen('mainnet')).start(c)
    expect(prefetch).not.toHaveBeenCalled()
    expect(c.getQueryCache().getAll()).toHaveLength(0)
  })

  it('drops what was read under the other mode, so nothing a hosted source said stays on screen', async () => {
    writeSourceMode('all')
    const c = client()
    await c.fetchQuery(hyQueries.mempool('mainnet'))
    expect(c.getQueryData(hyQueries.mempool('mainnet').queryKey)).toBeDefined()
    expect(healthRegistry.get('mainnet', 'hyphen').state).toBe('ok')

    const stop = watchSourceMode(c)
    writeSourceMode('decentralized')
    expect(c.getQueryData(hyQueries.mempool('mainnet').queryKey)).toBeUndefined()
    expect(healthRegistry.get('mainnet', 'hyphen').state).toBe('unknown')
    stop()
  })

  it('resets once per change of the mode in force, not per change of the remembered choice or the link', () => {
    writeSourceMode('all')
    const c = client()
    const reset = vi.spyOn(c, 'resetQueries')
    const stop = watchSourceMode(c)
    writeSourceMode('decentralized')
    expect(reset).toHaveBeenCalledTimes(1)
    writeSourceMode('decentralized')
    setSourceModeFromLink('decentralized')
    setSourceModeFromLink(undefined)
    writeSourceMode('decentralized')
    expect(reset).toHaveBeenCalledTimes(1)
    setSourceModeFromLink('decentralized')
    writeSourceMode('all')
    expect(reset).toHaveBeenCalledTimes(1)
    setSourceModeFromLink(undefined)
    expect(reset).toHaveBeenCalledTimes(2)
    stop()
  })

  it('keeps DAPI and SDK answers, and drops everything a hosted source could have answered', () => {
    writeSourceMode('all')
    const c = client()
    const own = { source: 'dapi', data: 1 }
    c.setQueryData(['mainnet', 'sdk', 'platform-status'], { source: 'sdk', data: 1 })
    c.setQueryData(['mainnet', 'dapi', 'tip'], own)
    c.setQueryData(['mainnet', 'dapi', 'headers', { from: 1, count: 2 }], own)
    c.setQueryData(['mainnet', 'dapi', 'tx', { txid: 'a' }], own)
    c.setQueryData(['mainnet', 'dapi', 'block', 'h1'], own)
    c.setQueryData(['mainnet', 'dapi', 'status'], { source: 'dapi', data: 1, fallback: 'budget' })
    c.setQueryData(['mainnet', 'dapi', 'chainlock'], { source: 'hyphen', data: 1 })
    c.setQueryData(['mainnet', 'view', 'tx-utxos'], { found: 1 })
    c.setQueryData(['mainnet', 'hyphen', 'mempool'], { source: 'hyphen', data: 1 })
    resetForSourceMode(c)
    const kept = (...key: unknown[]) => c.getQueryData(key)
    expect(kept('mainnet', 'sdk', 'platform-status')).toBeDefined()
    expect(kept('mainnet', 'dapi', 'tip')).toBeDefined()
    expect(kept('mainnet', 'dapi', 'headers', { from: 1, count: 2 })).toBeDefined()
    for (const key of [
      ['mainnet', 'dapi', 'tx', { txid: 'a' }],
      ['mainnet', 'dapi', 'block', 'h1'],
      ['mainnet', 'dapi', 'status'],
      ['mainnet', 'dapi', 'chainlock'],
      ['mainnet', 'view', 'tx-utxos'],
      ['mainnet', 'hyphen', 'mempool'],
    ])
      expect(kept(...key)).toBeUndefined()
  })

  it('resets every query a hosted answer could sit under', () => {
    writeSourceMode('all')
    const c = client()
    c.setQueryData(['mainnet', 'view', 'tx-utxos'], { found: 1 })
    c.setQueryData(['mainnet', 'dapi', 'tx'], { source: 'hyphen', data: 1 })
    resetForSourceMode(c)
    expect(c.getQueryData(['mainnet', 'view', 'tx-utxos'])).toBeUndefined()
    expect(c.getQueryData(['mainnet', 'dapi', 'tx'])).toBeUndefined()
  })
})
