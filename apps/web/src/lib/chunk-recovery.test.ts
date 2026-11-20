import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countRouterReloads,
  guardRouterReloads,
  RELOAD_GUARD_MS,
  RELOAD_KEY,
  isChunkFailure,
  onPreloadError,
  reloadForChunk,
  reloadedRecently,
  retryChunk,
} from './chunk-recovery'

const MISSING =
  'Failed to fetch dynamically imported module: https://x.invalid/assets/MempoolPage-abc.js'
const chunkError = (message = MISSING) => new TypeError(message)
const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
}

beforeEach(() => {
  sessionStorage.clear()
  setOnline(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  setOnline(true)
})

describe('chunk failures', () => {
  it.each([
    MISSING,
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/x.css',
  ])('reads "%s" as a chunk that failed to load', (message) => {
    expect(isChunkFailure(new TypeError(message))).toBe(true)
  })

  it('does not read other errors, or non-errors, as chunk failures', () => {
    expect(isChunkFailure(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkFailure(MISSING)).toBe(false)
  })
})

describe('retrying an import once', () => {
  it('asks a second time when the first attempt failed to fetch code', async () => {
    const load = vi.fn().mockRejectedValueOnce(chunkError()).mockResolvedValueOnce('page')
    await expect(retryChunk(load)).resolves.toBe('page')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('gives up after the second failure', async () => {
    const load = vi.fn().mockRejectedValue(chunkError())
    await expect(retryChunk(load)).rejects.toThrow(/dynamically imported/)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not retry an error that is not about fetching code', async () => {
    const load = vi.fn().mockRejectedValue(new Error('module threw'))
    await expect(retryChunk(load)).rejects.toThrow('module threw')
    expect(load).toHaveBeenCalledOnce()
  })
})

describe('the guarded reload', () => {
  const T = 1_800_000_000_000

  it('reloads once, records when, and tells the router not to reload too', () => {
    const reload = vi.fn()
    expect(reloadForChunk(chunkError(), T, reload)).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe(String(T))
    expect(sessionStorage.getItem(`tanstack_router_reload:${MISSING}`)).toBe('1')
    expect(reloadedRecently(T + 1000)).toBe(true)
  })

  it('does not reload again inside the guard window, so a broken build never loops', () => {
    const reload = vi.fn()
    expect(reloadForChunk(chunkError(), T, reload)).toBe(true)
    expect(
      reloadForChunk(chunkError('error loading dynamically imported module'), T + 5000, reload),
    ).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads again for a later deploy, once the guard window has passed', () => {
    const reload = vi.fn()
    reloadForChunk(chunkError(), T, reload)
    const later = chunkError(MISSING.replace('abc', 'def'))
    expect(reloadForChunk(later, T + RELOAD_GUARD_MS + 1, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload when the router already reloaded for this failure', () => {
    sessionStorage.setItem(`tanstack_router_reload:${MISSING}`, '1')
    const reload = vi.fn()
    expect(reloadForChunk(chunkError(), T, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload offline, where the reload would land on the browser’s error page', () => {
    setOnline(false)
    const reload = vi.fn()
    expect(reloadForChunk(chunkError(), T, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload when storage is blocked, because nothing could stop a loop', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const reload = vi.fn()
    expect(reloadForChunk(chunkError(), T, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('the router’s own reload', () => {
  it('counts as the guarded reload, so the page does not reload a second time', () => {
    const target = new EventTarget()
    countRouterReloads(target)
    sessionStorage.setItem(`tanstack_router_reload:${MISSING}`, '1')
    target.dispatchEvent(new Event('pagehide'))
    expect(reloadedRecently()).toBe(true)
    const reload = vi.fn()
    expect(
      reloadForChunk(chunkError('error loading dynamically imported module'), Date.now(), reload),
    ).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('is not made a second time while Radar’s own reload is recent', () => {
    const undo = guardRouterReloads()
    try {
      const key = `tanstack_router_reload:${MISSING}`
      expect(sessionStorage.getItem(key)).toBeNull()
      reloadForChunk(chunkError('error loading dynamically imported module'), Date.now(), vi.fn())
      expect(sessionStorage.getItem(key)).toBe('1')
      expect(sessionStorage.getItem('other')).toBeNull()
      sessionStorage.setItem(RELOAD_KEY, String(Date.now() - RELOAD_GUARD_MS - 1))
      expect(sessionStorage.getItem(key)).toBeNull()
    } finally {
      undo()
    }
  })

  it('does not count a key from before this page was opened', () => {
    sessionStorage.setItem(`tanstack_router_reload:${MISSING}`, '1')
    const target = new EventTarget()
    countRouterReloads(target)
    target.dispatchEvent(new Event('pagehide'))
    expect(reloadedRecently()).toBe(false)
  })
})

describe("Vite's preload error", () => {
  const preloadError = (message: string) =>
    Object.assign(new Event('vite:preloadError', { cancelable: true }), {
      payload: new TypeError(message),
    })

  it('reloads once online and stops Vite from throwing', () => {
    const reload = vi.fn()
    const event = preloadError(MISSING)
    onPreloadError(event, 1, reload)
    expect(reload).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves a module that loaded and then threw to the error page, without reloading', () => {
    const reload = vi.fn()
    const event = Object.assign(new Event('vite:preloadError', { cancelable: true }), {
      payload: new SyntaxError('Unexpected end of input'),
    })
    onPreloadError(event, 1, reload)
    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    expect(sessionStorage.length).toBe(0)
  })

  it('lets the error through to the error page once the reload has been tried', () => {
    const reload = vi.fn()
    onPreloadError(preloadError(MISSING), 1, reload)
    const again = preloadError(MISSING)
    onPreloadError(again, 2, reload)
    expect(reload).toHaveBeenCalledOnce()
    expect(again.defaultPrevented).toBe(false)
  })

  it('offline, marks the router’s reload as done instead of reloading @NX-77', () => {
    setOnline(false)
    const reload = vi.fn()
    onPreloadError(preloadError(MISSING), 1, reload)
    expect(reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(`tanstack_router_reload:${MISSING}`)).toBe('1')
  })
})
