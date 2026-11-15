import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRestoreScroll } from './use-scroll-restore'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ subscribe: () => () => undefined }),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { state: { __TSR_key: 'k1' }, href: '/masternodes' } }),
}))

let y = 0
const frame = (n = 1) => vi.advanceTimersByTime(16 * n)

describe('useRestoreScroll @W2-34', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    y = 0
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
    window.scrollTo = ((_x: number, to: number) => {
      y = to
    }) as typeof window.scrollTo
    sessionStorage.setItem('radar.scroll.k1', '1200')
  })

  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
  })

  it('puts the list back at its offset', () => {
    renderHook(() => useRestoreScroll(true))
    frame(2)
    expect(y).toBe(1200)
  })

  it('puts it back again when measuring the rows moves it, until the reader scrolls', () => {
    renderHook(() => useRestoreScroll(true))
    frame(2)
    y = 738
    frame(2)
    expect(y).toBe(1200)
    window.dispatchEvent(new Event('wheel'))
    y = 500
    frame(5)
    expect(y).toBe(500)
  })

  it('lets go once the offset has held, so the reader is not fought', () => {
    renderHook(() => useRestoreScroll(true))
    frame(2)
    frame(60)
    y = 900
    frame(5)
    expect(y).toBe(900)
  })

  it('waits for the list before it moves anything', () => {
    renderHook(() => useRestoreScroll(false))
    frame(5)
    expect(y).toBe(0)
  })
})
