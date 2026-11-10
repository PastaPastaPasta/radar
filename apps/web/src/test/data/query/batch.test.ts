import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveNetwork } from '@/data/active-network'
import type { Fact, Sourced } from '@/data/envelope'
import { isSourceError } from '@/data/errors'
import { createBatcher, useHydratedFact } from '@/data/query/batch'

const stamped = <T>(data: T): Sourced<T> => ({
  data,
  source: 'sdk',
  asOf: 1_700_000_000_000,
  fetchedAt: 1_700_000_000_000,
  proved: false,
})

function make(overrides: { maxBatch?: number } = {}) {
  const calls: string[][] = []
  const batcher = createBatcher<string, number>({
    name: 'identity-balance',
    source: 'sdk',
    maxBatch: overrides.maxBatch ?? 100,
    windowMs: 15,
    run: (_net, keys) => {
      calls.push(keys)
      return Promise.resolve(
        stamped(
          new Map<string, number | null>(keys.map((k) => [k, k === 'missing' ? null : k.length])),
        ),
      )
    },
  })
  return { batcher, calls }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createBatcher', () => {
  it('coalesces calls within the window into one run', async () => {
    const { batcher, calls } = make()
    const a = batcher.fetch('mainnet', 'aa')
    const b = batcher.fetch('mainnet', 'bbb')
    await vi.advanceTimersByTimeAsync(15)
    expect((await a).data).toBe(2)
    expect((await b).data).toBe(3)
    expect(calls).toEqual([['aa', 'bbb']])
  })

  it('shares one lookup between duplicate keys', async () => {
    const { batcher, calls } = make()
    const a = batcher.fetch('mainnet', 'aa')
    const b = batcher.fetch('mainnet', 'aa')
    await vi.advanceTimersByTimeAsync(15)
    expect((await a).data).toBe(2)
    expect((await b).data).toBe(2)
    expect(calls).toEqual([['aa']])
  })

  it('splits more keys than maxBatch into several runs', async () => {
    const { batcher, calls } = make({ maxBatch: 2 })
    const all = ['a', 'b', 'c', 'd', 'e'].map((k) => batcher.fetch('mainnet', k))
    await vi.advanceTimersByTimeAsync(15)
    await Promise.all(all)
    expect(calls).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })

  it('keeps networks apart', async () => {
    const { batcher, calls } = make()
    const a = batcher.fetch('mainnet', 'aa')
    const b = batcher.fetch('testnet', 'bb')
    await vi.advanceTimersByTimeAsync(15)
    await Promise.all([a, b])
    expect(calls).toHaveLength(2)
  })

  it('starts a new window after a flush', async () => {
    const { batcher, calls } = make()
    const first = batcher.fetch('mainnet', 'aa')
    await vi.advanceTimersByTimeAsync(15)
    await first
    const second = batcher.fetch('mainnet', 'bb')
    await vi.advanceTimersByTimeAsync(15)
    await second
    expect(calls).toEqual([['aa'], ['bb']])
  })

  it('resolves keys the run did not return as null and keeps the stamp', async () => {
    const { batcher } = make()
    const p = batcher.fetch('mainnet', 'missing')
    await vi.advanceTimersByTimeAsync(15)
    const out = await p
    expect(out.data).toBeNull()
    expect(out.source).toBe('sdk')
    expect(out.fetchedAt).toBe(1_700_000_000_000)
  })

  it('rejects every waiter of a failed run', async () => {
    const batcher = createBatcher<string, number>({
      name: 'x',
      source: 'sdk',
      maxBatch: 10,
      run: () => Promise.reject(new Error('boom')),
    })
    const a = batcher.fetch('mainnet', 'a').catch((e: unknown) => e)
    const b = batcher.fetch('mainnet', 'b').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(15)
    expect(await a).toBeInstanceOf(Error)
    expect(await b).toBeInstanceOf(Error)
  })

  it('rejects an aborted caller without disturbing the others', async () => {
    const { batcher, calls } = make()
    const controller = new AbortController()
    const a = batcher.fetch('mainnet', 'aa', controller.signal).catch((e: unknown) => e)
    const b = batcher.fetch('mainnet', 'bbb')
    controller.abort()
    const aborted = await a
    expect(isSourceError(aborted) && aborted.kind).toBe('aborted')
    await vi.advanceTimersByTimeAsync(15)
    expect((await b).data).toBe(3)
    expect(calls).toEqual([['aa', 'bbb']])
  })

  it('rejects at once when the signal is already aborted', async () => {
    const { batcher, calls } = make()
    const controller = new AbortController()
    controller.abort()
    const e = await batcher
      .fetch('mainnet', 'aa', controller.signal)
      .catch((error: unknown) => error)
    expect(isSourceError(e) && e.kind).toBe('aborted')
    await vi.advanceTimersByTimeAsync(15)
    expect(calls).toEqual([])
  })

  it('exposes a per-key query keyed by net, source, resource and key', () => {
    const { batcher } = make()
    const q = batcher.queryOptions('mainnet', 'aa')
    expect(q.queryKey).toEqual(['mainnet', 'sdk', 'identity-balance', { id: 'aa' }])
  })

  it('honours a custom key param', () => {
    const batcher = createBatcher<string, number>({
      name: 'x',
      source: 'sdk',
      maxBatch: 1,
      keyParam: 'hash',
      run: () => Promise.resolve(stamped(new Map())),
    })
    expect(batcher.queryOptions('testnet', 'ff').queryKey).toEqual([
      'testnet',
      'sdk',
      'x',
      { hash: 'ff' },
    ])
  })
})

describe('useHydratedFact', () => {
  beforeEach(() => {
    vi.useRealTimers()
    setActiveNetwork('mainnet')
  })

  const wrapper = (client: QueryClient) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client }, children)
    }

  const backendFact: Fact<number> = {
    value: 1,
    stamp: { source: 'pe', asOf: 1, fetchedAt: 1, proved: false },
  }

  it('shows the backend value first and the SDK value once the batch lands', async () => {
    const { batcher } = make()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useHydratedFact(batcher, 'abcd', backendFact), {
      wrapper: wrapper(client),
    })
    expect(result.current).toBe(backendFact)
    await waitFor(() => expect(result.current?.value).toBe(4))
    expect(result.current?.stamp.source).toBe('sdk')
  })

  it('keeps the backend value when the SDK has no such record', async () => {
    const { batcher, calls } = make()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useHydratedFact(batcher, 'missing', backendFact), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(() => Promise.resolve())
    expect(result.current).toBe(backendFact)
  })

  it('returns undefined when there is neither value', async () => {
    const { batcher, calls } = make()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useHydratedFact(batcher, 'missing', undefined), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(result.current).toBeUndefined()
  })
})
