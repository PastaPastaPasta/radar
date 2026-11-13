import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NetworkId } from '@/lib/network'
import { CATCH_UP_DELAYS_MS, useCatchUpToTip, useRefetchOnRise } from './tip-refetch'

const KEY = ['mainnet', 'dapi', 'tx', { txid: 'a' }] as const
const OTHER = ['mainnet', 'dapi', 'status'] as const

const initial: { net: NetworkId; height: number | undefined } = { net: 'mainnet', height: 100 }

function setupRise(settled = false) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    (p: typeof initial) => useRefetchOnRise(p.net, p.height, { keys: [KEY, OTHER], settled }),
    { wrapper, initialProps: initial },
  )
  return { invalidate, hook }
}

describe('useRefetchOnRise', () => {
  it('reads every key again when the height rises', () => {
    const { invalidate, hook } = setupRise()
    expect(invalidate).not.toHaveBeenCalled()
    hook.rerender({ net: 'mainnet', height: 101 })
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY, exact: true })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: OTHER, exact: true })
  })

  it('leaves a settled page alone', () => {
    const { invalidate, hook } = setupRise(true)
    hook.rerender({ net: 'mainnet', height: 101 })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('does not refetch when the height falls or repeats', () => {
    const { invalidate, hook } = setupRise()
    hook.rerender({ net: 'mainnet', height: 99 })
    hook.rerender({ net: 'mainnet', height: 99 })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('does not refetch for the first height after the network changed', () => {
    const { invalidate, hook } = setupRise()
    hook.rerender({ net: 'testnet', height: 500 })
    hook.rerender({ net: 'testnet', height: 500 })
    expect(invalidate).not.toHaveBeenCalled()
    hook.rerender({ net: 'testnet', height: 501 })
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('does not refetch when the first height arrives', () => {
    const { invalidate, hook } = setupRise()
    hook.rerender({ net: 'mainnet', height: undefined })
    hook.rerender({ net: 'mainnet', height: 105 })
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('useCatchUpToTip', () => {
  afterEach(() => vi.useRealTimers())

  const METRICS = ['mainnet', 'hyphen', 'metrics-latest'] as const

  function setup(tipHeight: number | undefined, dataHeight: number | undefined, enabled = true) {
    vi.useFakeTimers()
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const hook = renderHook(
      (p: { tip: number | undefined; data: number | undefined }) =>
        useCatchUpToTip('mainnet', {
          key: METRICS,
          tipHeight: p.tip,
          dataHeight: p.data,
          enabled,
        }),
      { wrapper, initialProps: { tip: tipHeight, data: dataHeight } },
    )
    return { invalidate, hook }
  }

  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

  it('reads again after 3, 6 and 12 seconds while the data trails the tip, then stops', () => {
    const { invalidate } = setup(101, 100)
    expect(invalidate).not.toHaveBeenCalled()
    advance(CATCH_UP_DELAYS_MS[0] - 1)
    expect(invalidate).not.toHaveBeenCalled()
    advance(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
    advance(CATCH_UP_DELAYS_MS[1])
    expect(invalidate).toHaveBeenCalledTimes(2)
    advance(CATCH_UP_DELAYS_MS[2])
    expect(invalidate).toHaveBeenCalledTimes(3)
    advance(120_000)
    expect(invalidate).toHaveBeenCalledTimes(3)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: METRICS, exact: true })
  })

  it('stops as soon as the data reaches the tip', () => {
    const { invalidate, hook } = setup(101, 100)
    advance(3_000)
    expect(invalidate).toHaveBeenCalledTimes(1)
    hook.rerender({ tip: 101, data: 101 })
    advance(120_000)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('starts over on the next block', () => {
    const { invalidate, hook } = setup(101, 100)
    advance(60_000)
    expect(invalidate).toHaveBeenCalledTimes(3)
    hook.rerender({ tip: 102, data: 101 })
    advance(3_000)
    expect(invalidate).toHaveBeenCalledTimes(4)
  })

  it('does not read at all when the data is current, not yet loaded, or the source is not fit', () => {
    for (const [tip, data, enabled] of [
      [100, 100, true],
      [101, undefined, true],
      [101, 100, false],
    ] as const) {
      const { invalidate } = setup(tip, data, enabled)
      advance(60_000)
      expect(invalidate).not.toHaveBeenCalled()
    }
  })
})
