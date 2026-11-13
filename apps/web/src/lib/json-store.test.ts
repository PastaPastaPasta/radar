import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJsonStore } from './json-store'

const KEY = 'radar.test-store'
const parse = (raw: unknown): string[] => (Array.isArray(raw) ? raw.map(String) : [])

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('createJsonStore', () => {
  it('reads what is stored and keeps the same value until it changes', () => {
    localStorage.setItem(KEY, '["a","b"]')
    const store = createJsonStore(KEY, parse)
    const first = store.get()
    expect(first).toEqual(['a', 'b'])
    expect(store.get()).toBe(first)
  })

  it('reads an empty value from missing, malformed or wrong-shaped data', () => {
    for (const raw of [null, '{oops', '{"a":1}']) {
      localStorage.clear()
      if (raw !== null) localStorage.setItem(KEY, raw)
      expect(createJsonStore(KEY, parse).get()).toEqual([])
    }
  })

  it('writes through, tells subscribers and follows another tab', () => {
    const store = createJsonStore(KEY, parse)
    const seen = vi.fn()
    const off = store.subscribe(seen)
    store.set(['x'])
    expect(localStorage.getItem(KEY)).toBe('["x"]')
    expect(seen).toHaveBeenCalledTimes(1)

    localStorage.setItem(KEY, '["y"]')
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(seen).toHaveBeenCalledTimes(2)
    expect(store.get()).toEqual(['y'])

    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }))
    expect(seen).toHaveBeenCalledTimes(2)
    off()
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('keeps working for this tab when storage refuses reads and writes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const store = createJsonStore(KEY, parse)
    expect(store.get()).toEqual([])
    store.set(['kept'])
    expect(store.get()).toEqual(['kept'])
  })

  it('keeps a value storage refused to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const store = createJsonStore(KEY, parse)
    store.set(['kept'])
    expect(store.get()).toEqual(['kept'])
  })
})
