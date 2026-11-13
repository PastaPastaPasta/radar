import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useFollowTip } from './follow-tip'

vi.mock('@/data/core/queries', () => ({
  coreQueries: {
    tip: () => ({
      queryKey: ['mainnet', 'dapi', 'tip'],
      queryFn: () => Promise.resolve({ data: { height: 100 } }),
      staleTime: Infinity,
    }),
  },
}))

const KEY = ['mainnet', 'dapi', 'tx', { txid: 'a' }] as const

function setup(settled: boolean) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useFollowTip('mainnet', { keys: [KEY], settled }), { wrapper })
  return { client, invalidate, hook }
}

const publish = (client: QueryClient, height: number) =>
  act(() => {
    client.setQueryData(['mainnet', 'dapi', 'tip'], { data: { height } })
  })

describe('useFollowTip', () => {
  it('returns the live tip height and refetches an unsettled page on each new block', async () => {
    const { client, invalidate, hook } = setup(false)
    await waitFor(() => expect(hook.result.current).toBe(100))
    expect(invalidate).not.toHaveBeenCalled()

    publish(client, 101)

    await waitFor(() => expect(hook.result.current).toBe(101))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY, exact: true })
  })

  it('leaves a settled page alone', async () => {
    const { client, invalidate, hook } = setup(true)
    await waitFor(() => expect(hook.result.current).toBe(100))

    publish(client, 101)

    await waitFor(() => expect(hook.result.current).toBe(101))
    expect(invalidate).not.toHaveBeenCalled()
  })
})
