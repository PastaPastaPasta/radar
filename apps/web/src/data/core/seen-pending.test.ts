import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { coreLive } from './live'
import { useSeenPending } from './seen-pending'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSeenPending', () => {
  it('returns the same rows between renders once more than the limit are kept', () => {
    let push: ((event: unknown) => void) | undefined
    vi.spyOn(coreLive, 'subscribe').mockReturnValue(() => undefined)
    vi.spyOn(coreLive, 'txStatus').mockReturnValue({ state: 'idle' } as never)
    vi.spyOn(coreLive, 'transactions').mockImplementation(((
      _net: unknown,
      cb: (e: unknown) => void,
    ) => {
      push = cb
      return () => undefined
    }) as never)

    const { result, rerender } = renderHook(() => useSeenPending('mainnet', true, 2))
    act(() => {
      for (const txid of ['a', 'b', 'c']) {
        push?.({ kind: 'tx', tx: { txid, type: 0, outputs: [{ value: 1n }], size: 200 } })
      }
    })
    const first = result.current.rows
    expect(first.map((r) => r.txid)).toEqual(['c', 'b'])
    rerender()
    expect(result.current.rows).toBe(first)
  })
})
