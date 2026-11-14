import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { SourceError } from '@/data/errors'
import { sdk } from '@/data/sdk'
import { resetSearchEnv, searchEnv } from './env'
import { useSearchTip } from './tip'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useSearchTip', () => {
  beforeEach(() => {
    resetSearchEnv()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('says why the Platform tip is missing when the SDK cannot read it', async () => {
    vi.spyOn(sdk, 'call').mockRejectedValue(
      new SourceError({ source: 'sdk', kind: 'network', message: 'The SDK is unreachable' }),
    )
    const { result } = renderHook(() => useSearchTip('mainnet', 'page'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.unread).toBeInstanceOf(SourceError))
    expect(result.current.tip?.platform).toBeUndefined()
  })

  it('reads the Core height, the Platform height and the epoch the pages already hold, and shares them with the environment @X-01 @NX-05', async () => {
    const { result } = renderHook(() => useSearchTip('mainnet', 'page'), { wrapper: wrapper() })

    await waitFor(() => {
      expect(result.current.tip).toMatchObject({ platform: 469065, epoch: 88 })
      expect(result.current.tip?.core).toBeGreaterThan(2_500_000)
    })
    expect(result.current.reading).toBe(false)
    expect(searchEnv.tip('mainnet')).toEqual(result.current.tip)
    expect(searchEnv.tip('testnet')).toBeUndefined()
  })

  it('does not start the Platform read in the palette until the SDK is ready @X-01', async () => {
    const original = { ...searchEnv }
    searchEnv.sdkState = () => 'cold'
    try {
      const { result } = renderHook(() => useSearchTip('mainnet', 'palette'), {
        wrapper: wrapper(),
      })

      await waitFor(() => expect(result.current.tip?.core).toBeGreaterThan(2_500_000))
      expect(result.current.tip?.platform).toBeUndefined()
      expect(result.current.tip?.epoch).toBeUndefined()
    } finally {
      Object.assign(searchEnv, original)
    }
  })
})
