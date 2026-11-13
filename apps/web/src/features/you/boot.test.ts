import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetDevFlags, setDevFlag } from './dev-flags'
import { installYou } from './boot'
import { panelsState, resetPanels } from './panels'

let stop: () => void
const loaders = { proof: vi.fn(), diagnostics: vi.fn(), update: vi.fn() }

const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      code,
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  )

beforeEach(() => {
  localStorage.clear()
  forgetDevFlags()
  resetPanels()
  loaders.proof.mockClear()
  loaders.diagnostics.mockClear()
  stop = installYou(loaders)
})
afterEach(() => {
  stop()
  localStorage.clear()
  forgetDevFlags()
  resetPanels()
})

describe('keyboard shortcuts @NX-61 @NX-62', () => {
  it('Alt+Shift+P opens the proof inspector and loads its code, and again closes it', () => {
    press('KeyP')
    expect(panelsState().proof.open).toBe(true)
    expect(loaders.proof).toHaveBeenCalledTimes(1)
    press('KeyP')
    expect(panelsState().proof.open).toBe(false)
  })

  it('Alt+Shift+D opens diagnostics', () => {
    press('KeyD')
    expect(panelsState().diagnostics.open).toBe(true)
    expect(loaders.diagnostics).toHaveBeenCalledTimes(1)
  })

  it('does nothing when its switch is off, in a text field, or with another modifier', () => {
    setDevFlag('proofShortcut', false)
    press('KeyP')
    expect(panelsState().proof.open).toBe(false)

    const input = document.createElement('input')
    document.body.append(input)
    press('KeyD', {}, input)
    expect(panelsState().diagnostics.open).toBe(false)
    input.remove()

    press('KeyD', { ctrlKey: true })
    press('KeyD', { shiftKey: false })
    expect(panelsState().diagnostics.open).toBe(false)
  })
})
