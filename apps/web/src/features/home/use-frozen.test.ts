import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFrozen } from './use-frozen'

describe('useFrozen', () => {
  it('follows its source until paused, then holds, then catches up', () => {
    const { result, rerender } = renderHook(({ value, paused }) => useFrozen(value, paused), {
      initialProps: { value: 1, paused: false },
    })
    rerender({ value: 2, paused: false })
    expect(result.current).toBe(2)
    rerender({ value: 3, paused: true })
    expect(result.current).toBe(2)
    act(() => rerender({ value: 4, paused: true }))
    expect(result.current).toBe(2)
    rerender({ value: 4, paused: false })
    expect(result.current).toBe(4)
  })
})
