import { describe, expect, it, vi } from 'vitest'
import { openDiagnosticsDrawer, registerDiagnosticsOpener } from './diagnostics'

describe('diagnostics opener', () => {
  it('does nothing until the You features register, then opens through them', () => {
    expect(() => {
      openDiagnosticsDrawer()
    }).not.toThrow()
    const open = vi.fn()
    const unregister = registerDiagnosticsOpener(open)
    openDiagnosticsDrawer()
    expect(open).toHaveBeenCalledTimes(1)
    unregister()
    openDiagnosticsDrawer()
    expect(open).toHaveBeenCalledTimes(1)
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
})
