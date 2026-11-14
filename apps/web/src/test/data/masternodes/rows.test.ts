import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DapiMnEntry } from '@/data/core/types'
import type { Sourced } from '@/data/envelope'
import { disabledByMode, SourceError } from '@/data/errors'
import {
  filterMnRows,
  mnFilterFacets,
  mnFilterSearch,
  mnHostLabels,
} from '@/data/masternodes/filter'
import { joinMnRows, mnRowsQuery, type MnRow } from '@/data/masternodes/rows'
import type { RadarMasternode } from '@/data/radar/schemas'

const { list, crawl } = vi.hoisted(() => ({ list: vi.fn(), crawl: vi.fn() }))
vi.mock('@/data/core/client', () => ({ core: { masternodeList: list } }))
vi.mock('@/data/radar/client', () => ({ radar: { masternodes: crawl } }))

const hex = (n: number) => n.toString(16).padStart(64, '0')

const sourced = <T>(source: 'radar' | 'dapi', data: T, asOf = 1_700_000_000_000): Sourced<T> => ({
  source,
  asOf,
  fetchedAt: asOf,
  proved: false,
  data,
})

const entry = (over: Partial<DapiMnEntry> = {}): DapiMnEntry => ({
  proRegTxHash: hex(1),
  confirmedHash: 'cc',
  service: '1.2.3.4:9999',
  pubKeyOperator: 'op',
  votingAddress: 'XVote',
  isValid: true,
  type: 0,
  ...over,
})

const crawled = (n: number, over: Partial<RadarMasternode> = {}): RadarMasternode => ({
  protx: hex(n),
  type: 'Regular',
  status: 'enabled',
  service: '1.2.3.4:9999',
  payout_address: 'XPay',
  registered_height: 1,
  last_paid_height: 2,
  pose_penalty: 0,
  pose_ban_height: -1,
  operator_reward: 0,
  platform_node_id: null,
  reachable: true,
  version: '23.0.2',
  user_agent: null,
  protocol: null,
  latency_ms: null,
  start_height: null,
  uptime_7d: null,
  uptime_30d: null,
  last_seen: null,
  last_error: null,
  network: null,
  country: 'DE',
  continent: null,
  city: 'Berlin',
  lat: null,
  lon: null,
  asn: 24940,
  as_org: 'Hetzner',
  dkg_readiness: { overall: 'ready', checks: {} },
  ...over,
})

describe('joinMnRows', () => {
  it('has no rows to join when neither part answered', () => {
    expect(joinMnRows(undefined, undefined)).toBeUndefined()
  })

  it('makes DAPI’s list the rows and attaches the crawl to the ones it saw, with one stamp per part', () => {
    const list = sourced(
      'dapi',
      new Map([
        [hex(1), entry()],
        [hex(2), entry({ type: 1, isValid: false })],
      ]),
    )
    const crawl = sourced('radar', [crawled(1), crawled(9)], 5)
    const joined = joinMnRows(crawl, list)!
    const [one, two] = joined.data.rows
    expect(joined.data.rows).toHaveLength(2)
    expect(one).toMatchObject({
      protx: hex(1),
      type: 'regular',
      status: 'enabled',
      host: '1.2.3.4',
    })
    expect(one!.crawl?.country).toBe('DE')
    expect(one!.dapi?.source).toBe('dapi')
    expect(one!.radar?.asOf).toBe(5)
    expect(one!.crawlDiffers).toBeUndefined()
    expect(two).toMatchObject({ type: 'evo', status: 'pose-banned', crawl: null, radar: null })
    expect(joined.data.dapi?.source).toBe('dapi')
    expect(joined.data.radar?.source).toBe('radar')
    expect(joined.source).toBe('dapi')
  })

  it('lets DAPI win and says so when the crawl disagrees on type, status, service or node ID', () => {
    const base = entry({ platformNodeId: 'node-a' })
    const cases: Partial<RadarMasternode>[] = [
      { type: 'Evo' },
      { status: 'pose_banned' },
      { service: '9.9.9.9:9999' },
      { platform_node_id: 'node-b' },
    ]
    for (const over of cases) {
      const row = joinMnRows(
        sourced('radar', [crawled(1, over)]),
        sourced('dapi', new Map([[hex(1), base]])),
      )!.data.rows[0]!
      expect(row.crawlDiffers).toBe(true)
      expect(row).toMatchObject({ type: 'regular', status: 'enabled', service: '1.2.3.4:9999' })
    }
  })

  it('does not call a crawl with no service or node ID a difference', () => {
    const row = joinMnRows(
      sourced('radar', [crawled(1, { service: null })]),
      sourced('dapi', new Map([[hex(1), entry({ platformNodeId: 'node-a' })]])),
    )!.data.rows[0]!
    expect(row.crawlDiffers).toBeUndefined()
  })

  it('stands on the crawl alone when DAPI gave no list, stamped as Radar’s', () => {
    const joined = joinMnRows(
      sourced('radar', [crawled(3, { type: 'Evo', status: 'pose_banned' })]),
      undefined,
    )!
    expect(joined.source).toBe('radar')
    expect(joined.data.dapi).toBeNull()
    expect(joined.data.rows[0]).toMatchObject({
      type: 'evo',
      status: 'pose-banned',
      registration: null,
      dapi: null,
    })
  })
})

describe('mnRowsQuery', () => {
  const run = (net: 'mainnet' | 'testnet' = 'mainnet') =>
    new QueryClient().fetchQuery({ ...mnRowsQuery(net), retry: false })
  const down = (source: 'dapi' | 'radar') =>
    new SourceError({ source, kind: 'unavailable', message: 'down' })

  beforeEach(() => {
    list.mockReset()
    crawl.mockReset()
  })

  it('keys the query under the view keys', () => {
    expect(mnRowsQuery('testnet').queryKey).toEqual(['testnet', 'view', 'mn-rows'])
  })

  it('joins both when both answer', async () => {
    list.mockResolvedValue(sourced('dapi', new Map([[hex(1), entry()]])))
    crawl.mockResolvedValue(sourced('radar', [crawled(1)]))
    const out = await run()
    expect(out.data.rows[0]?.crawl).not.toBeNull()
  })

  it('leaves DAPI-only rows when Decentralized only mode refuses Radar', async () => {
    list.mockResolvedValue(sourced('dapi', new Map([[hex(1), entry()]])))
    crawl.mockRejectedValue(disabledByMode('radar'))
    const out = await run()
    expect(out.data.radar).toBeNull()
    expect(out.data.rows).toHaveLength(1)
    expect(out.data.rows[0]!.crawl).toBeNull()
  })

  it('leaves Radar-only rows when DAPI cannot answer', async () => {
    list.mockRejectedValue(down('dapi'))
    crawl.mockResolvedValue(sourced('radar', [crawled(1)]))
    const out = await run()
    expect(out.source).toBe('radar')
    expect(out.data.dapi).toBeNull()
  })

  it('throws DAPI’s error when the mode refused Radar and DAPI is down, Radar’s otherwise', async () => {
    list.mockRejectedValue(down('dapi'))
    crawl.mockRejectedValue(disabledByMode('radar'))
    await expect(run()).rejects.toMatchObject({ source: 'dapi', kind: 'unavailable' })
    crawl.mockRejectedValue(down('radar'))
    await expect(run()).rejects.toMatchObject({ source: 'radar', kind: 'unavailable' })
  })
})

describe('filterMnRows and mnFilterFacets', () => {
  const rows: MnRow[] = joinMnRows(
    sourced('radar', [
      crawled(1),
      crawled(2, {
        type: 'Evo',
        country: 'US',
        version: '23.1.0',
        asn: 16509,
        as_org: 'Amazon.com, Inc.',
        user_agent: '/Dash Core:23.1.0/',
        platform_node_id: 'ab12cd',
        reachable: false,
        dkg_readiness: { overall: 'behind', checks: {} },
      }),
      crawled(3, { status: 'pose_banned', country: 'DE', reachable: null }),
    ]),
    sourced(
      'dapi',
      new Map([
        [hex(1), entry()],
        [hex(2), entry({ type: 1, service: '5.6.7.8:9999' })],
        [hex(3), entry({ isValid: false, service: '9.9.9.9:9999' })],
        [hex(4), entry({ service: '10.0.0.1:9999' })],
      ]),
    ),
  )!.data.rows
  const ids = (r: MnRow[]) => r.map((x) => Number.parseInt(x.protx, 16))

  it('reads dkg as the overall verdict, "ready" for a pass, or a check that fails', () => {
    const verdict = (
      overall: string,
      checks: Record<string, string>,
    ): RadarMasternode['dkg_readiness'] => ({ overall, checks })
    const dkgRows = joinMnRows(
      sourced('radar', [
        crawled(1, { dkg_readiness: verdict('pass', { protocol: 'pass', relay: 'pass' }) }),
        crawled(2, { dkg_readiness: verdict('fail', { protocol: 'fail', relay: 'pass' }) }),
        crawled(3, { dkg_readiness: verdict('fail', { protocol: 'pass', relay: 'fail' }) }),
        crawled(4, { dkg_readiness: verdict('unknown', { protocol: 'unknown' }) }),
      ]),
      sourced('dapi', new Map([1, 2, 3, 4].map((n) => [hex(n), entry({ proRegTxHash: hex(n) })]))),
    )!.data.rows
    expect(ids(filterMnRows(dkgRows, { dkg: ['ready'] }))).toEqual([1])
    expect(ids(filterMnRows(dkgRows, { dkg: ['pass'] }))).toEqual([1])
    expect(ids(filterMnRows(dkgRows, { dkg: ['fail'] }))).toEqual([2, 3])
    expect(ids(filterMnRows(dkgRows, { dkg: ['protocol'] }))).toEqual([2])
    expect(ids(filterMnRows(dkgRows, { dkg: ['relay', 'unknown'] }))).toEqual([3, 4])
  })

  it('passes everything when the filter sets nothing', () => {
    expect(filterMnRows(rows, {})).toHaveLength(4)
  })

  it('matches any value of a field and every field set', () => {
    expect(ids(filterMnRows(rows, { type: ['evo'] }))).toEqual([2])
    expect(ids(filterMnRows(rows, { country: ['DE', 'US'] }))).toEqual([1, 2, 3])
    expect(ids(filterMnRows(rows, { country: ['DE'], status: ['enabled'] }))).toEqual([1])
    expect(ids(filterMnRows(rows, { reach: 'unreachable' }))).toEqual([2])
    expect(ids(filterMnRows(rows, { dkg: ['behind'], host: ['16509'] }))).toEqual([2])
    expect(ids(filterMnRows(rows, { version: ['23.1.0'] }))).toEqual([2])
  })

  it('never matches a row the crawl did not see on a crawl field', () => {
    expect(ids(filterMnRows(rows, { country: ['DE', 'US'], reach: 'reachable' }))).toEqual([1])
    expect(ids(filterMnRows(rows, { host: ['24940'] }))).toEqual([1, 3])
  })

  it('filters hosting by AS number, so a name with a comma in it never splits', () => {
    expect(mnFilterSearch.parse({ host: '16509,24940' }).host).toEqual(['16509', '24940'])
    expect(mnHostLabels(rows)).toEqual({ '24940': 'Hetzner', '16509': 'Amazon.com, Inc.' })
    expect(mnFilterFacets(rows).host).toEqual({ '24940': 2, '16509': 1 })
  })

  it('ignores the crawl facets while no row has a crawl', () => {
    const dapiOnly = joinMnRows(undefined, sourced('dapi', new Map([[hex(1), entry()]])))!.data.rows
    expect(
      filterMnRows(dapiOnly, { country: ['DE'], host: ['24940'], reach: 'reachable' }),
    ).toHaveLength(1)
    expect(filterMnRows(dapiOnly, { type: ['evo'] })).toHaveLength(0)
  })

  it('searches ProTx, service, place, version and hosting case-insensitively', () => {
    expect(ids(filterMnRows(rows, { q: ' 5.6.7.8 ' }))).toEqual([2])
    expect(ids(filterMnRows(rows, { q: 'berlin' }))).toEqual([1, 2, 3])
    expect(ids(filterMnRows(rows, { q: 'amazon' }))).toEqual([2])
    expect(ids(filterMnRows(rows, { q: 'dash core:23.1' }))).toEqual([2])
    expect(ids(filterMnRows(rows, { q: 'ab12cd' }))).toEqual([2])
    expect(ids(filterMnRows(rows, { q: hex(3).slice(0, 62) + '03' }))).toEqual([3])
    expect(filterMnRows(rows, { q: 'nothing like this' })).toEqual([])
  })

  it('counts each value of each facet over the rows it is given', () => {
    expect(mnFilterFacets(rows)).toEqual({
      type: { regular: 3, evo: 1 },
      status: { enabled: 3, 'pose-banned': 1 },
      reach: { reachable: 1, unreachable: 1 },
      country: { DE: 2, US: 1 },
      version: { '23.0.2': 2, '23.1.0': 1 },
      host: { '24940': 2, '16509': 1 },
      dkg: { ready: 2, behind: 1 },
    })
  })
})
