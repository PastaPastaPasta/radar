import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { enableEarlyAnswers } from '@/data/early'
import type { Sourced } from '@/data/envelope'
import { useIndexedFirst } from './indexed-first'

const stamp = (source: 'dapi' | 'hyphen', extra = {}) => ({
  source,
  asOf: 1,
  fetchedAt: 1,
  proved: false,
  ...extra,
})

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let answer!: (v: Sourced<string | null>) => void
  let fail!: (e: Error) => void
  const dapi = new Promise<Sourced<string | null>>((res, rej) => {
    answer = res
    fail = rej
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const indexed = {
    queryKey: ['mainnet', 'hyphen', 'indexed-test'] as const,
    queryFn: () =>
      Promise.resolve({ ...stamp('hyphen', { fallback: 'dapi-cold' as const }), data: 'indexed' }),
  }
  const hook = renderHook(
    () =>
      useIndexedFirst(
        useQuery({ queryKey: ['mainnet', 'dapi', 'test'], queryFn: () => dapi }),
        indexed,
        true,
      ),
    { wrapper },
  )
  return { hook, answer, fail }
}

describe('useIndexedFirst', () => {
  afterEach(() => {
    enableEarlyAnswers(false)
  })

  it("shows the index's answer, labelled, until DAPI's lands, then DAPI's", async () => {
    enableEarlyAnswers()
    const { hook, answer } = harness()
    await waitFor(() => expect(hook.result.current.data?.data).toBe('indexed'))
    expect(hook.result.current.data?.fallback).toBe('dapi-cold')
    answer({ ...stamp('dapi'), data: 'from dapi' })
    await waitFor(() => expect(hook.result.current.data?.data).toBe('from dapi'))
    expect(hook.result.current.data?.source).toBe('dapi')
  })

  it("lets DAPI's not-found replace the index's answer", async () => {
    enableEarlyAnswers()
    const { hook, answer } = harness()
    await waitFor(() => expect(hook.result.current.data?.data).toBe('indexed'))
    answer({ ...stamp('dapi'), data: null })
    await waitFor(() => expect(hook.result.current.data?.data).toBeNull())
  })

  it('stops showing the index once DAPI has failed, so the page shows the failure', async () => {
    enableEarlyAnswers()
    const { hook, fail } = harness()
    await waitFor(() => expect(hook.result.current.data?.data).toBe('indexed'))
    fail(new Error('down'))
    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(hook.result.current.data).toBeUndefined()
  })

  it('asks the index nothing when early answers are off', async () => {
    const { hook } = harness()
    await new Promise((r) => setTimeout(r, 20))
    expect(hook.result.current.data).toBeUndefined()
  })
})
