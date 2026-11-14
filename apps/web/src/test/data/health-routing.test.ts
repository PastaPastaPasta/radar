import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { setActiveNetwork } from '@/data/active-network'
import { healthRegistry } from '@/data/health'
import { healthQueries } from '@/data/health-queries'
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

describe('hyphen probe lag', () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

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
