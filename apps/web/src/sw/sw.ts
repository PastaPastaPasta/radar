import { dropOldCaches, precache, respond, type SwEnv } from './sw-core'

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void
}
interface FetchEventLike extends ExtendableEventLike {
  request: Request
  respondWith(response: Promise<Response>): void
}
interface MessageEventLike extends ExtendableEventLike {
  data: unknown
  ports: readonly MessagePort[]
  source: { postMessage(message: unknown): void } | null
}
interface WorkerScope {
  location: Location
  fetch: typeof fetch
  caches: CacheStorage
  clients: { claim(): Promise<void> }
  addEventListener(type: 'install' | 'activate', listener: (e: ExtendableEventLike) => void): void
  addEventListener(type: 'fetch', listener: (e: FetchEventLike) => void): void
  addEventListener(type: 'message', listener: (e: MessageEventLike) => void): void
  skipWaiting(): Promise<void>
}

const scope = self as unknown as WorkerScope

const env: SwEnv = {
  caches: scope.caches,
  fetch: (input, init) => scope.fetch(input, init),
  origin: scope.location.origin,
  version: new URL(scope.location.href).searchParams.get('v') ?? 'dev',
}

// A new worker waits until the viewer asks for it (the page posts `skip-waiting`), so a tab never changes under its reader.
scope.addEventListener('install', (e) => {
  e.waitUntil(precache(env))
})

scope.addEventListener('activate', (e) => {
  e.waitUntil(dropOldCaches(env).then(() => scope.clients.claim()))
})

scope.addEventListener('fetch', (e) => {
  const answer = respond(env, e.request)
  if (answer) e.respondWith(answer)
})

scope.addEventListener('message', (e) => {
  const type = (e.data as { type?: unknown } | null)?.type
  if (type === 'skip-waiting') {
    e.waitUntil(scope.skipWaiting())
  } else if (type === 'version') {
    const reply = { type: 'version', version: env.version }
    if (e.ports[0]) e.ports[0].postMessage(reply)
    else e.source?.postMessage(reply)
  }
})
