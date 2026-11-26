import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixture } from '@/test/fixtures/load'
import { server } from '@/test/server'
import { setActiveNetwork } from '@/data/active-network'
import { enableEarlyAnswers } from '@/data/early'
import { healthRegistry } from '@/data/health'
import { CRAWL_TIP_GRACE_MS, CRAWL_TIP_MAX_AGE_MS, healthQueries } from '@/data/health-queries'
import { PROBE_FRAGMENT } from '@/data/http'
import { radar } from '@/data/radar/client'
import { rate } from '@/data/rate/client'

afterEach(() => setActiveNetwork('mainnet'))

describe('global calls report to the active network', () => {
  it.each([
    ['radar health', () => radar.health(), 'radar'],
    ['radar releases', () => radar.releases(), 'radar'],
    ['rate', () => rate.usd(), 'rate'],
  ] as const)('%s is seen by useSourceHealth on testnet', async (_name, call, source) => {
    setActiveNetwork('testnet')
    await call()
    expect(healthRegistry.get('testnet', source).state).not.toBe('unknown')
    expect(healthRegistry.get('mainnet', source).state).toBe('unknown')
  })

  it('still reports to mainnet when mainnet is active', async () => {
    await rate.usd()
    expect(healthRegistry.get('mainnet', 'rate').state).toBe('ok')
    expect(healthRegistry.get('testnet', 'rate').state).toBe('unknown')
  })
})

interface CrawlChain {
  blocks: number
  synced: boolean
  updated: number
  error: string | null
}
interface RecordedStatus {
  networks: Record<'mainnet' | 'testnet', { chain: CrawlChain }>
}

describe('hyphen probe lag', () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let recorded: RecordedStatus
  beforeEach(async () => {
    recorded = (await fixture('radar', 'global', 'status')).body as RecordedStatus
    // The crawl's reading of the chain is a minute old, as it is when the crawler is keeping up.
    vi.useFakeTimers({
      toFake: ['Date'],
      now: recorded.networks.testnet.chain.updated * 1000 + 60_000,
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    server.resetHandlers()
  })

  const crawlSays = (chain: Partial<CrawlChain>) => {
    const body = structuredClone(recorded)
    Object.assign(body.networks.testnet.chain, chain)
    server.use(http.get('https://radar.dashhq.org/api/v1/status', () => HttpResponse.json(body)))
  }

  it.each<[string, (now: number) => Partial<CrawlChain>]>([
    ['its node is not synced', () => ({ synced: false })],
    ['it reports an error', () => ({ error: 'dashd: connection refused' })],
    [
      'its reading of the chain is too old',
      (now) => ({ updated: (now - CRAWL_TIP_MAX_AGE_MS - 1_000) / 1000 }),
    ],
  ])('takes no reference from the crawl when %s', async (_, chain) => {
    const c = client()
    await c.fetchQuery(healthQueries.hyphen('testnet'))
    expect(healthRegistry.get('testnet', 'hyphen').lag?.blocks).toBeGreaterThan(0)
    crawlSays(chain(Date.now()))
    await c.fetchQuery({ ...healthQueries.hyphen('testnet'), staleTime: 0 })
    expect(healthRegistry.get('testnet', 'hyphen').lag).toBeUndefined()
  })

  it('asks radar nothing when DAPI gives the tip in time', async () => {
    const { core } = await import('@/data/core/client')
    const tip = vi.spyOn(core, 'tip').mockResolvedValue({
      data: { height: recorded.networks.testnet.chain.blocks, hash: '00'.repeat(32), time: 0 },
      source: 'dapi',
      asOf: Date.now(),
      fetchedAt: Date.now(),
      proved: false,
    })
    const asked = vi.fn()
    server.use(
      http.get('https://radar.dashhq.org/api/v1/status', () => {
        asked()
        return HttpResponse.json(recorded)
      }),
    )
    enableEarlyAnswers()
    try {
      await client().fetchQuery(healthQueries.hyphen('testnet'))
      expect(tip).toHaveBeenCalled()
      expect(asked).not.toHaveBeenCalled()
      expect(healthRegistry.get('testnet', 'hyphen').lag?.blocks).toBeGreaterThan(0)
    } finally {
      enableEarlyAnswers(false)
      tip.mockRestore()
    }
  })

  it('asks radar at once when DAPI has no tip, and only after the grace period when DAPI is slow', async () => {
    const { core } = await import('@/data/core/client')
    const asked = vi.fn()
    server.use(
      http.get('https://radar.dashhq.org/api/v1/status', () => {
        asked()
        return HttpResponse.json(recorded)
      }),
    )
    enableEarlyAnswers()
    const failing = vi.spyOn(core, 'tip').mockRejectedValue(new Error('no DAPI'))
    try {
      await client().fetchQuery(healthQueries.hyphen('testnet'))
      expect(asked).toHaveBeenCalledTimes(1)
      failing.mockRestore()

      asked.mockClear()
      let answer: (v: Awaited<ReturnType<typeof core.tip>>) => void = () => undefined
      const slow = vi.spyOn(core, 'tip').mockReturnValue(new Promise((r) => (answer = r)))
      const probe = client().fetchQuery(healthQueries.hyphen('testnet'))
      await new Promise((r) => setTimeout(r, CRAWL_TIP_GRACE_MS / 3))
      expect(asked).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(1), {
        timeout: CRAWL_TIP_GRACE_MS * 3,
      })
      answer({
        data: { height: recorded.networks.testnet.chain.blocks, hash: '00'.repeat(32), time: 0 },
        source: 'dapi',
        asOf: Date.now(),
        fetchedAt: Date.now(),
        proved: false,
      })
      await probe
      expect(healthRegistry.get('testnet', 'hyphen').lag?.blocks).toBeGreaterThan(0)
      slow.mockRestore()
    } finally {
      enableEarlyAnswers(false)
      vi.restoreAllMocks()
    }
  })

  it('is measured against radar, and its claim is cleared (its state kept) when radar cannot be read', async () => {
    const c = client()
    await c.fetchQuery(healthQueries.hyphen('testnet'))
    expect(healthRegistry.get('testnet', 'hyphen').lag?.blocks).toBeGreaterThan(0)

    server.use(
      http.get('https://radar.dashhq.org/api/v1/status', () =>
        HttpResponse.json({ error: 'down' }, { status: 502 }),
      ),
    )
    await c.fetchQuery({ ...healthQueries.hyphen('testnet'), staleTime: 0 })
    expect(healthRegistry.get('testnet', 'hyphen').lag).toBeUndefined()
    // Nothing to measure against, so the state decided before stands.
    expect(healthRegistry.get('testnet', 'hyphen').state).toBe('stale')
  })
})

describe('probe tagging', () => {
  const seen = async (read: () => Promise<unknown>): Promise<string[]> => {
    const real = globalThis.fetch
    const urls: string[] = []
    globalThis.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/status')) urls.push(url)
      return real(input, init)
    }
    try {
      await read()
    } finally {
      globalThis.fetch = real
    }
    return urls
  }

  it('marks the requests a health probe makes, and only those', async () => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const probes = await seen(() => c.fetchQuery(healthQueries.radar('mainnet')))
    expect(probes.length).toBeGreaterThan(0)
    expect(probes.every((u) => u.endsWith(PROBE_FRAGMENT))).toBe(true)

    const reads = await seen(() => radar.status(undefined, 'mainnet'))
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.some((u) => u.includes('#'))).toBe(false)
  })
})
