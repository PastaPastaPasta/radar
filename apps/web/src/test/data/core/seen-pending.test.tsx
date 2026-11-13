import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveTxEvent } from '@/data/core/live'
import type { DecodedTx } from '@/data/core/types'
import { useSeenPending } from '@/data/core/seen-pending'

const feed = vi.hoisted(() => ({
  listeners: new Set<(e: unknown) => void>(),
  changed: new Set<() => void>(),
  state: 'live',
}))

vi.mock('@/data/core/live', () => ({
  coreLive: {
    transactions(_net: string, listener: (e: unknown) => void) {
      feed.listeners.add(listener)
      return () => feed.listeners.delete(listener)
    },
    txStatus: () => ({ state: feed.state, fallbackHint: false }),
    subscribe(cb: () => void) {
      feed.changed.add(cb)
      return () => feed.changed.delete(cb)
    },
  },
}))

const T0 = Date.UTC(2026, 10, 12, 12, 0, 0)
const MINUTE = 60_000

const tx = (n: number): DecodedTx => ({
  txid: n.toString(16).padStart(64, '0'),
  type: 'transfer',
  version: 3,
  lockTime: 0,
  size: 200,
  inputs: [],
  outputs: [{ value: 5n, scriptPubKey: '' }],
})

const emit = (e: LiveTxEvent) => act(() => feed.listeners.forEach((l) => l(e)))
const setState = (state: 'live' | 'reconnecting') =>
  act(() => {
    feed.state = state
    feed.changed.forEach((cb) => cb())
  })

beforeEach(() => {
  feed.state = 'live'
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(T0)
})
afterEach(() => {
  feed.listeners.clear()
  feed.changed.clear()
  vi.useRealTimers()
})

describe('useSeenPending', () => {
  it('stamps the list by the stream being connected, not by when the last transaction arrived', () => {
    const { result } = renderHook(() => useSeenPending('testnet', true))
    emit({ kind: 'tx', tx: tx(1) })
    expect(result.current.rows[0]?.seenAt).toBe(T0)

    act(() => void vi.advanceTimersByTime(10 * MINUTE))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0]?.seenAt).toBe(T0)
    expect(result.current.stamp?.source).toBe('dapi')
    expect(result.current.stamp?.asOf).toBeGreaterThanOrEqual(T0 + 10 * MINUTE - 10_000)
  })

  it('is stamped from the moment the stream was last connected once it is not', () => {
    const { result } = renderHook(() => useSeenPending('testnet', true))
    act(() => void vi.advanceTimersByTime(5 * MINUTE))
    setState('reconnecting')
    const lost = result.current.stamp?.asOf
    expect(lost).toBeGreaterThanOrEqual(T0 + 5 * MINUTE - 10_000)
    act(() => void vi.advanceTimersByTime(20 * MINUTE))
    expect(result.current.stamp?.asOf).toBe(Date.now() - 20 * MINUTE)
  })

  it('has no stamp for a stream that was never connected', () => {
    feed.state = 'reconnecting'
    const { result } = renderHook(() => useSeenPending('testnet', true))
    expect(result.current.stamp).toBeUndefined()
  })
})
