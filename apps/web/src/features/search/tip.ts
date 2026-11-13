import { skipToken, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { coreQueries } from '@/data/core/queries'
import { viewKeys } from '@/data/query/keys'
import type { platformTipQuery } from '@/data/sdk/queries'
import type { NetworkId } from '@/lib/network'
import type { Tip } from './classify'
import { searchEnv, type SdkState } from './env'
import type { SearchMode } from './types'

/** The SDK's state, read again when it changes. */
export function useSdkState(net: NetworkId): SdkState {
  return useSyncExternalStore(
    (cb) => searchEnv.subscribeSdk(cb),
    () => searchEnv.sdkState(net),
    () => 'cold',
  )
}

interface TipQueries {
  core: typeof coreQueries.tip
  platform: typeof platformTipQuery
}

/** A query that never runs, standing in until the factories load; it has the real query's type so the hook's result keeps it. */
function idleQuery<K extends keyof TipQueries>(name: K, net: NetworkId): ReturnType<TipQueries[K]> {
  return {
    queryKey: viewKeys(net, 'search-tip-idle', { name }),
    queryFn: skipToken,
  } as unknown as ReturnType<TipQueries[K]>
}

let tipQueries: Promise<TipQueries> | undefined

/** The two query factories, in a chunk of their own: they pull the DAPI and SDK method tables, which the entry must not hold. */
function loadTipQueries(): Promise<TipQueries> {
  tipQueries ??= Promise.all([import('@/data/core/queries'), import('@/data/sdk/queries')]).then(
    ([core, sdk]) => ({ core: core.coreQueries.tip, platform: sdk.platformTipQuery }),
  )
  // A chunk that fails to load is tried again on the next mount; search still works without the tips.
  tipQueries.catch(() => {
    tipQueries = undefined
  })
  return tipQueries
}

/**
 * The chain tips the app already holds, from the queries the header and the Platform pages share: the Core height
 * (DAPI), and the Platform height and epoch (one proof-checked `getEpochsInfo`). The Platform read starts only where
 * an SDK resolver may run, so typing in the palette never starts the SDK by itself.
 */
export function useSearchTip(
  net: NetworkId,
  mode: SearchMode,
  active = true,
): { tip: Tip | undefined; reading: boolean } {
  const sdkReady = useSdkState(net) === 'ready'
  const [queries, setQueries] = useState<TipQueries>()
  useEffect(() => {
    if (!active) return
    let live = true
    loadTipQueries().then(
      (q) => {
        if (live) setQueries(q)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [active])
  const core = useQuery(queries ? queries.core(net) : idleQuery<'core'>('core', net))
  const platform = useQuery(
    queries
      ? { ...queries.platform(net), enabled: mode === 'page' || sdkReady }
      : idleQuery<'platform'>('platform', net),
  )
  const coreHeight = core.data?.data.height
  const platformHeight = platform.data?.data.height
  const epoch = platform.data?.data.epoch.number
  const tip = useMemo((): Tip | undefined => {
    if (coreHeight === undefined && platformHeight === undefined && epoch === undefined) {
      return undefined
    }
    return {
      ...(coreHeight !== undefined && { core: coreHeight }),
      ...(platformHeight !== undefined && { platform: platformHeight }),
      ...(epoch !== undefined && { epoch }),
    }
  }, [coreHeight, platformHeight, epoch])
  useEffect(() => {
    searchEnv.publishTip(net, tip)
  }, [net, tip])
  return { tip, reading: active && (!queries || core.isLoading || platform.isLoading) }
}
