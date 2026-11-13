import { describe, expect, it } from 'vitest'
import { decodeWhere } from '../src/lib/search-schemas'
import { LEGACY_PATTERNS, NATIVE_PATHS, redirectFor } from '../../../workers/edge/src/redirects'
import { createAppRouter } from '../src/router'
import { createQueryClient } from '../src/app/query-client'

const router = createAppRouter(createQueryClient())
const ID = 'A'.repeat(44)
const HASH = 'b'.repeat(64)

function isRoute(pathname: string): boolean {
  const [, params, found] = router.getMatchedRoutes(pathname)
  return found !== undefined && !('**' in params)
}

type Validate = (search: Record<string, unknown>) => Record<string, unknown>

/** What the page the redirect lands on reads from its address, run through the route's own search schema. */
function landed(hit: URL): Record<string, unknown> {
  const [matched] = router.getMatchedRoutes(hit.pathname)
  const raw = router.options.parseSearch(hit.search) as Record<string, unknown>
  const search: Record<string, unknown> = {}
  for (const route of matched) {
    const validate = route.options.validateSearch as Validate | { parse: Validate } | undefined
    if (!validate) continue
    Object.assign(search, typeof validate === 'function' ? validate(raw) : validate.parse(raw))
  }
  return search
}

const FULL_QUERY = new URLSearchParams({
  id: ID,
  type: 'note',
  docId: ID,
  name: 'alice.dash',
  index: '5',
  proTxHash: HASH,
  addr: 'dash1x',
  hash: HASH,
  tool: 'state-transition',
  contractId: ID,
  position: '2',
  contract: ID,
  docType: 'domain',
  indexName: 'parentNameAndLabel',
  indexValues: '["dash","alice"]',
  identity: ID,
  token: ID,
  q: 'x',
})

const LEGACY_SAMPLES = [
  `/block-index/2569999`,
  `/insight/block-index/2569999`,
  `/insight/block/${HASH}`,
  `/insight/tx/${HASH}`,
  `/insight/address/XabcDEF`,
  `/insight/blocks?blockDate=2026-10-01`,
  `/insight/status`,
  `/insight/messages/verify`,
  `/insight`,
  `/masternodes.html`,
  `/map.html`,
  `/v24.html`,
  `/changes.html`,
  `/api.html`,
  `/mn.html`,
  `/platform.html`,
  `/index.html`,
  `/masternodes?sort=uptime_7d&dir=desc&type=Evo&status=Unreachable`,
  `/map?layer=nodes&type=Regular`,
  `/changes?kind=bogus`,
  `/tools/fees`,
]

function target(path: string, query: URLSearchParams, host: string) {
  const qs = query.size ? `?${query.toString()}` : ''
  const hit = redirectFor(new URL(`https://${host}${path}${qs}`), {
    nativeHosts: ['explorer.dashhq.org'],
  })
  return hit ? new URL(hit.location, 'https://radar.invalid') : null
}

describe('redirect targets', () => {
  it.each(
    NATIVE_PATHS.flatMap((p) => [[p, FULL_QUERY] as const, [p, new URLSearchParams()] as const]),
  )('%s lands on a registered route', (path, query) => {
    const hit = target(path, query, 'explorer.dashhq.org')
    if (hit)
      expect(isRoute(hit.pathname), `${path}?${query.toString()} → ${hit.pathname}`).toBe(true)
  })

  it.each(LEGACY_SAMPLES)('legacy %s lands on a registered route', (sample) => {
    const url = new URL(sample, 'https://radar.dashhq.org')
    const hit = target(url.pathname, url.searchParams, 'radar.dashhq.org')
    expect(hit, sample).not.toBeNull()
    expect(isRoute(hit!.pathname), `${sample} → ${hit!.pathname}`).toBe(true)
  })

  it('has a sample for every legacy pattern', () => {
    for (const re of LEGACY_PATTERNS) {
      expect(
        LEGACY_SAMPLES.some((s) => re.test(new URL(s, 'https://x.invalid').pathname)),
        String(re),
      ).toBe(true)
    }
  })

  it('translates the old Radar list and map parameters', () => {
    const at = (path: string, q: Record<string, string>) =>
      target(path, new URLSearchParams(q), 'radar.dashhq.org')
    const qs = (u: URL | null) => Object.fromEntries(u?.searchParams ?? [])
    expect(
      qs(
        at('/masternodes', { sort: 'uptime_7d', dir: 'desc', type: 'Evo', status: 'Unreachable' }),
      ),
    ).toEqual({
      sort: '-uptime_7d',
      type: 'evo',
      reach: 'unreachable',
    })
    expect(qs(at('/masternodes.html', { sort: 'version', host: 'AS1', page: '3' }))).toEqual({
      sort: 'version',
    })
    expect(qs(at('/map', { layer: 'nodes', type: 'Regular', sort: 'x' }))).toEqual({
      layer: 'nodes',
      type: 'regular',
    })
    expect(at('/map', { layer: 'mn' })?.search).toBe('')
    expect(qs(at('/changes', { kind: 'pose' }))).toEqual({})
    expect(at('/changes', { kind: 'bogus' })?.search ?? '').toBe('')
    expect(at('/tools/fees', {})?.pathname).toBe('/mempool')
    for (const fixed of [
      ['/masternodes', { sort: '-status', type: 'evo,regular' }],
      ['/masternodes', { reach: 'reachable', status: 'enabled' }],
      ['/map', { layer: 'nodes' }],
      ['/changes', { kind: 'pose' }],
    ] as const) {
      expect(at(fixed[0], fixed[1]), fixed[0]).toBeNull()
    }
  })

  it('opens the contest, group and tool pages the old Explorer linked to', () => {
    const at = (path: string, q: Record<string, string>) =>
      target(path, new URLSearchParams(q), 'explorer.dashhq.org')
    expect(
      at('/governance/contested/detail', {
        indexValues: '["dash","alice"]',
        docType: 'domain',
        indexName: 'parentNameAndLabel',
      })?.pathname,
    ).toBe('/contest/alice')
    expect(at('/groups/detail', { contractId: ID, position: '2' })?.pathname).toBe(`/group/${ID}/2`)
    expect(at('/groups', { contractId: ID })?.pathname).toBe(`/groups/${ID}`)
    for (const tool of [
      'state-transition',
      'contract',
      'document',
      'identity',
      'proof',
      'path-elements',
    ]) {
      const hit = at('/tools', { tool })
      expect(isRoute(hit!.pathname), tool).toBe(true)
    }
  })

  describe('the native explorer pages', () => {
    const at = (path: string, q: Record<string, string>, host = 'explorer.dashhq.org') =>
      target(path, new URLSearchParams(q), host)!

    it.each([
      ['/identity', { id: ID, tab: 'dpns' }, `/identity/${ID}`, { tab: 'names' }],
      ['/identity', { id: ID, tab: 'keys' }, `/identity/${ID}`, { tab: 'keys' }],
      ['/identity', { id: ID, tab: 'nonsense' }, `/identity/${ID}`, { tab: 'overview' }],
      ['/contract', { id: ID, tab: 'internal' }, `/contract/${ID}`, { tab: 'config' }],
      ['/contract', { id: ID, tab: 'documents' }, `/contract/${ID}`, { tab: 'types' }],
      ['/contract/token', { id: ID, position: '1' }, `/contract/${ID}`, { tab: 'tokens' }],
      [
        '/contract/document',
        { id: ID, type: 'note', docId: ID, tab: 'metadata' },
        `/document/${ID}/note/${ID}`,
        { tab: 'meta' },
      ],
      [
        '/contract/document',
        { id: ID, type: 'note', docId: ID, tab: 'history' },
        `/document/${ID}/note/${ID}`,
        { tab: 'revisions' },
      ],
      ['/token', { id: ID, tab: 'holders' }, `/token/${ID}`, { tab: 'holders' }],
      ['/token', { id: ID }, `/token/${ID}`, { tab: 'overview' }],
      ['/token/holders', { id: ID }, `/token/${ID}/holders`, {}],
      ['/dpns', { name: 'alice.dash' }, '/name/alice', {}],
      ['/dpns/search', { q: 'al', after: 'x,y' }, '/names', { q: 'al', after: 'y' }],
      ['/governance/polls', { window: 'all-upcoming' }, '/polls', { range: 'upcoming' }],
      ['/governance/polls', { window: '7d', page: '2' }, '/polls', { range: '7d', page: 2 }],
      ['/epoch/detail', { index: '7' }, '/epoch/7', {}],
      ['/epoch/history', { from: '3', to: '9' }, '/epochs', { from: 3, to: 9 }],
      ['/evonode', { proTxHash: HASH }, `/mn/${HASH}`, { tab: 'platform' }],
      ['/network/quorums', {}, '/quorums', {}],
      ['/network/credits', {}, '/credits', {}],
      ['/network/shielded', {}, '/shielded', {}],
      ['/network/protocol', {}, '/protocol', {}],
      ['/state-transition', { hash: HASH }, `/platform/tx/${HASH}`, {}],
      ['/address', { addr: 'dash1x' }, '/platform-address/dash1x', {}],
      ['/tools', { tool: 'path-elements' }, '/tools/path', {}],
      ['/tools', { tool: 'proof' }, '/tools/proof', {}],
      ['/tools', { tool: 'identity' }, '/tools/identity', {}],
      ['/governance/contested', {}, '/contests', {}],
    ] as const)('%s?%j opens %s with %j', (path, query, pathname, expected) => {
      const hit = at(path, query)
      expect(hit.pathname).toBe(pathname)
      expect(isRoute(hit.pathname)).toBe(true)
      expect(landed(hit)).toMatchObject(expected)
    })

    it.each([
      ['/query', { q: 'SELECT COUNT(*) FROM dpns.domain', contract: ID }],
      ['/settings', {}],
      ['/about', {}],
      ['/sdk-reference', {}],
      ['/saved', { scope: 'all' }],
    ] as const)('%s keeps its address, which the new page reads as it is', (path, query) => {
      const params = new URLSearchParams(query)
      expect(target(path, params, 'explorer.dashhq.org')).toBeNull()
      expect(isRoute(path)).toBe(true)
      const search = landed(new URL(`https://x.invalid${path}?${params}`))
      for (const [k, v] of Object.entries(query)) expect(search[k]).toBe(v)
    })

    it('turns the documents browser filter, order and cursors into the page address', () => {
      const where = JSON.stringify([
        ['normalizedLabel', 'startsWith', 'al~ice'],
        ['$ownerId', 'in', `${ID}, ${HASH}`],
        ['age', '>=', '18'],
        ['age', '!=', '3'],
        ['', '==', 'x'],
      ])
      const hit = at('/contract/documents', {
        id: ID,
        type: 'domain',
        where,
        order: '$createdAt:desc',
        limit: '50',
        after: 'c1,c2,c3',
      })
      expect(hit.pathname).toBe(`/contract/${ID}/documents/domain`)
      const search = landed(hit)
      expect(search).toMatchObject({
        where: [
          { field: 'normalizedLabel', op: 'sw', value: 'al~ice' },
          { field: '$ownerId', op: 'in', value: [ID, HASH] },
          { field: 'age', op: 'gte', value: '18' },
        ],
        order: ['-$createdAt'],
        limit: 50,
        after: 'c3',
        prev: ['c1', 'c2'],
      })
      expect(decodeWhere(hit.searchParams.get('where')!)).toHaveLength(3)
    })

    it('carries a plain ascending order and no cursor through', () => {
      const hit = at('/contract/documents', {
        id: ID,
        type: 'note',
        order: '$id:asc',
        where: '[["$id","==","x"]]',
      })
      const search = landed(hit)
      expect(search).toMatchObject({
        order: ['$id'],
        where: [{ field: '$id', op: 'eq', value: 'x' }],
      })
      expect(search.after).toBeUndefined()
      expect(search.prev).toBeUndefined()
    })

    it('drops a filter it cannot read instead of failing', () => {
      const hit = at('/contract/documents', { id: ID, type: 'note', where: '{not json' })
      expect(isRoute(hit.pathname)).toBe(true)
      expect(hit.searchParams.has('where')).toBe(false)
    })

    it('keeps the network through every translation', () => {
      const hit = at('/contract/documents', {
        id: ID,
        type: 'note',
        where: '[["a","==","b"]]',
        network: 'testnet',
      })
      expect(hit.searchParams.get('network')).toBe('testnet')
    })
  })

  describe('the old Radar pages', () => {
    const at = (path: string, q: Record<string, string>) =>
      target(path, new URLSearchParams(q), 'radar.dashhq.org')!

    it.each([
      ['/mn/' + HASH, { net: 'testnet' }, `/mn/${HASH}`, { network: 'testnet' }],
      ['/v24', { net: 'testnet' }, '/v24', { network: 'testnet' }],
      ['/api', { net: 'testnet' }, '/api', { network: 'testnet' }],
      ['/map', { net: 'testnet', type: 'Evo' }, '/map', { network: 'testnet', type: 'evo' }],
      [
        '/changes',
        { net: 'testnet', kind: 'joins' },
        '/changes',
        { network: 'testnet', kind: 'joins' },
      ],
      ['/platform.html', { net: 'testnet' }, '/epochs', { network: 'testnet' }],
      ['/mn.html', {}, '/masternodes', {}],
    ] as const)('%s?%j opens %s', (path, query, pathname, expected) => {
      const hit = at(path, query)
      expect(hit.pathname).toBe(pathname)
      expect(isRoute(hit.pathname)).toBe(true)
      for (const [k, v] of Object.entries(expected)) expect(hit.searchParams.get(k)).toBe(v)
    })
  })

  it('does not treat an unknown path as a route', () => {
    expect(isRoute('/zzz/nothing')).toBe(false)
    expect(isRoute('/block/12/extra')).toBe(false)
    expect(isRoute('/tools/state-transition')).toBe(true)
  })
})
