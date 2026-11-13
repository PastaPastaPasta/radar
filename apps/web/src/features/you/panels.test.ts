import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDiagnostics, resetPanels, setPanelLoader } from './panels'

afterEach(() => {
  setPanelLoader('diagnostics', undefined)
  resetPanels()
})

describe('panel loaders', () => {
  it('loads a panel that was opened before its loader was set', () => {
    openDiagnostics()
    const load = vi.fn()
    setPanelLoader('diagnostics', load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads nothing for a closed panel', () => {
    const load = vi.fn()
    setPanelLoader('diagnostics', load)
    expect(load).not.toHaveBeenCalled()
  })
})
