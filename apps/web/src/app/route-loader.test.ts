import { QueryClient } from '@tanstack/query-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prefetchForRoute = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const epochPrefetch = vi.hoisted(() => vi.fn((): unknown[] => []))

vi.mock('@/data/query', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  prefetchForRoute,
}))
vi.mock('@/data/query/prefetch/p-chain', () => ({ epochPrefetch }))

import { markFirstLoadResolved } from './first-load'
import { routePrefetch } from './route-loader'

const context = { queryClient: new QueryClient() }
const run = (cause: 'enter' | 'stay' | 'preload', preload = false) =>
  routePrefetch(
    'p-chain',
    'epochPrefetch',
  )({
    context,
    deps: { sort: 'asc', network: 'testnet' },
    params: { n: '86' },
    preload,
    cause,
  })

describe('routePrefetch', () => {
  beforeEach(() => {
    markFirstLoadResolved()
    prefetchForRoute.mockClear()
    epochPrefetch.mockReset().mockReturnValue([])
  })

  it('hands the module its network, params and search', async () => {
    await run('enter')
    expect(epochPrefetch).toHaveBeenCalledWith(
      'testnet',
      { n: '86' },
      { sort: 'asc', network: 'testnet' },
    )
    expect(prefetchForRoute).toHaveBeenCalledWith(context.queryClient, 'testnet', [], {
      preload: false,
    })
  })

  it('awaits nothing when the loader re-runs for a changed search', async () => {
    await run('stay')
    expect(prefetchForRoute).toHaveBeenCalledWith(context.queryClient, 'testnet', [], {
      preload: true,
    })
  })

  it('does not reject when the module’s item list throws', async () => {
    epochPrefetch.mockImplementation(() => {
      throw new RangeError('The number abc cannot be converted to a BigInt')
    })
    await expect(run('enter')).resolves.toBeUndefined()
    expect(prefetchForRoute).not.toHaveBeenCalled()
  })
})
