import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { fixtureBody } from '@/test/fixtures/load'
import { server } from '@/test/server'
import { healthRegistry } from '@/data/health'
import { radar } from '@/data/radar/client'

const BASE = 'https://radar.dashhq.org/api/v1'
const EVO = 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff'

const MODIFIED = Date.UTC(2026, 10, 10, 12, 0, 0)
const modifiedHeader = { 'last-modified': new Date(MODIFIED).toUTCString() }

async function serve(
  source: string,
  net: string,
  slug: string,
  url: string,
  headers: Record<string, string> = {},
  edit: (body: Record<string, unknown>) => void = () => undefined,
) {
  const body = await fixtureBody<Record<string, unknown>>(source, net, slug)
  edit(body)
  server.use(http.get(url, () => HttpResponse.json(body, { headers })))
}

type Call = () => Promise<{ asOf: number; fetchedAt: number }>

/** Resources with no time field of their own, plus ones whose time fields are event times. */
const CASES: { name: string; arrange: (h: Record<string, string>) => Promise<void>; call: Call }[] =
  [
    {
      name: 'releases',
      arrange: (h) => serve('radar', 'global', 'releases', `${BASE}/releases`, h),
      call: () => radar.releases(),
    },
    {
      name: 'health',
      arrange: (h) => serve('radar', 'global', 'health', `${BASE}/health`, h),
      call: () => radar.health(),
    },
    {
      name: 'geo',
      arrange: (h) => serve('radar', 'mainnet', 'geo', `${BASE}/mainnet/geo`, h),
      call: () => radar.geo('mainnet'),
    },
    {
      name: 'masternodes',
      arrange: (h) => serve('radar', 'mainnet', 'masternodes', `${BASE}/mainnet/masternodes`, h),
      call: () => radar.masternodes('mainnet'),
    },
    {
      name: 'masternode (last_seen is an event time)',
      arrange: (h) =>
        serve(
          'radar',
          'mainnet',
          `masternodes__${EVO}`,
          `${BASE}/mainnet/masternodes/${EVO}`,
          h,
          (b) => {
            b.last_seen = 1_000
          },
        ),
      call: () => radar.masternode('mainnet', EVO),
    },
    {
      name: 'payments',
      arrange: (h) =>
        serve(
          'radar',
          'mainnet',
          `masternodes__${EVO}__payments--limit-10`,
          `${BASE}/mainnet/masternodes/${EVO}/payments`,
          h,
        ),
      call: () => radar.payments('mainnet', EVO, { limit: 10 }),
    },
    {
      name: 'mnBench',
      arrange: (h) =>
        serve(
          'radar',
          'mainnet',
          `masternodes__${EVO}__bench`,
          `${BASE}/mainnet/masternodes/${EVO}/bench`,
          h,
        ),
      call: () => radar.mnBench('mainnet', EVO),
    },
    {
      name: 'changes (the newest change is an event time)',
      arrange: (h) =>
        serve('radar', 'mainnet', 'changes', `${BASE}/mainnet/changes`, h, (b) => {
          b.changes = [
            {
              ts: 5,
              height: 1,
              protx: EVO,
              type: 'Evo',
              field: 'service',
              old: null,
              new: 'x',
            },
          ]
        }),
      call: () => radar.changes('mainnet'),
    },
    {
      name: 'history (the last bucket is an event time)',
      arrange: (h) =>
        serve(
          'radar',
          'mainnet',
          'history--days-30,dim-totals,scope-all',
          `${BASE}/mainnet/history`,
          h,
          (b) => {
            b.t = [1, 2]
            b.series = []
          },
        ),
      call: () => radar.history('mainnet', { dim: 'totals' }),
    },
  ]

describe('radar asOf is when the document was true, not the age of its newest event', () => {
  it.each(CASES)('$name uses Last-Modified when the response has it', async ({ arrange, call }) => {
    await arrange(modifiedHeader)
    const out = await call()
    expect(out.asOf).toBe(MODIFIED)
  })

  it.each(CASES)('$name falls back to the time it was fetched', async ({ arrange, call }) => {
    await arrange({})
    const before = Date.now()
    const out = await call()
    expect(out.asOf).toBe(out.fetchedAt)
    expect(out.asOf).toBeGreaterThanOrEqual(before)
  })

  it('summary, platform and activation keep their crawl and publish time fields', async () => {
    const summary = await radar.summary('mainnet')
    expect(summary.asOf).toBe(summary.data.crawl.finished)
    const platform = await radar.platform('mainnet')
    expect(platform.asOf).toBe(platform.data.now.updated)
    const activation = await radar.activation('mainnet')
    expect(activation.asOf).toBe(activation.data.updated)
  })
})

describe('radar status', () => {
  it('is stamped with the requested network, not the newest of both', async () => {
    const body = await fixtureBody<{
      networks: Record<'mainnet' | 'testnet', { chain: { updated: number } }>
    }>('radar', 'global', 'status')
    const main = await radar.status(undefined, 'mainnet')
    const test = await radar.status(undefined, 'testnet')
    expect(main.asOf).toBe(body.networks.mainnet.chain.updated * 1000)
    expect(test.asOf).toBe(body.networks.testnet.chain.updated * 1000)
    expect(main.asOf).not.toBe(test.asOf)
  })

  it('reports to the requested network and sets the crawl lag for both', async () => {
    await radar.status(undefined, 'testnet')
    expect(healthRegistry.get('testnet', 'radar').lastOkAt).toBeDefined()
    expect(healthRegistry.get('mainnet', 'radar').lastOkAt).toBeUndefined()
    expect(healthRegistry.get('mainnet', 'radar').lag?.detail).toMatch(/^last crawl finished/)
    expect(healthRegistry.get('testnet', 'radar').lag?.detail).toMatch(/^last crawl finished/)
  })

  it('is unavailable on a devnet without a request', async () => {
    await expect(radar.status(undefined, 'devnet-ruby')).rejects.toMatchObject({
      kind: 'unavailable',
    })
  })
})
