import { describe, expect, it } from 'vitest'
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

  it('does not treat an unknown path as a route', () => {
    expect(isRoute('/zzz/nothing')).toBe(false)
    expect(isRoute('/block/12/extra')).toBe(false)
    expect(isRoute('/tools/state-transition')).toBe(true)
  })
})
