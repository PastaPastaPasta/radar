import type { DevnetConfig } from '@/lib/network'
import { setCoreCacheLoader, setDapiTransport } from './client'
import { createLazyDapiTransport } from './lazy'

/** Installs the production transport and the IndexedDB cache. Their code loads on the first Core request, not with the app. */
export function installProductionDapiTransport(opts: {
  devnets: () => readonly DevnetConfig[]
}): void {
  setCoreCacheLoader(async () => (await import('./cache')).sharedCoreCache())
  setDapiTransport(
    createLazyDapiTransport(async () => {
      const [{ PoolDapiTransport }, { sharedCoreCache }] = await Promise.all([
        import('./pool'),
        import('./cache'),
      ])
      return new PoolDapiTransport({ devnets: opts.devnets, nodeStore: sharedCoreCache() })
    }),
  )
}
