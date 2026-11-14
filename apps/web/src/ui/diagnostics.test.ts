import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDiagnosticsDrawer, registerDiagnosticsOpener, REQUEST_TTL_MS } from './diagnostics'

describe('diagnostics opener', () => {
  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState(null, '', '/')
    registerDiagnosticsOpener(undefined)
  })

  it('opens through the opener the You features register, and not after it unregisters', () => {
    const open = vi.fn()
    const unregister = registerDiagnosticsOpener(open)
    openDiagnosticsDrawer()
    expect(open).toHaveBeenCalledTimes(1)
    unregister()
    expect(() => {
      openDiagnosticsDrawer()
    }).not.toThrow()
    expect(open).toHaveBeenCalledTimes(1)
    registerDiagnosticsOpener(undefined)
  })

  it('opens a drawer asked for before the You features registered, once they do', () => {
    openDiagnosticsDrawer()
    const open = vi.fn()
    const unregister = registerDiagnosticsOpener(open)
    expect(open).toHaveBeenCalledTimes(1)
    unregister()
    const later = vi.fn()
    const unregisterLater = registerDiagnosticsOpener(later)
    expect(later).not.toHaveBeenCalled()
    unregisterLater()
  })

  it('lets a newer opener stand when an older one unregisters late', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registerDiagnosticsOpener(first)
    const unregisterSecond = registerDiagnosticsOpener(second)
    unregisterFirst()
    openDiagnosticsDrawer()
    expect(second).toHaveBeenCalledTimes(1)
    unregisterSecond()
  })
  it('drops a click that waited past the limit', () => {
    vi.useFakeTimers()
    openDiagnosticsDrawer()
    vi.advanceTimersByTime(REQUEST_TTL_MS + 1)
    const open = vi.fn()
    registerDiagnosticsOpener(open)
    expect(open).not.toHaveBeenCalled()
  })

  it('drops a click when the reader has navigated away before the features registered', () => {
    window.history.replaceState(null, '', '/status')
    openDiagnosticsDrawer()
    window.history.pushState(null, '', '/blocks')
    const open = vi.fn()
    registerDiagnosticsOpener(open)
    expect(open).not.toHaveBeenCalled()
  })
})
