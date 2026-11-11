import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery, useReducedMotion, useThemeSignal } from './hooks'

describe('media hooks without matchMedia', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('answer false and keep rendering when the browser has no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => useMediaQuery('(min-width: 1px)')).result.current).toBe(false)
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false)
    expect(() => renderHook(() => useThemeSignal()).unmount()).not.toThrow()
  })
})
