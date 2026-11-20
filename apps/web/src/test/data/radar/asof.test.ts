import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtureBody } from '@/test/fixtures/load'
import { server } from '@/test/server'
import { setActiveNetwork } from '@/data/active-network'
import { healthRegistry } from '@/data/health'
import { forgetCrawls, radar } from '@/data/radar/client'

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

/** Resources that are not built from a crawl and whose documents carry no time: a field in them would be an event time. */
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
    expect(out.asOf).toBe(out.fetchedAt - age)
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

  it('the masternode list is as old as the crawl that built it', async () => {
    const summary = await radar.summary('mainnet')
    const out = await radar.masternodes('mainnet')
    expect(out.asOf).toBe(summary.data.crawl.finished)
    expect(out.asOfFetched).toBeUndefined()
  })

  it('a masternode is stamped with the crawl, not with its last_seen', async () => {
    const body = await fixtureBody<{ last_seen: number }>('radar', 'mainnet', `masternodes__${EVO}`)
    const out = await radar.masternode('mainnet', EVO)
    const summary = await radar.summary('mainnet')
    expect(out.asOf).toBe(summary.data.crawl.finished)
    expect(out.asOf).not.toBe(body.last_seen * 1000)
    expect(out.asOfFetched).toBeUndefined()
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
  it('is stamped with the requested network’s crawl finish, not the newest of both', async () => {
    const body = await fixtureBody<{
      networks: Record<'mainnet' | 'testnet', { crawl: { last_finished: number } }>
    }>('radar', 'global', 'status')
    // The recorded times as they are, without the fixture server's replay of the chain reading's age.
    server.use(http.get(`${BASE}/status`, () => HttpResponse.json(body)))
    const main = await radar.status(undefined, 'mainnet')
    const test = await radar.status(undefined, 'testnet')
    expect(main.asOf).toBe(body.networks.mainnet.crawl.last_finished * 1000)
    expect(test.asOf).toBe(body.networks.testnet.crawl.last_finished * 1000)
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

describe('every document the crawl built carries the crawl’s finish time', () => {
  const crawlTimed: [string, () => Promise<Timed>][] = [
    ['summary', () => radar.summary('mainnet')],
    ['geo', () => radar.geo('mainnet')],
    ['masternodes', () => radar.masternodes('mainnet')],
    ['a masternode', () => radar.masternode('mainnet', EVO)],
    ['a banned masternode', () => radar.masternode('mainnet', BANNED)],
    ['changes', () => radar.changes('mainnet')],
    ['history', () => radar.history('mainnet', { dim: 'totals' })],
  ]

  it('gives one age on every page, whichever document is read first', async () => {
    const stamps = await Promise.all(crawlTimed.map(([, call]) => call()))
    expect(new Set(stamps.map((s) => s.asOf)).size).toBe(1)
    for (const s of stamps) expect(s.asOfFetched).toBeUndefined()
  })

  it('reads the crawl from the status when no document has named it yet', async () => {
    forgetCrawls()
    const status = await fixtureBody<{
      networks: { testnet: { crawl: { last_finished: number } } }
    }>('radar', 'global', 'status')
    server.use(
      http.get(`${BASE}/testnet/changes`, () => HttpResponse.json({ since: 1, changes: [] })),
    )
    const out = await radar.changes('testnet')
    expect(out.asOf).toBe(status.networks.testnet.crawl.last_finished * 1000)
  })

  it('asks the status again once the crawl time is older than a crawl @W2-13', async () => {
    forgetCrawls()
    const status = await fixtureBody<{
      networks: { testnet: { crawl: { last_finished: number } } }
    }>('radar', 'global', 'status')
    const first = status.networks.testnet.crawl.last_finished
    let finished = first
    server.use(
      http.get(`${BASE}/status`, () => {
        const body = structuredClone(status)
        body.networks.testnet.crawl.last_finished = finished
        return HttpResponse.json(body)
      }),
      http.get(`${BASE}/testnet/changes`, () => HttpResponse.json({ since: 1, changes: [] })),
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(first * 1000 + 60_000)
      expect((await radar.changes('testnet')).asOf).toBe(first * 1000)
      finished = first + 300
      vi.setSystemTime(first * 1000 + 2 * 60_000)
      expect((await radar.changes('testnet')).asOf, 'within a crawl').toBe(first * 1000)
      vi.setSystemTime(first * 1000 + 7 * 60_000)
      expect((await radar.changes('testnet')).asOf, 'a crawl later').toBe(finished * 1000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes a cold page’s summary of an older crawl for an earlier crawl, not the latest', async () => {
    forgetCrawls()
    const status = await fixtureBody<{
      networks: { mainnet: { crawl: { last_id: number; last_finished: number } } }
    }>('radar', 'global', 'status')
    const latest = status.networks.mainnet.crawl
    server.use(http.get(`${BASE}/status`, () => HttpResponse.json(status)))
    await serve('radar', 'mainnet', 'summary', `${BASE}/mainnet/summary`, {}, (body) => {
      const crawl = body.crawl as { id: number; finished: number }
      crawl.id = latest.last_id - 1
      crawl.finished = latest.last_finished - 900
    })
    const out = await radar.summary('mainnet')
    expect(out.radarTime).toBe('earlier-crawl')
    expect(out.asOf).toBe(out.data.crawl.finished)
  })

  it('keeps its own stamp when the crawl is unknown', async () => {
    forgetCrawls()
    server.use(
      http.get(`${BASE}/status`, () => HttpResponse.json({}, { status: 500 })),
      http.get(`${BASE}/testnet/geo`, () => HttpResponse.json({ points: [], unlocated: 0 })),
    )
    const out = await radar.geo('testnet')
    expect(out.asOf).toBe(out.fetchedAt)
    expect(out.asOfFetched).toBe(true)
  })

  it('an aborted reader does not take the crawl time from one still waiting', async () => {
    forgetCrawls()
    const status = await fixtureBody<{
      networks: { testnet: { crawl: { last_finished: number } } }
    }>('radar', 'global', 'status')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(`${BASE}/status`, async () => {
        await gate
        return HttpResponse.json(status)
      }),
      http.get(`${BASE}/testnet/geo`, async () => {
        await gate
        return HttpResponse.json({ points: [], unlocated: 0 })
      }),
      http.get(`${BASE}/testnet/changes`, () => HttpResponse.json({ since: 1, changes: [] })),
    )
    const ctrl = new AbortController()
    const geo = radar.geo('testnet', ctrl.signal)
    const changes = radar.changes('testnet')
    ctrl.abort()
    release()
    await expect(geo).rejects.toMatchObject({ kind: 'aborted' })
    const out = await changes
    expect(out.asOf).toBe(status.networks.testnet.crawl.last_finished * 1000)
    expect(out.asOfFetched).toBeUndefined()
  })
})
