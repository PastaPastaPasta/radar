/**
 * Recovery from a page's code failing to load. After a deploy the old build's chunk names are gone, so a visitor who
 * kept a tab open asks for files that no longer exist. Each failure is retried once, then the page is reloaded once
 * (keeping its address) to pick up the new build, then the branded error page shows. A `sessionStorage` timestamp
 * guards the reload, so a build that is broken for good never reloads in a loop.
 */

const CHUNK_FAILURE =
  /dynamically imported module|importing a module script failed|unable to preload css|ChunkLoadError|Loading (CSS )?chunk/i

/** A page's code that could not be fetched: the connection dropped, or a newer build replaced the file. */
export function isChunkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return CHUNK_FAILURE.test(`${error.name} ${error.message}`)
}

export const RELOAD_KEY = 'radar.chunk-reload'

/** A reload this recent did not help, so the next failure shows the error page instead of reloading again. */
export const RELOAD_GUARD_MS = 2 * 60_000

const ROUTER_PREFIX = 'tanstack_router_reload:'

/** The key TanStack Router sets before its own reload of a lazy route component; set here too so it doesn't reload twice. */
const routerKey = (error: Error) => `${ROUTER_PREFIX}${error.message}`

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): boolean {
  try {
    sessionStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** True when a reload for a failed chunk happened within the guard window. */
export function reloadedRecently(now = Date.now()): boolean {
  const at = Number(read(RELOAD_KEY))
  return Number.isFinite(at) && at > 0 && now - at < RELOAD_GUARD_MS
}

/** Whether `reloadForChunk` would reload now, without reloading. */
export function mayReloadForChunk(error: Error, now = Date.now()): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  return !reloadedRecently(now) && read(routerKey(error)) === null
}

/**
 * Reloads the page once for a failed chunk, keeping the address. False when it must not: offline (the reload would end
 * on the browser's own error page), a reload already happened within the guard window or the router already reloaded
 * for this error, or storage is blocked (with no guard a reload could loop).
 */
export function reloadForChunk(
  error: Error,
  now = Date.now(),
  reload: () => void = () => window.location.reload(),
): boolean {
  if (!mayReloadForChunk(error, now)) return false
  if (!write(RELOAD_KEY, String(now))) return false
  write(routerKey(error), '1')
  reload()
  return true
}

function routerKeys(): Set<string> {
  const keys = new Set<string>()
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(ROUTER_PREFIX)) keys.add(key)
    }
  } catch {
    // Storage blocked: the router cannot reload by itself either.
  }
  return keys
}

/**
 * TanStack Router reloads once by itself when a lazy route component's code is gone, setting its key first. A key that
 * appeared while this page was open means the page is leaving for that reload, which then counts as the guarded one.
 */
export function countRouterReloads(target: Pick<Window, 'addEventListener'> = window): void {
  const before = routerKeys()
  target.addEventListener('pagehide', () => {
    for (const key of routerKeys()) {
      if (!before.has(key)) {
        write(RELOAD_KEY, String(Date.now()))
        return
      }
    }
  })
}

/**
 * TanStack Router reloads by itself once for each failed lazy route component, keyed by the error's message and with
 * no time guard, so a second missing file after Radar's own reload would reload the page again. While a reload is
 * recent, the router reads its key as already set. Returns the undo.
 */
export function guardRouterReloads(): () => void {
  const proto = Storage.prototype
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called below with the storage as `this`
  const getItem = proto.getItem
  proto.getItem = function (this: Storage, key: string): string | null {
    if (key.startsWith(ROUTER_PREFIX) && reloadedRecently()) return '1'
    return getItem.call(this, key)
  }
  return () => {
    proto.getItem = getItem
  }
}

/** Runs `load`, and once more when the first attempt failed to fetch code. */
export async function retryChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (!isChunkFailure(error)) throw error
    return load()
  }
}

/**
 * Vite's `vite:preloadError`: a chunk's dependency failed to preload. Online, the page reloads once into the current
 * build; once that has been tried, or offline, the error goes on to the error page. Offline, the router's own reload is
 * marked as done so it doesn't land on the browser's error page either.
 */
export function onPreloadError(event: Event, now = Date.now(), reload?: () => void): void {
  const error = (event as Event & { payload?: unknown }).payload
  // Vite passes every failed dynamic import through this event, including a module that loaded and then threw.
  if (!(error instanceof Error) || !isChunkFailure(error)) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    write(routerKey(error), '1')
    return
  }
  if (reloadForChunk(error, now, reload)) event.preventDefault()
}
