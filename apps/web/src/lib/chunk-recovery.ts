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

/**
 * TanStack Router reloads the page by itself, once per message, when a lazy route component's code is gone, unless this
 * key is set. Radar sets it for every chunk failure so its own recovery runs instead.
 */
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
  return Number.isFinite(at) && at > 0 && now >= at && now - at < RELOAD_GUARD_MS
}

/** Whether `reloadForChunk` would reload now, without reloading. */
export function mayReloadForChunk(now = Date.now()): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  return !reloadedRecently(now)
}

/**
 * Reloads the page once for a failed chunk, keeping the address. False when it must not: offline (the reload would end
 * on the browser's own error page), a reload already happened within the guard window, or storage is blocked (with no
 * guard a reload could loop).
 */
export function reloadForChunk(
  now = Date.now(),
  reload: () => void = () => window.location.reload(),
): boolean {
  if (!mayReloadForChunk(now)) return false
  if (!write(RELOAD_KEY, String(now))) return false
  reload()
  return true
}

/**
 * Forgets the router's reload keys once a page has loaded. They never expire by themselves, and Safari gives every
 * failed import the same message, so a key left over from one deploy would change how the next one recovers.
 */
export function clearRouterReloads(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(ROUTER_PREFIX)) keys.push(key)
    }
    for (const key of keys) sessionStorage.removeItem(key)
  } catch {
    // Storage blocked: nothing was stored.
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
 * Vite's `vite:preloadError`, which every dynamic import that fails passes through, before the router sees the error.
 * For a chunk failure it sets the router's reload key, so the router leaves the error to Radar's recovery (retry, one
 * guarded reload, then the error page) instead of reloading by itself. The event is never cancelled: a cancelled one
 * makes the import resolve with no module, which would break the page as if its code were wrong. Nothing reloads here,
 * so a failed background preload (a hovered link, the search dialog) never reloads the page.
 */
export function onPreloadError(event: Event): void {
  const error = (event as Event & { payload?: unknown }).payload
  if (!(error instanceof Error) || !isChunkFailure(error)) return
  write(routerKey(error), '1')
}
