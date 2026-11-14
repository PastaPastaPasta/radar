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
import { mergeHits, planResolvers } from './useSearch'
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

  it('says on the page that Platform heights can’t be offered when the Platform tip can’t be read', async () => {
    vi.spyOn(sdk, 'call').mockRejectedValue(
      new SourceError({ source: 'sdk', kind: 'unavailable', message: 'The SDK is unreachable' }),
    )

    render(<App history={createMemoryHistory({ initialEntries: ['/search?q=2569992'] })} />)

    expect(await screen.findByText(/isn.t available here/)).toBeInTheDocument()
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
