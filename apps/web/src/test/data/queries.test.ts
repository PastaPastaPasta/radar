import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { fixture } from '@/test/fixtures/load'
import { healthQueries, HEALTH_PROBE_INTERVAL_MS } from '@/data/health-queries'
import { healthRegistry } from '@/data/health'
import { hyQueries } from '@/data/hyphen/queries'
import { peQueries } from '@/data/pe/queries'
import { radarQueries } from '@/data/radar/queries'

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe('query options', () => {
  it('radar summary is keyed per network and cached as crawl data', () => {
    const q = radarQueries.summary('testnet')
    expect(q.queryKey).toEqual(['testnet', 'radar', 'summary'])
    expect(q.staleTime).toBeGreaterThan(0)
  })

  it('hyphen detail keys are case-insensitive for hashes', () => {
    const upper = 'AB'.repeat(32)
    expect(hyQueries.tx('mainnet', upper).queryKey).toEqual(
      hyQueries.tx('mainnet', upper.toLowerCase()).queryKey,
    )
  })

  it('list queries carry their parameters in the key', () => {
    const a = hyQueries.blocks('mainnet', { limit: 20 }).queryKey
    const b = hyQueries.blocks('mainnet', { limit: 50 }).queryKey
    expect(a).not.toEqual(b)
  })

  it('PE queries use the pe source', () => {
    expect(peQueries.status('mainnet').queryKey.slice(0, 2)).toEqual(['mainnet', 'pe'])
  })

  it('queryFns run against the recorded fixtures', async () => {
    const c = client()
    const blocks = await c.fetchQuery(hyQueries.blocks('mainnet', { limit: 20 }))
    expect(blocks.data.items.length).toBeGreaterThan(0)
    const summary = await c.fetchQuery(radarQueries.summary('mainnet'))
    expect(summary.source).toBe('radar')
  })
})

describe('health probes', () => {
  it('refetch once a minute without retrying', () => {
    for (const q of [
      healthQueries.radar('mainnet'),
      healthQueries.pe('mainnet'),
      healthQueries.hyphen('mainnet'),
    ]) {
      expect(q.refetchInterval).toBe(HEALTH_PROBE_INTERVAL_MS)
      expect(q.retry).toBe(false)
      expect(q.queryKey[1]).toBe('health')
    }
  })

  it('the radar probe reports into the registry', async () => {
    const recorded = await fixture('radar', 'global', 'status')
    const body = recorded.body as { networks: { mainnet: { crawl: { last_finished: number } } } }
    vi.useFakeTimers({
      toFake: ['Date'],
      now: body.networks.mainnet.crawl.last_finished * 1000 + 10 * 60_000,
    })
    try {
      await client().fetchQuery(healthQueries.radar('mainnet'))
      expect(healthRegistry.get('mainnet', 'radar').state).toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })

  it('the hyphen probe measures lag against the radar tip', async () => {
    await client().fetchQuery(healthQueries.hyphen('testnet'))
    const h = healthRegistry.get('testnet', 'hyphen')
    expect(h.lag?.blocks).toBeGreaterThan(0)
  })
})
