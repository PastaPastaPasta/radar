import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SOURCE_MODE_KEY,
  decentralizedOnly,
  getSourceModeState,
  setSourceModeFromLink,
  subscribeSourceMode,
  writeSourceMode,
} from './source-mode'

const reset = () => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage', { key: null }))
  setSourceModeFromLink(undefined)
}
beforeEach(reset)
afterEach(reset)

const otherTab = (value: string | null) => {
  if (value === null) localStorage.removeItem(SOURCE_MODE_KEY)
  else localStorage.setItem(SOURCE_MODE_KEY, value)
  window.dispatchEvent(new StorageEvent('storage', { key: SOURCE_MODE_KEY, newValue: value }))
}

describe('the Decentralized only setting @X-05 @X-09', () => {
  it('is off until chosen', () => {
    expect(decentralizedOnly()).toBe(false)
    expect(getSourceModeState()).toEqual({ mode: 'all', remembered: 'all', fromLink: false })
  })

  it('is remembered in this browser, and forgotten again when switched off', () => {
    writeSourceMode('decentralized')
    expect(decentralizedOnly()).toBe(true)
    expect(localStorage.getItem(SOURCE_MODE_KEY)).toBe('decentralized')
    expect(getSourceModeState()).toEqual({
      mode: 'decentralized',
      remembered: 'decentralized',
      fromLink: false,
    })
    writeSourceMode('all')
    expect(decentralizedOnly()).toBe(false)
    expect(localStorage.getItem(SOURCE_MODE_KEY)).toBeNull()
  })

  it('reads any stored value other than "decentralized" as all sources', () => {
    otherTab('nonsense')
    expect(decentralizedOnly()).toBe(false)
  })

  it('follows a change another tab makes: the gate and the snapshot move together, with one notification', () => {
    const cb = vi.fn()
    const off = subscribeSourceMode(cb)
    otherTab('decentralized')
    expect(decentralizedOnly()).toBe(true)
    expect(getSourceModeState().remembered).toBe('decentralized')
    expect(cb).toHaveBeenCalledTimes(1)
    otherTab('decentralized')
    expect(cb).toHaveBeenCalledTimes(1)
    otherTab(null)
    expect(decentralizedOnly()).toBe(false)
    expect(cb).toHaveBeenCalledTimes(2)
    off()
  })

  it('ignores storage events for other keys', () => {
    const cb = vi.fn()
    const off = subscribeSourceMode(cb)
    localStorage.setItem(SOURCE_MODE_KEY, 'decentralized')
    window.dispatchEvent(new StorageEvent('storage', { key: 'radar.unit', newValue: 'USD' }))
    expect(decentralizedOnly()).toBe(false)
    expect(cb).not.toHaveBeenCalled()
    off()
  })

  it('tells subscribers once per change, and not when nothing changed', () => {
    const cb = vi.fn()
    const off = subscribeSourceMode(cb)
    writeSourceMode('decentralized')
    writeSourceMode('decentralized')
    expect(cb).toHaveBeenCalledTimes(1)
    writeSourceMode('all')
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    writeSourceMode('decentralized')
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('keeps one snapshot object until something changes', () => {
    const first = getSourceModeState()
    expect(getSourceModeState()).toBe(first)
    writeSourceMode('decentralized')
    expect(getSourceModeState()).not.toBe(first)
  })
})

describe('?sources=decentralized @X-05 @X-09', () => {
  it('turns the mode on for the visit without remembering it', () => {
    setSourceModeFromLink('decentralized')
    expect(getSourceModeState()).toEqual({
      mode: 'decentralized',
      remembered: 'all',
      fromLink: true,
    })
    expect(localStorage.getItem(SOURCE_MODE_KEY)).toBeNull()
  })

  it('ends when the address drops the parameter', () => {
    setSourceModeFromLink('decentralized')
    setSourceModeFromLink(undefined)
    expect(decentralizedOnly()).toBe(false)
  })

  it('ignores any other value', () => {
    setSourceModeFromLink('all')
    expect(decentralizedOnly()).toBe(false)
    setSourceModeFromLink('everything')
    expect(decentralizedOnly()).toBe(false)
  })

  it('keeps the mode on while the link says so, even if the setting is switched off', () => {
    setSourceModeFromLink('decentralized')
    writeSourceMode('all')
    expect(decentralizedOnly()).toBe(true)
  })

  it('leaves a remembered choice on when the address has no parameter', () => {
    writeSourceMode('decentralized')
    setSourceModeFromLink(undefined)
    expect(decentralizedOnly()).toBe(true)
  })

  it('tells subscribers when the link changes the mode', () => {
    const cb = vi.fn()
    const off = subscribeSourceMode(cb)
    setSourceModeFromLink('decentralized')
    setSourceModeFromLink('decentralized')
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })
})
