import { describe, expect, it } from 'vitest'
import { switchTarget } from './network-switch'

const at = (path: string, routeId: string, params: Record<string, string> = {}) =>
  switchTarget(new URL(path, 'https://radar.test'), { routeId, params })

const HEX = 'ab'.repeat(32)
const ID = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'

describe('the network switch @X-03 @RA-91', () => {
  it('keeps a list and its filters', () => {
    const t = at('/masternodes?network=testnet&type=evo&q=1.2.3.4', '/masternodes')
    expect(t.kind).toBe('keep')
    expect(t.url.pathname + t.url.search).toBe('/masternodes?network=testnet&type=evo&q=1.2.3.4')
  })

  it.each([
    ['/nodes', '/nodes?network=testnet'],
    ['/map', '/map?network=testnet&type=evo'],
  ])('keeps %s', (route, expected) => {
    const search = route === '/map' ? '&type=evo' : ''
    const t = at(`${route}?network=testnet${search}`, route)
    expect(t.kind).toBe('keep')
    expect(t.url.pathname + t.url.search).toBe(expected)
  })

  it('drops the cursors and the filters that name a block, epoch or proposer of the old network', () => {
    const t = at(
      `/platform/blocks?network=testnet&height=100..200&epoch=3..4&proposer=${HEX}&gas=1..9&after=x&page=2`,
      '/platform/blocks',
    )
    expect([...t.url.searchParams.keys()].sort()).toEqual(['gas', 'network', 'page'])
  })

  it('drops the owner filter of the transitions list and the epoch range', () => {
    expect(
      at(`/platform/txs?network=testnet&owner=${ID}&status=success`, '/platform/txs').url.search,
    ).toBe('?network=testnet&status=success')
    expect(at('/epochs?network=testnet&from=3&to=9', '/epochs').url.search).toBe('?network=testnet')
  })

  it.each([
    ['/identity/$id', `/identity/${ID}?network=testnet&tab=names&contract=${ID}&page=3`],
    ['/contract/$id/', `/contract/${ID}?network=testnet&tab=schema&rev=2`],
    ['/token/$id/', `/token/${ID}?network=testnet&tab=holders&who=${ID}`],
    ['/name/$label', '/name/alice?network=testnet'],
  ])('opens the same %s on the other network', (route, path) => {
    const t = at(path, route)
    expect(t.kind).toBe('same-id')
    expect(t.url.pathname).toBe(new URL(path, 'https://x.test').pathname)
    expect(t.url.searchParams.get('network')).toBe('testnet')
  })

  it('keeps an identity tab and drops what only fits its own contracts', () => {
    const t = at(
      `/identity/${ID}?network=testnet&tab=advanced&contract=${ID}&type=note`,
      '/identity/$id',
    )
    expect(t.url.searchParams.get('tab')).toBe('advanced')
    expect(t.url.searchParams.has('contract')).toBe(false)
    expect(t.url.searchParams.has('type')).toBe(false)
  })

  it('keeps a documents browser on the type but not on its filter or cursor', () => {
    const t = at(
      `/contract/${ID}/documents/domain?network=testnet&where=a~eq~b&order=-x&after=y&prev=z&limit=50`,
      '/contract/$id/documents/$type',
    )
    expect(t.url.pathname).toBe(`/contract/${ID}/documents/domain`)
    expect([...t.url.searchParams.keys()].sort()).toEqual(['limit', 'network'])
  })

  it.each([
    ['/mn/$protx', { protx: HEX }, HEX],
    ['/tx/$txid', { txid: HEX }, HEX],
    ['/block/$id', { id: '2570010' }, '2570010'],
    [
      '/address/$address',
      { address: 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14' },
      'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14',
    ],
    ['/platform/block/$id', { id: '468960' }, '468960'],
    ['/platform/tx/$hash', { hash: HEX }, HEX],
    ['/platform-address/$addr', { addr: 'dash1abc' }, 'dash1abc'],
  ])('searches the other network for a record of %s', (route, params, q) => {
    const t = at(
      '/anything?network=testnet&tab=platform&epoch=4&sources=decentralized',
      route,
      params,
    )
    expect(t.kind).toBe('search')
    expect(t.url.pathname).toBe('/search')
    expect(t.url.searchParams.get('q')).toBe(q)
    expect(t.url.searchParams.get('network')).toBe('testnet')
    expect(t.url.searchParams.get('sources')).toBe('decentralized')
    expect(t.url.searchParams.has('tab')).toBe(false)
    expect(t.url.searchParams.has('epoch')).toBe(false)
  })

  it('leaves the network out of the search for mainnet, as the bar does', () => {
    const t = at('/tx/' + HEX, '/tx/$txid', { txid: HEX })
    expect(t.url.search).toBe(`?q=${HEX}`)
  })

  it('opens the epoch list instead of an epoch number, which means something else elsewhere', () => {
    const t = at('/epoch/12?network=testnet&sort=blocks', '/epoch/$n', { n: '12' })
    expect(t.kind).toBe('list')
    expect(t.url.pathname + t.url.search).toBe('/epochs?network=testnet')
  })

  it('keeps a page with no record, such as a tool, with everything it was asked', () => {
    const t = at('/query?network=testnet&q=SELECT%201&contract=' + ID, '/query')
    expect(Object.fromEntries(t.url.searchParams)).toEqual({
      network: 'testnet',
      q: 'SELECT 1',
      contract: ID,
    })
  })
})
