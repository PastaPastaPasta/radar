import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRouterReloads,
  RELOAD_GUARD_MS,
  RELOAD_KEY,
  isChunkFailure,
  mayReloadForChunk,
  onPreloadError,
  reloadForChunk,
  reloadedRecently,
  retryChunk,
} from './chunk-recovery'

const MISSING =
  'Failed to fetch dynamically imported module: https://x.invalid/assets/MempoolPage-abc.js'
const SAFARI = 'Importing a module script failed.'
const chunkError = (message = MISSING) => new TypeError(message)
const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
}
const preloadError = (error: unknown) =>
  Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: error })

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
    SAFARI,
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

  it('reloads once and records when', () => {
    const reload = vi.fn()
    expect(reloadForChunk(T, reload)).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe(String(T))
    expect(reloadedRecently(T + 1000)).toBe(true)
  })

  it('does not reload again inside the guard window, so a broken build never loops', () => {
    const reload = vi.fn()
    expect(reloadForChunk(T, reload)).toBe(true)
    expect(reloadForChunk(T + 5000, reload)).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads again for a later deploy, once the guard window has passed', () => {
    const reload = vi.fn()
    reloadForChunk(T, reload)
    expect(reloadForChunk(T + RELOAD_GUARD_MS + 1, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not count a reload stamped in the future as recent', () => {
    sessionStorage.setItem(RELOAD_KEY, String(T + 60_000))
    expect(reloadedRecently(T)).toBe(false)
  })

  it('recovers by itself after every deploy on Safari, whose message never changes', () => {
    const reload = vi.fn()
    onPreloadError(preloadError(chunkError(SAFARI)))
    expect(reloadForChunk(T, reload)).toBe(true)
    // The next deploy, later in the same tab: the router's key from the first is still there.
    onPreloadError(preloadError(chunkError(SAFARI)))
    expect(mayReloadForChunk(T + RELOAD_GUARD_MS + 1)).toBe(true)
    expect(reloadForChunk(T + RELOAD_GUARD_MS + 1, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload offline, where the reload would land on the browser’s error page', () => {
    setOnline(false)
    const reload = vi.fn()
    expect(reloadForChunk(T, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload when storage is blocked, because nothing could stop a loop', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const reload = vi.fn()
    expect(mayReloadForChunk(T)).toBe(false)
    expect(reloadForChunk(T, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe("Vite's preload error", () => {
  it('tells the router not to reload for a chunk failure, and lets the error through', () => {
    const event = preloadError(chunkError())
    onPreloadError(event)
    expect(event.defaultPrevented).toBe(false)
    expect(sessionStorage.getItem(`tanstack_router_reload:${MISSING}`)).toBe('1')
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull()
  })

  it('does the same offline @NX-77', () => {
    setOnline(false)
    const event = preloadError(chunkError())
    onPreloadError(event)
    expect(event.defaultPrevented).toBe(false)
    expect(sessionStorage.getItem(`tanstack_router_reload:${MISSING}`)).toBe('1')
  })

  it('leaves a module that loaded and then threw alone', () => {
    const event = preloadError(new SyntaxError('Unexpected end of input'))
    onPreloadError(event)
    expect(event.defaultPrevented).toBe(false)
    expect(sessionStorage.length).toBe(0)
  })
})

describe('the router’s reload keys', () => {
  it('are cleared, leaving every other key', () => {
    sessionStorage.setItem(`tanstack_router_reload:${MISSING}`, '1')
    sessionStorage.setItem(`tanstack_router_reload:${SAFARI}`, '1')
    sessionStorage.setItem(RELOAD_KEY, '1')
    clearRouterReloads()
    expect(sessionStorage.length).toBe(1)
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe('1')
  })

  it('stay just after Radar reloaded for a chunk, so the router cannot reload again', () => {
    const T = 1_800_000_000_000
    sessionStorage.setItem(`tanstack_router_reload:${MISSING}`, '1')
    sessionStorage.setItem(RELOAD_KEY, String(T))
    clearRouterReloads(T + 1_000)
    expect(sessionStorage.getItem(`tanstack_router_reload:${MISSING}`)).toBe('1')
    clearRouterReloads(T + RELOAD_GUARD_MS + 1)
    expect(sessionStorage.getItem(`tanstack_router_reload:${MISSING}`)).toBeNull()
  })
})
