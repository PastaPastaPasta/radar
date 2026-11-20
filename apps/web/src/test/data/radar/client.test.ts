import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtureBody } from '@/test/fixtures/load'
import { server } from '@/test/server'
import { isSourceError } from '@/data/errors'
import { healthRegistry } from '@/data/health'
import { forgetCrawls, radar } from '@/data/radar/client'

const BASE = 'https://radar.dashhq.org/api/v1'
const EVO = 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff'
const REGULAR = '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32'

afterEach(() => vi.useRealTimers())

describe('radar client', () => {
  it('status is global and stamped with the finish of the network’s latest crawl', async () => {
    const out = await radar.status(undefined, 'mainnet')
    expect(out.source).toBe('radar')
    expect(out.data.networks.mainnet.chain.blocks).toBeGreaterThan(2_000_000)
    expect(out.asOf).toBe(out.data.networks.mainnet.crawl.last_finished)
    expect(out.radarTime).toBe('crawl')
  })

  it('status sets crawl lag for both networks and turns stale past 30 minutes', async () => {
    const raw = await fixtureBody<{ networks: { mainnet: { crawl: { last_finished: number } } } }>(
      'radar',
      'global',
      'status',
    )
    const finished = raw.networks.mainnet.crawl.last_finished * 1000
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(finished + 10 * 60_000)
    await radar.status()
    expect(healthRegistry.get('mainnet', 'radar').state).toBe('ok')
    expect(healthRegistry.get('mainnet', 'radar').lag?.detail).toBe(
      'last crawl finished 10 minutes ago',
    )

    vi.setSystemTime(finished + 29 * 60_000)
    await radar.status()
    expect(healthRegistry.get('mainnet', 'radar').state).toBe('ok')

    vi.setSystemTime(finished + 31 * 60_000)
    await radar.status()
    expect(healthRegistry.get('mainnet', 'radar').state).toBe('stale')
  })

  it('health parses a 503 problem report', async () => {
    server.use(
      http.get(`${BASE}/health`, () =>
        HttpResponse.json({ ok: false, problems: ['mainnet crawl stale'] }, { status: 503 }),
      ),
    )
    const out = await radar.health()
    expect(out.data).toMatchObject({ ok: false, problems: ['mainnet crawl stale'] })
  })

  it('summary is stamped with the crawl time and tip height', async () => {
    const out = await radar.summary('mainnet')
    expect(out.asOf).toBe(out.data.crawl.finished)
    expect(out.height).toBe(out.data.crawl.tip_height)
    expect(out.data.dists.all?.version?.[0]).toEqual([expect.any(String), expect.any(Number)])
  })

  it('refuses devnets without a request', async () => {
    let e: unknown
    try {
      await radar.summary('devnet-ruby')
    } catch (error) {
      e = error
    }
    expect(isSourceError(e) && e.kind).toBe('unavailable')
  })

  it('history sends scope, days and top', async () => {
    const seen: string[] = []
    server.use(
      http.get(`${BASE}/mainnet/history`, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json({
          t: [1, 2],
          resolution: 'day',
          series: [{ key: 'a', values: [1, null] }],
        })
      }),
    )
    const out = await radar.history('mainnet', { dim: 'version', top: 8 })
    expect(seen).toEqual(['?dim=version&scope=all&days=30&top=8'])
    expect(out.data.t).toEqual([1000, 2000])
    expect(out.asOf).toBe((await radar.summary('mainnet')).data.crawl.finished)
  })

  it('history serves the recorded series', async () => {
    const out = await radar.history('mainnet', { dim: 'totals' })
    expect(out.data.series.map((s) => s.key)).toContain('masternodes')
  })

  it('masternodes unwraps the list', async () => {
    const out = await radar.masternodes('mainnet')
    expect(out.data.length).toBeGreaterThan(50)
    expect(out.data.every((m) => /^[0-9a-f]{64}$/.test(m.protx))).toBe(true)
    expect(out.data.some((m) => m.type === 'Evo')).toBe(true)
  })

  it('masternode detail carries registration, payments and platform rewards', async () => {
    const out = await radar.masternode('mainnet', EVO)
    expect(out.data).not.toBeNull()
    expect(out.data?.type).toBe('Evo')
    expect(out.data?.payments[0]?.amount_duffs).toBeTypeOf('bigint')
    expect(out.data?.platform_rewards?.totals?.lifetime).toBeTypeOf('bigint')
  })

  it('masternode lower-cases a protx before building the URL', async () => {
    const out = await radar.masternode('mainnet', REGULAR.toUpperCase())
    expect(out.data?.protx).toBe(REGULAR)
  })

  it('unknown masternode resolves to Sourced<null>', async () => {
    const out = await radar.masternode('mainnet', '0'.repeat(64))
    expect(out.data).toBeNull()
    expect(out.source).toBe('radar')
  })

  it('payments pass before and limit through', async () => {
    const seen: string[] = []
    server.use(
      http.get(
        `${BASE}/mainnet/masternodes/${EVO}/payments`,
        ({ request }) => {
          seen.push(new URL(request.url).search)
          return HttpResponse.json({ payments: [] })
        },
        { once: true },
      ),
    )
    await radar.payments('mainnet', EVO, { before: 2_500_000, limit: 10 })
    expect(seen).toEqual(['?before=2500000&limit=10'])
    const recorded = await radar.payments('mainnet', EVO, { limit: 10 })
    expect(recorded.data.length).toBeGreaterThan(0)
    expect(recorded.data[0]?.amount_duffs).toBeTypeOf('bigint')
  })

  it('bench, mnBench, platform, activation, changes, geo parse their recordings', async () => {
    expect((await radar.bench('mainnet')).data.vantages.length).toBeGreaterThan(0)
    expect((await radar.mnBench('mainnet', EVO)).data?.combined?.letter).toBeTypeOf('string')
    const platform = await radar.platform('mainnet')
    expect(platform.data.epochs.length).toBeGreaterThan(10)
    expect(platform.height).toBe(platform.data.now.height)
    expect(platform.heightChain).toBe('platform')
    expect((await radar.activation('mainnet')).heightChain).toBeUndefined()
    const activation = await radar.activation('mainnet')
    expect(activation.data.deployments[0]?.name).toBeTypeOf('string')
    expect(activation.height).toBe(activation.data.tip.height)
    expect((await radar.changes('mainnet')).data.changes.length).toBeGreaterThan(0)
    expect((await radar.geo('mainnet')).data.points.length).toBeGreaterThan(0)
    expect((await radar.releases()).data.releases[0]?.tag).toMatch(/^v/)
  })

  it('dates every crawl document on a network by the same crawl finish, at one moment @RA-12', async () => {
    forgetCrawls()
    const [summary, status, masternodes, geo, changes, history, detail] = await Promise.all([
      radar.summary('mainnet'),
      radar.status(undefined, 'mainnet'),
      radar.masternodes('mainnet'),
      radar.geo('mainnet'),
      radar.changes('mainnet'),
      radar.history('mainnet', { dim: 'totals', scope: 'all', days: 30 }),
      radar.masternode('mainnet', REGULAR),
    ])
    const finished = summary.data.crawl.finished
    for (const doc of [summary, status, masternodes, geo, changes, history, detail]) {
      expect(doc.asOf).toBe(finished)
      expect(doc.radarTime).toBe('crawl')
    }
  })

  it('asks Radar’s status alongside a crawl document, not after it', async () => {
    forgetCrawls()
    const order: string[] = []
    const body = await fixtureBody<Record<string, unknown>>('radar', 'mainnet', 'geo')
    let release: () => void = () => undefined
    const held = new Promise<void>((done) => {
      release = done
    })
    server.use(
      http.get(`${BASE}/mainnet/geo`, async () => {
        order.push('geo asked')
        await held
        order.push('geo answered')
        return HttpResponse.json(body)
      }),
    )
    const listener = ({ request }: { request: Request }) => {
      if (request.url.endsWith('/status')) order.push('status asked')
    }
    server.events.on('request:start', listener)
    const geo = radar.geo('mainnet')
    await vi.waitFor(() => {
      expect(order).toContain('status asked')
    })
    release()
    expect((await geo).radarTime).toBe('crawl')
    server.events.removeListener('request:start', listener)
    expect(order.indexOf('status asked')).toBeLessThan(order.indexOf('geo answered'))
  })

  it('names Radar’s own checks apart from the crawl, with their own time', async () => {
    const platform = await radar.platform('mainnet')
    expect(platform.radarTime).toBe('reading')
    expect(platform.asOf).toBe(platform.data.now.updated)
    expect((await radar.activation('mainnet')).radarTime).toBe('reading')
    expect((await radar.bench('mainnet')).radarTime).toBe('reading')
  })

  it('says a document comes from an earlier crawl than the latest, dated by that crawl', async () => {
    forgetCrawls()
    const summaryBody = await fixtureBody<{ crawl: { id: number; finished: number } }>(
      'radar',
      'mainnet',
      'summary',
    )
    const geoBody = await fixtureBody<{ crawl_id: number }>('radar', 'mainnet', 'geo')
    const older = { id: summaryBody.crawl.id - 1, finished: summaryBody.crawl.finished - 300 }
    server.use(
      http.get(
        `${BASE}/mainnet/summary`,
        () => HttpResponse.json({ ...summaryBody, crawl: { ...summaryBody.crawl, ...older } }),
        { once: true },
      ),
      http.get(`${BASE}/mainnet/geo`, () => HttpResponse.json({ ...geoBody, crawl_id: older.id })),
    )
    await radar.summary('mainnet')
    const latest = await radar.summary('mainnet')
    expect(latest.radarTime).toBe('crawl')
    const geo = await radar.geo('mainnet')
    expect(geo.radarTime).toBe('earlier-crawl')
    expect(geo.asOf).toBe(older.finished * 1000)
  })

  it('check posts to the masternode and parses the handshake result', async () => {
    let method = ''
    server.use(
      http.post(`${BASE}/testnet/masternodes/${EVO}/check`, ({ request }) => {
        method = request.method
        return HttpResponse.json({
          ok: true,
          connect_ms: 12,
          handshake_ms: 30,
          checked: 1_700_000_000,
          cached: false,
        })
      }),
    )
    const out = await radar.check('testnet', EVO)
    expect(method).toBe('POST')
    expect(out.data).toMatchObject({ ok: true, cached: false })
    expect(out.asOf).toBe(1_700_000_000_000)
  })

  it('reports an invalid answer as invalid-response and degrades radar', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    server.use(http.get(`${BASE}/mainnet/summary`, () => HttpResponse.json({ crawl: {} })))
    const e = await radar.summary('mainnet').catch((error: unknown) => error)
    expect(isSourceError(e) && e.kind).toBe('invalid-response')
    expect(log).toHaveBeenCalled()
    expect(healthRegistry.get('mainnet', 'radar').state).toBe('degraded')
    log.mockRestore()
  })
})
