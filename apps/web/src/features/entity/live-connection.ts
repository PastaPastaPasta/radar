import { useEffect } from 'react'
import type { LiveStatus } from '@/data/core/live'
import type { NetworkId } from '@/lib/network'
import { setLiveConnection, type LiveConnection } from '@/ui/live-connection'

/** Folds the stream's state and the browser's own online flag into what the page shows. */
export function connectionOf(
  status: LiveStatus,
  online: boolean,
  offlineAt: number | undefined,
  now: number,
): LiveConnection {
  const lastEventAt = status.lastEventAt ?? status.since
  if (!online) return { state: 'stopped', lastEventAt: offlineAt ?? lastEventAt ?? now }
  switch (status.state) {
    // `idle` is a stream nobody has opened (page tests, the kit): there is nothing to qualify.
    case 'idle':
    case 'live':
      return { state: 'live' }
    case 'connecting':
      return { state: 'connecting' }
    case 'reconnecting':
      return { state: 'reconnecting', lastEventAt }
    case 'polling':
      return { state: 'polling', lastEventAt }
    case 'stopped':
      return { state: 'stopped', lastEventAt }
  }
}

/**
 * Mirrors `coreLive`'s tip stream and the browser's online flag into the shared connection state, which every "Live"
 * on the page reads (IN-15). The shell mounts it once; `coreLive` is loaded on demand, as `useLiveTip` does.
 */
export function useLiveConnectionFeed(net: NetworkId): void {
  useEffect(() => {
    let cancelled = false
    let offlineAt = navigator.onLine ? undefined : Date.now()
    let sync = () => undefined as void
    const onOnline = () => {
      offlineAt = undefined
      sync()
    }
    const onOffline = () => {
      offlineAt = Date.now()
      sync()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    let unsubscribe: (() => void) | undefined
    void import('@/data/core/live').then(({ coreLive }) => {
      if (cancelled) return
      sync = () =>
        setLiveConnection(
          connectionOf(coreLive.status(net), navigator.onLine, offlineAt, Date.now()),
        )
      unsubscribe = coreLive.subscribe(sync)
      sync()
    })
    return () => {
      cancelled = true
      unsubscribe?.()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [net])
}
