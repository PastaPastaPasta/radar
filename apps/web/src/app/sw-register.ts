import { trustedWorkerUrl } from '@/data/trusted-worker'
import { offerUpdate } from '@/features/you/update/update-state'

/** `on` registers the worker where it is off by default (a fixture build, a dev server); `off` removes it where it is on. */
export const SW_FLAG_KEY = 'radar.sw'
const SW_PATH = '/sw.js'
const CACHE_PREFIX = 'radar-v1:'
const CHECK_EVERY_MS = 30 * 60_000
const VISIBLE_THROTTLE_MS = 5 * 60_000
const ACTIVATION_TIMEOUT_MS = 5_000
/**
 * How long after the first paint the worker is registered. Its install fetches the shell and its files again, and the
 * zone's rate limit counts each of those requests against a page that has just loaded them, so they wait until the
 * page's own burst has passed (the limit's window is 10 s).
 */
export const SW_REGISTER_DELAY_MS = 15_000

export interface RegisterDeps {
  container?: ServiceWorkerContainer
  /** The build this page came from; the worker's address carries it, so a new build is a new worker. */
  version?: string
  /** `undefined` follows the build and the `radar.sw` flag. */
  enabled?: boolean
  reload?: () => void
  caches?: CacheStorage
}

function flag(): string | null {
  try {
    return globalThis.localStorage?.getItem(SW_FLAG_KEY) ?? null
  } catch {
    return null
  }
}

function isEnabled(): boolean {
  const f = flag()
  if (f === 'off') return false
  if (f === 'on') return true
  return import.meta.env.PROD && import.meta.env.VITE_DATA_MODE !== 'fixtures'
}

const versionOf = (worker: ServiceWorker): string | null => {
  try {
    return new URL(worker.scriptURL).searchParams.get('v')
  } catch {
    return null
  }
}

async function removeWorker(
  container: ServiceWorkerContainer,
  storage?: CacheStorage,
): Promise<void> {
  const registrations = await container.getRegistrations()
  await Promise.all(
    registrations.filter((r) => r.active?.scriptURL.includes(SW_PATH)).map((r) => r.unregister()),
  )
  if (!storage) return
  const names = await storage.keys()
  await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX)).map((n) => storage.delete(n)))
}

/** When to register: `SW_REGISTER_DELAY_MS` after the first paint, or at once where `radar.sw` is `on`. */
export function serviceWorkerDelay(): number {
  return flag() === 'on' ? 0 : SW_REGISTER_DELAY_MS
}

/**
 * Registers `/sw.js` (`main.tsx` calls it `serviceWorkerDelay()` after the first paint). It stays out of dev servers and fixture builds (whose
 * mock worker holds the same scope) unless `radar.sw` is `on`, and `off` removes it. A worker that finds a newer build
 * waiting raises the update notice; one for this page's own build takes over quietly.
 */
export function registerServiceWorker(deps: RegisterDeps = {}): () => void {
  const container =
    deps.container ?? (typeof navigator === 'undefined' ? undefined : navigator.serviceWorker)
  if (!container) return () => undefined
  const storage = deps.caches ?? (typeof caches === 'undefined' ? undefined : caches)
  if (!(deps.enabled ?? isEnabled())) {
    if (flag() === 'off') void removeWorker(container, storage).catch(() => undefined)
    return () => undefined
  }

  const version = deps.version ?? __APP_VERSION__
  const reload = deps.reload ?? (() => location.reload())
  let disposed = false
  let reloadRequested = false
  let reloaded = false
  const cleanups: (() => void)[] = []

  const doReload = () => {
    if (reloaded) return
    reloaded = true
    reload()
  }

  const onWaiting = (worker: ServiceWorker) => {
    if (disposed || worker.state !== 'installed') return
    if (versionOf(worker) === version) {
      worker.postMessage({ type: 'skip-waiting' })
      return
    }
    offerUpdate({
      apply() {
        if (worker.state !== 'installed') {
          doReload()
          return
        }
        reloadRequested = true
        worker.postMessage({ type: 'skip-waiting' })
        setTimeout(doReload, ACTIVATION_TIMEOUT_MS)
      },
    })
  }

  const onControllerChange = () => {
    if (reloadRequested) doReload()
  }
  container.addEventListener('controllerchange', onControllerChange)
  cleanups.push(() => {
    container.removeEventListener('controllerchange', onControllerChange)
  })

  const watch = (registration: ServiceWorkerRegistration) => {
    // The first install has no controller to replace, so the worker activates by itself and there is nothing to offer.
    const consider = (worker: ServiceWorker | null) => {
      if (worker && container.controller) onWaiting(worker)
    }
    consider(registration.waiting)
    const follow = (worker: ServiceWorker | null) => {
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') consider(worker)
      })
    }
    follow(registration.installing)
    const onFound = () => {
      follow(registration.installing)
    }
    registration.addEventListener('updatefound', onFound)

    let last = Date.now()
    const check = () => {
      last = Date.now()
      registration.update().catch(() => undefined)
    }
    const timer = setInterval(check, CHECK_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > VISIBLE_THROTTLE_MS) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    cleanups.push(() => {
      registration.removeEventListener('updatefound', onFound)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    })
  }

  const url = new URL(SW_PATH, location.href)
  url.searchParams.set('v', version)
  container
    .register(trustedWorkerUrl(url) as string, { scope: '/', updateViaCache: 'none' })
    .then((registration) => {
      if (!disposed) watch(registration)
    })
    // Blocked (a private window, a browser policy) or no worker to fetch: Radar works without one.
    .catch(() => undefined)

  return () => {
    disposed = true
    for (const cleanup of cleanups) cleanup()
  }
}
