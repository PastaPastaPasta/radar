import { describe, expect, it, vi } from 'vitest'
import { queryView, stampsOf } from './query-state'

const query = (over: Partial<Parameters<typeof queryView>[0]>) => ({
  data: undefined,
  isError: false,
  error: null,
  refetch: () => Promise.resolve(),
  ...over,
})

describe('queryView', () => {
  it('loads until an answer arrives, and errors only when nothing is left to show', () => {
    expect(queryView(query({})).state).toBe('loading')
    expect(queryView(query({ isError: true })).state).toBe('error')
    expect(queryView(query({ data: 1 })).state).toBe('ready')
    expect(queryView(query({ data: 1, isError: true })).state).toBe('ready')
  })

  it('retries through the query', () => {
    const refetch = vi.fn(() => Promise.resolve())
    queryView(query({ refetch })).onRetry()
    expect(refetch).toHaveBeenCalledOnce()
  })
})

describe('stampsOf', () => {
  it('skips answers that have not arrived', () => {
    expect(stampsOf(undefined, undefined)).toEqual([])
  })
})
