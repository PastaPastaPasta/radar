import { describe, expect, it } from 'vitest'
import { locateFixture, slugOf } from './slug'

describe('slugOf', () => {
  it('joins path segments and flattens the query', () => {
    expect(slugOf('/blocks', 'limit=20&order=desc')).toBe('blocks--limit-20,order-desc')
    expect(slugOf('/', '')).toBe('root')
    expect(slugOf('/address/Xabc/transactions', '')).toBe('address__Xabc__transactions')
  })

  it('lower-cases 64-hex hashes so case never splits a fixture', () => {
    const upper = 'A'.repeat(64)
    expect(slugOf(`/block/${upper}`, '')).toBe(`block__${'a'.repeat(64)}`)
  })

  it('prefixes non-GET methods', () => {
    expect(slugOf('/search', '', 'POST')).toBe('post--search')
  })

  it('keys a history window by its length, not by the clock', () => {
    const a =
      'intervalsCount=7&timestamp_end=2026-11-14T22:30:00.000Z&timestamp_start=2026-11-07T22:30:00.000Z'
    const b =
      'intervalsCount=7&timestamp_end=2026-11-20T10:00:00.000Z&timestamp_start=2026-11-13T10:00:00.000Z'
    expect(slugOf('/transactions/history', a)).toBe(
      'transactions__history--intervalsCount-7,span-168h',
    )
    expect(slugOf('/transactions/history', b)).toBe(slugOf('/transactions/history', a))
    expect(slugOf('/blocks', 'timestamp_start=2026-11-10T00:00:00.000Z')).toContain('2026-11-10')
  })

  it('shortens long slugs with a stable hash', () => {
    const long = slugOf('/x', `q=${'z'.repeat(200)}`)
    expect(long.length).toBeLessThan(125)
    expect(long).toBe(slugOf('/x', `q=${'z'.repeat(200)}`))
    expect(long).not.toBe(slugOf('/x', `q=${'z'.repeat(201)}`))
  })
})

describe('locateFixture', () => {
  it('maps the Hyphen proxy path', () => {
    expect(locateFixture('/x/hy/mainnet/blocks?limit=20&asc=0')).toMatchObject({
      source: 'hyphen',
      net: 'mainnet',
      path: '/blocks',
      slug: 'blocks--asc-0,limit-20',
    })
  })

  it('maps Radar global and per-network paths', () => {
    expect(locateFixture('https://radar.dashhq.org/api/v1/status')).toMatchObject({
      source: 'radar',
      net: 'global',
    })
    expect(locateFixture('https://radar.dashhq.org/api/v1/testnet/summary')).toMatchObject({
      source: 'radar',
      net: 'testnet',
      path: '/summary',
    })
  })

  it('maps both Platform Explorer hosts', () => {
    expect(locateFixture('https://api.pe.dashhq.org/rate')?.net).toBe('mainnet')
    expect(locateFixture('https://api.testnet.pe.dashhq.org/status')?.net).toBe('testnet')
  })

  it('maps both Insight hosts, dropping the API prefix and keeping the query', () => {
    expect(locateFixture('https://insight.dash.org/insight-api/status?q=getInfo')).toMatchObject({
      source: 'insight',
      net: 'mainnet',
      path: '/status',
      slug: 'status--q-getInfo',
    })
    expect(
      locateFixture(
        'https://insight.testnet.networks.dash.org/insight-api/txs?address=yA&pageNum=1',
      ),
    ).toMatchObject({ source: 'insight', net: 'testnet', path: '/txs' })
    expect(locateFixture('https://insight.dash.org/elsewhere')).toBeNull()
  })

  it('ignores hosts it has no fixtures for', () => {
    expect(locateFixture('https://example.com/status')).toBeNull()
    expect(locateFixture('https://radar.dashhq.org/other')).toBeNull()
  })
})
