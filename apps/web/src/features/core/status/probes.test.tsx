import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useProbes } from './probes'

const calls = vi.hoisted(() => ({ sdk: 0 }))

vi.mock('@/data/sdk/queries', () => ({
  platformTipQuery: (net: string) => ({
    queryKey: ['sdk-tip', net],
    queryFn: () => {
      calls.sdk += 1
      return Promise.reject(new Error('down'))
    },
  }),
}))
vi.mock('@/data/health-queries', () => {
  const idle = (name: string) => (net: string) => ({
    queryKey: ['health', name, net],
    queryFn: () => new Promise(() => undefined),
  })
  return {
    HEALTH_PROBE_INTERVAL_MS: 60_000,
    healthQueries: {
      radar: idle('radar'),
      pe: idle('pe'),
      hyphen: idle('hyphen'),
      insight: idle('insight'),
    },
  }
})

describe('status probes @IN-09', () => {
  it('asks the SDK once per visit even when the default retries failures', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 1 } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useProbes('mainnet').sdk, { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(calls.sdk).toBe(1)
  })
})
