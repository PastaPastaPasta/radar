import { describe, expect, it } from 'vitest'
import { OFFLINE_STRINGS, offlineHtml } from './offline-page'
import { assetUrls, cacheName, dropOldCaches, precache, respond, type SwEnv } from './sw-core'

const ORIGIN = 'https://radar.test'

class FakeCache {
  readonly entries = new Map<string, Response>()
  match(key: string): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(new URL(key, ORIGIN).pathname)?.clone())
  }
  put(key: string, res: Response): Promise<void> {
    this.entries.set(new URL(key, ORIGIN).pathname, res)
    return Promise.resolve()
  }
}

class FakeStorage {
  readonly stores = new Map<string, FakeCache>()
  open(name: string): Promise<FakeCache> {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache())
    return Promise.resolve(this.stores.get(name)!)
  }
  keys(): Promise<string[]> {
    return Promise.resolve([...this.stores.keys()])
  }
  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.stores.delete(name))
  }
}

const HTML = `<!doctype html><html><head>
<script type="module" src="/assets/index-AAA.js"></script>
<link rel="modulepreload" href="/assets/vendor-BBB.js">
<link rel="stylesheet" href="/assets/index-CCC.css">
<link rel="icon" href="/favicon.svg">
<script src="https://cdn.example/x.js"></script>
</head><body></body></html>`

function setup(
  online = true,
  version = 'v1',
): { env: SwEnv; storage: FakeStorage; fetched: string[]; setOnline: (on: boolean) => void } {
  const storage = new FakeStorage()
  const fetched: string[] = []
  let up = online
  const env: SwEnv = {
    caches: storage as unknown as CacheStorage,
    origin: ORIGIN,
    version,
    fetch: (input) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.href,
        ORIGIN,
      )
      fetched.push(url.pathname)
      if (!up) return Promise.reject(new TypeError('offline'))
      if (url.pathname === '/') {
        return Promise.resolve(new Response(HTML, { headers: { 'content-type': 'text/html' } }))
      }
      if (url.pathname.startsWith('/assets/')) {
        return Promise.resolve(
          new Response(`file ${url.pathname}`, { headers: { 'content-type': 'text/javascript' } }),
        )
      }
      if (url.pathname === '/saved') {
        return Promise.resolve(new Response(HTML, { headers: { 'content-type': 'text/html' } }))
      }
      return Promise.resolve(
        new Response('{"live":1}', { headers: { 'content-type': 'application/json' } }),
      )
    },
  }
  return {
    env,
    storage,
    fetched,
    setOnline: (on) => {
      up = on
    },
  }
}

const get = (path: string, init: RequestInit & { mode?: RequestMode } = {}) =>
  new Request(`${ORIGIN}${path}`, init)
const navigation = (path: string) => {
  const r = get(path)
  Object.defineProperty(r, 'mode', { value: 'navigate' })
  return r
}

describe('assetUrls', () => {
  it('lists only the build’s hashed files on this origin', () => {
    expect(assetUrls(HTML, ORIGIN)).toEqual([
      '/assets/index-AAA.js',
      '/assets/vendor-BBB.js',
      '/assets/index-CCC.css',
    ])
  })
})

describe('precache', () => {
  it('stores the shell and every file it names', async () => {
    const { env, storage } = setup()
    await precache(env)
    const cache = storage.stores.get(cacheName('v1'))!
    expect([...cache.entries.keys()].sort()).toEqual([
      '/',
      '/assets/index-AAA.js',
      '/assets/index-CCC.css',
      '/assets/vendor-BBB.js',
    ])
  })

  it('stores nothing when one file is missing, so a shell never points at a file it does not have', async () => {
    const { env, storage } = setup()
    const real = env.fetch
    env.fetch = (input, init) => {
      const href =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.href
      return href.includes('vendor')
        ? Promise.resolve(new Response('', { status: 404 }))
        : real(input, init)
    }
    await expect(precache(env)).rejects.toThrow(/vendor-BBB/)
    expect(storage.stores.size).toBe(0)
  })
})

describe('dropOldCaches', () => {
  it('deletes the caches of other builds and leaves other names alone', async () => {
    const { env, storage } = setup(true, 'v2')
    await storage.open(cacheName('v1'))
    await storage.open(cacheName('v2'))
    await storage.open('something-else')
    await dropOldCaches(env)
    expect([...storage.stores.keys()].sort()).toEqual([cacheName('v2'), 'something-else'])
  })
})

describe('respond', () => {
  it('serves a hashed file from the cache without asking the network again', async () => {
    const { env, fetched } = setup()
    await respond(env, get('/assets/index-AAA.js'))
    await respond(env, get('/assets/index-AAA.js'))
    expect(fetched.filter((p) => p === '/assets/index-AAA.js')).toHaveLength(1)
  })

  it('leaves everything that is not a page or a hashed file to the browser, so no API answer is stored', () => {
    const { env, storage } = setup()
    expect(respond(env, get('/x/hy/v1/summary'))).toBeUndefined()
    expect(respond(env, get('/api/v1/status'))).toBeUndefined()
    expect(respond(env, get('/sw.js'))).toBeUndefined()
    expect(respond(env, get('/assets/index-AAA.js', { method: 'POST' }))).toBeUndefined()
    expect(
      respond(env, get('/assets/big.wasm', { headers: { range: 'bytes=0-9' } })),
    ).toBeUndefined()
    expect(
      respond(new Proxy(env, {}), new Request('https://elsewhere.test/assets/a.js')),
    ).toBeUndefined()
    expect(storage.stores.size).toBe(0)
  })

  it('asks the network first for a page, and does not store it', async () => {
    const { env, storage } = setup()
    const res = await respond(env, navigation('/identity/abc'))!
    expect(res.status).toBe(200)
    expect(storage.stores.size).toBe(0)
  })

  it('answers a page with the offline page when the network fails', async () => {
    const { env } = setup(false)
    const res = await respond(env, navigation('/identity/abc'))!
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('data-offline-page')
  })

  it('shows the cached shell for a page that needs no data, and the offline page for the rest', async () => {
    const { env, setOnline } = setup()
    await precache(env)
    setOnline(false)
    const saved = await respond(env, navigation('/saved?network=testnet'))!
    expect(await saved.text()).toBe(HTML)
    const settings = await respond(env, navigation('/settings'))!
    expect(await settings.text()).toBe(HTML)
    const identity = await respond(env, navigation('/identity/abc'))!
    expect(await identity.text()).toContain('data-offline-page')
  })

  it('serves cached files offline', async () => {
    const { env, setOnline } = setup()
    await precache(env)
    setOnline(false)
    const res = await respond(env, get('/assets/index-AAA.js'))!
    expect(await res.text()).toBe('file /assets/index-AAA.js')
  })
})

describe('offline page', () => {
  it('names itself in every language and keeps the user’s data out of markup', () => {
    const html = offlineHtml()
    expect(Object.keys(OFFLINE_STRINGS).sort()).toEqual([
      'de',
      'en',
      'es',
      'fr',
      'ja',
      'pt',
      'ru',
      'tr',
      'uk',
      'zh',
    ])
    expect(html).toContain('textContent')
    expect(html).not.toContain('innerHTML')
    expect(html).not.toMatch(/<script[^>]+src=/)
  })
})
