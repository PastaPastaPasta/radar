import { offlineResponse } from './offline-page'

/** Everything the worker does, free of the worker global so it can be tested with a fake cache and fetch. */
export interface SwEnv {
  caches: CacheStorage
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  origin: string
  /** The build this worker belongs to (`?v=` on its address). */
  version: string
}

export const CACHE_PREFIX = 'radar-v1:'
export const SHELL_URL = '/'
/** Pages with nothing to fetch, which the cached app shell can show when the network is down. */
export const LOCAL_PAGES: readonly string[] = ['/saved', '/settings', '/about']

export const cacheName = (version: string): string => `${CACHE_PREFIX}${version}`

const isAsset = (url: URL, origin: string): boolean =>
  url.origin === origin && url.pathname.startsWith('/assets/')

/** The hashed files a build's HTML names: its scripts, preloaded chunks and styles, and nothing from another origin. */
export function assetUrls(html: string, origin: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    let url: URL
    try {
      url = new URL(m[1] ?? '', origin)
    } catch {
      continue
    }
    if (isAsset(url, origin)) found.add(url.pathname)
  }
  return [...found]
}

/** Stores the app shell and every file it names, all or nothing: a shell with a missing file would be worse than none. */
export async function precache(env: SwEnv): Promise<void> {
  const shell = await env.fetch(SHELL_URL, { cache: 'reload' })
  if (!shell.ok || !(shell.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error('The app shell could not be fetched')
  }
  const urls = assetUrls(await shell.clone().text(), env.origin)
  const files = await Promise.all(
    urls.map(async (url) => {
      const res = await env.fetch(url, { cache: 'reload' })
      if (!res.ok) throw new Error(`${url} could not be fetched`)
      return [url, res] as const
    }),
  )
  const cache = await env.caches.open(cacheName(env.version))
  for (const [url, res] of files) await cache.put(url, res)
  await cache.put(SHELL_URL, shell)
}

/** Drops the caches of every other build. */
export async function dropOldCaches(env: SwEnv): Promise<void> {
  const keep = cacheName(env.version)
  const names = await env.caches.keys()
  await Promise.all(
    names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== keep).map((n) => env.caches.delete(n)),
  )
}

async function cacheFirst(env: SwEnv, request: Request): Promise<Response> {
  const cache = await env.caches.open(cacheName(env.version))
  const hit = await cache.match(request.url)
  if (hit) return hit
  const res = await env.fetch(request)
  if (res.ok && res.type !== 'opaque') await cache.put(request.url, res.clone())
  return res
}

async function navigate(env: SwEnv, request: Request): Promise<Response> {
  try {
    return await env.fetch(request)
  } catch {
    const { pathname } = new URL(request.url)
    if (LOCAL_PAGES.includes(pathname.replace(/\/+$/, ''))) {
      const shell = await (await env.caches.open(cacheName(env.version))).match(SHELL_URL)
      if (shell) return shell
    }
    return offlineResponse()
  }
}

/**
 * The worker's answer to a fetch, or nothing to leave it to the browser. It touches only same-origin GETs: a page
 * navigation (network first, then the offline fallback) and the build's hashed files (cache first, because their names
 * change with their content). No other request, so never an API answer, is stored or served.
 */
export function respond(env: SwEnv, request: Request): Promise<Response> | undefined {
  if (request.method !== 'GET' || request.headers.has('range')) return undefined
  const url = new URL(request.url)
  if (url.origin !== env.origin) return undefined
  if (request.mode === 'navigate') return navigate(env, request)
  if (isAsset(url, env.origin)) return cacheFirst(env, request)
  return undefined
}
