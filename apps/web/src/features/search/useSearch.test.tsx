import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { SourceError } from '@/data/errors'
import { sdk } from '@/data/sdk'
import { classify } from './classify'
import { searchEnv } from './env'
import { resolvers } from './resolvers'
import { localStamp } from './resolvers/helpers'
import { writeSourceMode } from '@/lib/source-mode'
import { mergeHits, planResolvers } from './useSearch'
import { pePlatformBlock } from './resolvers/platform-block'
import type { Resolver, SearchHit } from './types'

const HASH = 'ab'.repeat(32)

const hit = (over: Partial<SearchHit>): SearchHit => ({
  kind: 'block',
  id: '1',
  title: 'Block 1',
  href: { to: '/block/$id', params: { id: '1' } },
  stamp: localStamp(),
  rank: 50,
  ...over,
})

const added: Resolver[] = []
function add(r: Resolver) {
  resolvers.push(r)
  added.push(r)
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const r of added.splice(0)) resolvers.splice(resolvers.indexOf(r), 1)
})

describe('mergeHits', () => {
  it('keeps the highest rank for one entity and sorts by rank', () => {
    const merged = mergeHits([
      [hit({ id: '1', rank: 50 }), hit({ id: '2', rank: 80 })],
      [hit({ id: '1', rank: 100, title: 'Exact' })],
      [hit({ kind: 'epoch', id: '1', rank: 20 })],
    ])

    expect(merged.map((h) => [h.kind, h.id, h.rank])).toEqual([
      ['block', '1', 100],
      ['block', '2', 80],
      ['epoch', '1', 20],
    ])
  })
})

describe('planResolvers', () => {
  const never: Resolver['resolve'] = () => new Promise(() => undefined)

  it('picks resolvers by input class', () => {
    const plan = planResolvers(classify('2569992', 'mainnet'), 'mainnet', 'page')

    expect(plan.map((r) => r.id)).toContain('local-height')
    expect(plan.map((r) => r.id)).not.toContain('local-core-address')
  })

  it('skips every resolver when the address belongs to another network', () => {
    const c = classify('yhq7ifNCtTKEpY4Yu5XPCcztQco6Fh6JsZ', 'mainnet')

    expect(planResolvers(c, 'mainnet', 'page')).toEqual([])
  })

  it.each(['secret', 'possible-secret'] as const)(
    'runs only local resolvers for a %s input',
    (warning) => {
      add({ id: 'fake-index', accepts: ['int'], cost: 'index', resolve: never })
      add({ id: 'fake-dapi-int', accepts: ['int'], cost: 'dapi', resolve: never })
      add({ id: 'fake-sdk-int', accepts: ['int'], cost: 'sdk', resolve: never })
      const original = { ...searchEnv }
      searchEnv.sdkState = () => 'ready'
      const ordinary = classify('2569992', 'mainnet')
      const flagged = { ...ordinary, warning }

      const ids = planResolvers(flagged, 'mainnet', 'page').map((r) => r.id)
      expect(ids).toContain('local-height')
      expect(ids).not.toEqual(expect.arrayContaining(['fake-index']))
      expect(ids).not.toContain('fake-dapi-int')
      expect(ids).not.toContain('fake-sdk-int')
      expect(planResolvers(ordinary, 'mainnet', 'page').map((r) => r.id)).toContain('fake-index')
      Object.assign(searchEnv, original)
    },
  )

  it('runs SDK resolvers on the page but not in the palette until the SDK is ready', () => {
    add({ id: 'fake-sdk', accepts: ['hex64'], cost: 'sdk', resolve: never })
    const c = classify(HASH, 'mainnet')
    const original = { ...searchEnv }

    searchEnv.sdkState = () => 'cold'
    expect(planResolvers(c, 'mainnet', 'page').map((r) => r.id)).toContain('fake-sdk')
    expect(planResolvers(c, 'mainnet', 'palette').map((r) => r.id)).not.toContain('fake-sdk')
    searchEnv.sdkState = () => 'ready'
    expect(planResolvers(c, 'mainnet', 'palette').map((r) => r.id)).toContain('fake-sdk')
    Object.assign(searchEnv, original)
  })

  it('skips DAPI resolvers when there is no request budget', () => {
    add({ id: 'fake-dapi', accepts: ['hex64'], cost: 'dapi', resolve: never })
    const c = classify(HASH, 'mainnet')
    const original = { ...searchEnv }

    searchEnv.canAffordDapi = () => false
    expect(planResolvers(c, 'mainnet', 'page').map((r) => r.id)).not.toContain('fake-dapi')
    searchEnv.canAffordDapi = () => true
    expect(planResolvers(c, 'mainnet', 'page').map((r) => r.id)).toContain('fake-dapi')
    Object.assign(searchEnv, original)
  })
})

describe('fan-out', () => {
  it('shows one resolver’s hits while another fails and a third is still running', async () => {
    add({
      id: 'fake-ok',
      accepts: ['hex64'],
      cost: 'index',
      resolve: () => Promise.resolve([hit({ id: HASH, title: 'Found by the index', rank: 100 })]),
    })
    add({
      id: 'fake-down',
      accepts: ['hex64'],
      cost: 'index',
      resolve: () =>
        Promise.reject(
          new SourceError({ source: 'hyphen', kind: 'http', message: 'Hyphen isn’t answering' }),
        ),
    })
    add({
      id: 'fake-slow',
      accepts: ['hex64'],
      cost: 'index',
      resolve: () => new Promise(() => undefined),
    })

    render(<App history={createMemoryHistory({ initialEntries: [`/search?q=${HASH}`] })} />)

    expect(await screen.findByRole('link', { name: /Found by the index/ })).toBeInTheDocument()
    expect((await screen.findAllByText(/Hyphen isn.t answering/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'Results' })).toHaveAttribute('aria-busy', 'true')
  })

  describe('with the Platform tip unreadable', () => {
    const NOT_OFFERED = /isn.t available here/
    const sdkDown = () =>
      vi.spyOn(sdk, 'call').mockRejectedValue(
        new SourceError({
          source: 'sdk',
          kind: 'unavailable',
          message: 'The SDK is unreachable',
        }),
      )
    const results = () => screen.getByRole('region', { name: 'Results' })
    const settled = () => waitFor(() => expect(results()).not.toHaveAttribute('aria-busy', 'true'))
    const open = (q: string) =>
      render(<App history={createMemoryHistory({ initialEntries: [`/search?q=${q}`] })} />)

    it('says Platform heights can’t be offered when the block lookup failed', async () => {
      sdkDown()
      vi.spyOn(pePlatformBlock, 'resolve').mockRejectedValue(
        new SourceError({ source: 'pe', kind: 'http', message: 'Platform Explorer is down' }),
      )
      open('2569992')
      await waitFor(() => expect(screen.getByText(NOT_OFFERED)).toBeInTheDocument())
    })

    it('says so in Decentralized only mode, where no index answers a height', async () => {
      sdkDown()
      writeSourceMode('decentralized')
      open('2569992')
      await waitFor(() => expect(screen.getByText(NOT_OFFERED)).toBeInTheDocument())
    })

    it('stays quiet when Platform Explorer’s block lookup answered', async () => {
      sdkDown()
      vi.spyOn(pePlatformBlock, 'resolve').mockResolvedValue([
        hit({
          kind: 'platform-block',
          id: '2569992',
          title: 'Platform block 2,569,992',
          href: { to: '/platform/block/$id', params: { id: '2569992' } },
        }),
      ])
      open('2569992')
      expect(await screen.findByRole('link', { name: /Platform block 2,569,992/ })).toBeVisible()
      await settled()
      expect(screen.queryByText(NOT_OFFERED)).toBeNull()
    })

    it('does not ask the SDK for the Platform tip unless the input is a number', async () => {
      const call = sdkDown()
      open('XpG61qAVhdyN7AqVZQsHfJL7AEk4dPVinc')
      await settled()
      expect(call.mock.calls.filter(([, method]) => method === 'epoch.current')).toHaveLength(0)
    })

    it('stays quiet for a Core address, which no Platform height concerns', async () => {
      sdkDown()
      open('XpG61qAVhdyN7AqVZQsHfJL7AEk4dPVinc')
      await settled()
      expect(screen.queryByText(NOT_OFFERED)).toBeNull()
    })
  })

  it('aborts the previous run when the input changes', async () => {
    const signals: AbortSignal[] = []
    add({
      id: 'fake-watch',
      accepts: ['hex64'],
      cost: 'index',
      resolve: (_c, ctx) => {
        signals.push(ctx.signal)
        return new Promise(() => undefined)
      },
    })
    const history = createMemoryHistory({ initialEntries: [`/search?q=${HASH}`] })
    render(<App history={history} />)
    await waitFor(() => expect(signals.length).toBeGreaterThan(0))
    const first = signals[0]

    history.push(`/search?q=${'cd'.repeat(32)}`)

    await waitFor(() => expect(first?.aborted).toBe(true))
  })
})
