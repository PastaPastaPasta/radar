import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { fixtureBody } from '@/test/fixtures/load'
import { server } from '@/test/server'
import { setActiveNetwork } from '@/data/active-network'
import { healthRegistry } from '@/data/health'
import { radar } from '@/data/radar/client'

const BASE = 'https://radar.dashhq.org/api/v1'
const EVO = 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff'
const BANNED = 'a8355582b280be9452f939d34637ab82226ba2c97e1aac15eaf6db878fec0130'

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

interface Timed {
  asOf: number
  fetchedAt: number
  asOfFetched?: true
}
type Call = () => Promise<Timed>

/** Resources whose documents carry no crawl time: a time field in them would be an event time. */
const UNTIMED: {
  name: string
  arrange: (h: Record<string, string>) => Promise<void>
  call: Call
}[] = [
  {
    name: 'releases',
    arrange: (h) => serve('radar', 'global', 'releases', `${BASE}/releases`, h),
    call: () => radar.releases(),
  },
  {
    name: 'geo',
    arrange: (h) => serve('radar', 'mainnet', 'geo', `${BASE}/mainnet/geo`, h),
    call: () => radar.geo('mainnet'),
  },
  {
    name: 'a banned masternode, which was never reached',
    arrange: (h) =>
      serve(
        'radar',
        'mainnet',
        `masternodes__${BANNED}`,
        `${BASE}/mainnet/masternodes/${BANNED}`,
        h,
      ),
    call: () => radar.masternode('mainnet', BANNED),
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
    name: 'changes',
    arrange: (h) => serve('radar', 'mainnet', 'changes', `${BASE}/mainnet/changes`, h),
    call: () => radar.changes('mainnet'),
  },
  {
    name: 'history',
    arrange: (h) =>
      serve(
        'radar',
        'mainnet',
        'history--days-30,dim-totals,scope-all',
        `${BASE}/mainnet/history`,
        h,
      ),
    call: () => radar.history('mainnet', { dim: 'totals' }),
  },
]

describe('radar asOf without a time field in the document', () => {
  it.each(UNTIMED)('$name is stamped as fetched', async ({ arrange, call }) => {
    await arrange({})
    const before = Date.now()
    const out = await call()
    expect(out.asOf).toBe(out.fetchedAt)
    expect(out.asOf).toBeGreaterThanOrEqual(before)
    expect(out.asOfFetched).toBe(true)
  })

  it.each(UNTIMED)(
    '$name uses Last-Modified if the server ever sends it',
    async ({ arrange, call }) => {
      await arrange(modifiedHeader)
      const out = await call()
      expect(out.asOf).toBe(MODIFIED)
      expect(out.asOfFetched).toBeUndefined()
    },
  )
})

afterEach(() => setActiveNetwork('mainnet'))

describe('radar asOf from the crawl the document was built from', () => {
  it('health is the age of the active network’s crawl', async () => {
    const body = await fixtureBody<{ age_secs: Record<string, { crawl: number }> }>(
      'radar',
      'global',
      'health',
    )
    const before = Date.now()
    const out = await radar.health()
    const age = (body.age_secs.mainnet?.crawl ?? 0) * 1000
    expect(out.asOf).toBeGreaterThanOrEqual(before - age)
    expect(out.asOf).toBeLessThanOrEqual(out.fetchedAt - age)
    expect(out.asOfFetched).toBeUndefined()
  })

  it('health on a devnet takes the older of the two crawls', async () => {
    setActiveNetwork('devnet-ruby')
    server.use(
      http.get(`${BASE}/health`, () =>
        HttpResponse.json({
          ok: true,
          age_secs: { mainnet: { crawl: 100, chain: 5 }, testnet: { crawl: 900, chain: 5 } },
        }),
      ),
    )
    const out = await radar.health()
    expect(Math.round((out.fetchedAt - out.asOf) / 1000)).toBe(900)
  })

  it('health without a crawl age falls back to Last-Modified, then to the fetch', async () => {
    server.use(http.get(`${BASE}/health`, () => HttpResponse.json({ ok: true })))
    const bare = await radar.health()
    expect(bare.asOf).toBe(bare.fetchedAt)
    expect(bare.asOfFetched).toBe(true)

    server.use(
      http.get(`${BASE}/health`, () =>
        HttpResponse.json({ ok: true }, { headers: modifiedHeader }),
      ),
    )
    expect((await radar.health()).asOf).toBe(MODIFIED)
  })

  it('the masternode list is as old as the newest node the crawler reached', async () => {
    const body = await fixtureBody<{ masternodes: { last_seen: number | null }[] }>(
      'radar',
      'mainnet',
      'masternodes',
    )
    const newest = Math.max(...body.masternodes.map((m) => m.last_seen ?? 0)) * 1000
    const out = await radar.masternodes('mainnet')
    expect(out.asOf).toBe(newest)
    expect(out.asOfFetched).toBeUndefined()
  })

  it('a masternode carries no crawl time, so it is stamped as fetched, not by its last_seen', async () => {
    const body = await fixtureBody<{ last_seen: number }>('radar', 'mainnet', `masternodes__${EVO}`)
    const out = await radar.masternode('mainnet', EVO)
    expect(out.asOf).not.toBe(body.last_seen * 1000)
    expect(out.asOfFetched).toBe(true)
    expect(out.data?.last_seen).toBe(body.last_seen * 1000)
  })

  it('summary, platform, activation and bench keep their own time fields', async () => {
    const summary = await radar.summary('mainnet')
    expect(summary.asOf).toBe(summary.data.crawl.finished)
    const platform = await radar.platform('mainnet')
    expect(platform.asOf).toBe(platform.data.now.updated)
    const activation = await radar.activation('mainnet')
    expect(activation.asOf).toBe(activation.data.updated)
    const bench = await radar.bench('mainnet')
    expect(bench.asOf).toBe(Math.max(...bench.data.vantages.map((v) => v.updated)))
    for (const out of [summary, platform, activation, bench]) {
      expect(out.asOfFetched).toBeUndefined()
    }
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
