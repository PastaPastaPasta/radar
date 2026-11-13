import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEARCH_DEBOUNCE_MS, useDebouncedQuery } from './FilterBar'
import { cellFilter, filterFields } from './ListView'

describe('useDebouncedQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the text at once and commits it after the pause, once', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDebouncedQuery(undefined, commit))
    act(() => {
      result.current[1]('1.2')
    })
    expect(result.current[0]).toBe('1.2')
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
    })
    expect(commit).not.toHaveBeenCalled()
    act(() => {
      result.current[1]('1.2.3')
    })
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
    })
    expect(commit).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith('1.2.3')
  })

  it('commits nothing for blank text, which clears the search', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDebouncedQuery('abc', commit))
    act(() => {
      result.current[1]('  ')
    })
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    expect(commit).toHaveBeenCalledWith(undefined)
  })

  it('takes a search that the address changed, without committing it back', () => {
    const commit = vi.fn()
    const { result, rerender } = renderHook(({ q }) => useDebouncedQuery(q, commit), {
      initialProps: { q: undefined as string | undefined },
    })
    rerender({ q: 'from back button' })
    expect(result.current[0]).toBe('from back button')
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2)
    })
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('cellFilter', () => {
  it('turns a click on a cell into the filter it names', () => {
    expect(cellFilter('country', 'DE')).toEqual({ country: ['DE'] })
    expect(cellFilter('hosting', '24940')).toEqual({ host: ['24940'] })
    expect(cellFilter('version', '24.0.0')).toEqual({ version: ['24.0.0'] })
    expect(cellFilter('type', 'evo')).toEqual({ type: ['evo'] })
    expect(cellFilter('status', 'pose-banned')).toEqual({ status: ['pose-banned'] })
    expect(cellFilter('address', '1.2.3.4')).toEqual({})
  })
})

describe('filterFields', () => {
  it('carries the filter fields to another page and nothing else', () => {
    const search = { q: 'x', country: ['DE'], sort: '-status', page: 3, view: 'list' } as never
    expect(filterFields(search)).toEqual({ q: 'x', country: ['DE'] })
  })
})
