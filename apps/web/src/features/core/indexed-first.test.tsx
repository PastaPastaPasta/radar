import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableEarlyAnswers } from '@/data/early'
import type { Sourced } from '@/data/envelope'
import { useIndexedFirst } from './indexed-first'

const probe = vi.hoisted(() => ({ fit: true }))
vi.mock('@/data/hyphen/fit', () => ({ useHyphenFit: () => probe.fit }))

const stamp = (source: 'dapi' | 'hyphen', extra = {}) => ({
  source,
  asOf: 1,
  fetchedAt: 1,
  proved: false,
  ...extra,
})

function harness(
  indexedAnswers: (Sourced<string> | null)[] = [
    { ...stamp('hyphen', { fallback: 'dapi-cold' as const }), data: 'indexed' },
  ],
  initial: { txid: string } = { txid: 'a' },
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  let answer!: (v: Sourced<string | null>) => void
  let fail!: (e: Error) => void
  const dapi = new Promise<Sourced<string | null>>((res, rej) => {
    answer = res
    fail = rej
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  let asked = 0
  const indexed = (txid: string) => ({
    queryKey: ['mainnet', 'hyphen', 'indexed-test', txid] as const,
    queryFn: () => Promise.resolve(indexedAnswers[Math.min(asked++, indexedAnswers.length - 1)]!),
  })
  const hook = renderHook(
    ({ txid }: { txid: string }) =>
      useIndexedFirst(
        useQuery({ queryKey: ['mainnet', 'dapi', 'test', txid], queryFn: () => dapi }),
        indexed(txid),
        { enabled: true, net: 'mainnet', same: (a, b) => a === b },
      ),
    { wrapper, initialProps: initial },
  )
  return { hook, answer, fail, client, asked: () => asked }
}

describe('useIndexedFirst', () => {
  afterEach(() => {
    enableEarlyAnswers(false)
    probe.fit = true
  })

  it("shows the index's answer, labelled, until DAPI's lands, then DAPI's, and says when they differed", async () => {
    enableEarlyAnswers()
    const { hook, answer } = harness()
    await waitFor(() => expect(hook.result.current.query.data?.data).toBe('indexed'))
    expect(hook.result.current.query.data?.fallback).toBe('dapi-cold')
    answer({ ...stamp('dapi'), data: 'from dapi' })
    await waitFor(() => expect(hook.result.current.query.data?.data).toBe('from dapi'))
    expect(hook.result.current.query.data?.source).toBe('dapi')
    expect(hook.result.current.differed).toBe(true)
  })

  it('says nothing when DAPI agrees', async () => {
    enableEarlyAnswers()
    const { hook, answer } = harness()
    await waitFor(() => expect(hook.result.current.query.data?.data).toBe('indexed'))
    answer({ ...stamp('dapi'), data: 'indexed' })
    await waitFor(() => expect(hook.result.current.query.data?.source).toBe('dapi'))
    expect(hook.result.current.differed).toBe(false)
  })

  it("lets DAPI's not-found replace the index's answer", async () => {
    enableEarlyAnswers()
    const { hook, answer } = harness()
    await waitFor(() => expect(hook.result.current.query.data?.data).toBe('indexed'))
    answer({ ...stamp('dapi'), data: null })
    await waitFor(() => expect(hook.result.current.query.data?.data).toBeNull())
  })

  it('stops showing the index once DAPI has failed, so the page shows the failure', async () => {
    enableEarlyAnswers()
    const { hook, fail } = harness()
    await waitFor(() => expect(hook.result.current.query.data?.data).toBe('indexed'))
    fail(new Error('down'))
    await waitFor(() => expect(hook.result.current.query.isError).toBe(true))
    expect(hook.result.current.query.data).toBeUndefined()
  })

  it('shows nothing from the index until the probe has found it current, and drops it once the probe says stale', async () => {
    enableEarlyAnswers()
    probe.fit = false
    const { hook } = harness()
    await new Promise((r) => setTimeout(r, 30))
    expect(hook.result.current.query.data).toBeUndefined()
    probe.fit = true
    hook.rerender({ txid: 'a' })
    await waitFor(() => expect(hook.result.current.query.data?.data).toBe('indexed'))
    probe.fit = false
    hook.rerender({ txid: 'a' })
    expect(hook.result.current.query.data).toBeUndefined()
  })

  it('asks the index again once the probe finds it current, when its first answer was null', async () => {
    enableEarlyAnswers()
    probe.fit = false
    const { hook, asked } = harness([
      null,
      { ...stamp('hyphen', { fallback: 'dapi-cold' as const }), data: 'indexed' },
    ])
    await waitFor(() => expect(asked()).toBe(1))
    expect(hook.result.current.query.data).toBeUndefined()
    probe.fit = true
    hook.rerender({ txid: 'a' })
    await waitFor(() => expect(hook.result.current.query.data?.data).toBe('indexed'))
    expect(asked()).toBe(2)
  })

  it("compares DAPI's answer only with the index's answer for the same request", async () => {
    enableEarlyAnswers()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['mainnet', 'dapi', 'test', 'b'], { ...stamp('dapi'), data: 'b from dapi' })
    const { hook } = harness(undefined, { txid: 'a' }, client)
    await waitFor(() => expect(hook.result.current.query.data?.data).toBe('indexed'))
    hook.rerender({ txid: 'b' })
    await waitFor(() => expect(hook.result.current.query.data?.data).toBe('b from dapi'))
    expect(hook.result.current.differed).toBe(false)
  })

  it('asks the index nothing when early answers are off', async () => {
    const { hook } = harness()
    await new Promise((r) => setTimeout(r, 20))
    expect(hook.result.current.query.data).toBeUndefined()
  })
})
