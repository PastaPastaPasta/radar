import type { QueryClient } from '@tanstack/query-core'
import { prefetchForRoute, routeNetwork, type PrefetchItem } from '@/data/query'
import type { NetworkId } from '@/lib/network'
import { loadBehindFirstPaint } from './first-load'

/**
 * A route loader that prefetches what its package's prefetch module lists (§6.3). The module loads on demand, so no
 * client or query factory reaches the entry chunk, and the first load never waits for it.
 */
export function routePrefetch<
  M,
  P,
  S extends { network?: string | undefined; net?: string | undefined },
>(
  load: () => Promise<M>,
  pick: (m: M) => (net: NetworkId, params: P, search: S) => PrefetchItem[],
) {
  return ({
    context,
    deps,
    params,
    preload,
  }: {
    context: { queryClient: QueryClient }
    deps: S
    params: P
    preload: boolean
  }) =>
    loadBehindFirstPaint(
      async (opts) => {
        const net = routeNetwork(deps)
        const m = await load()
        return prefetchForRoute(context.queryClient, net, pick(m)(net, params, deps), opts)
      },
      { preload },
    )
}
