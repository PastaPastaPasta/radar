import type { QueryClient } from '@tanstack/query-core'
import { prefetchForRoute, routeNetwork, type PrefetchItem } from '@/data/query'
import type { NetworkId } from '@/lib/network'
import { loadBehindFirstPaint } from './first-load'
import type * as netAModule from '@/data/query/prefetch/net-a'
import type * as netBModule from '@/data/query/prefetch/net-b'
import type * as netCModule from '@/data/query/prefetch/net-c'
import type * as netDModule from '@/data/query/prefetch/net-d'
import type * as pBlocksModule from '@/data/query/prefetch/p-blocks'
import type * as pChainModule from '@/data/query/prefetch/p-chain'
import type * as pDataModule from '@/data/query/prefetch/p-data'
import type * as pHomeModule from '@/data/query/prefetch/p-home'
import type * as pIdModule from '@/data/query/prefetch/p-id'
import type * as pTokenModule from '@/data/query/prefetch/p-token'
import type * as pVoteModule from '@/data/query/prefetch/p-vote'
import type * as toolsModule from '@/data/query/prefetch/tools'
import type * as youModule from '@/data/query/prefetch/you'

interface PrefetchModules {
  'net-a': typeof netAModule
  'net-b': typeof netBModule
  'net-c': typeof netCModule
  'net-d': typeof netDModule
  'p-blocks': typeof pBlocksModule
  'p-chain': typeof pChainModule
  'p-data': typeof pDataModule
  'p-home': typeof pHomeModule
  'p-id': typeof pIdModule
  'p-token': typeof pTokenModule
  'p-vote': typeof pVoteModule
  tools: typeof toolsModule
  you: typeof youModule
}
export type PrefetchPackage = keyof PrefetchModules

type PrefetchOf<
  K extends PrefetchPackage,
  N extends keyof PrefetchModules[K],
> = PrefetchModules[K][N] extends (
  net: NetworkId,
  params: infer P,
  search: infer S,
) => PrefetchItem[]
  ? { params: P; search: S }
  : never

const loaders = import.meta.glob<unknown>(['../data/query/prefetch/*.ts', '!**/types.ts'])

const loadModule = (pkg: PrefetchPackage): Promise<unknown> => {
  const load = loaders[`../data/query/prefetch/${pkg}.ts`]
  return load ? load() : Promise.reject(new Error(`No prefetch module for ${pkg}`))
}

/**
 * A route loader that prefetches what its package's prefetch module lists (§6.3): `routePrefetch('p-vote',
 * 'votesPrefetch')` names the module `data/query/prefetch/<pkg>.ts` and its export. The module loads on demand, so no
 * client or query factory reaches the entry chunk, and the first load never waits for it. A prefetch is optional: a
 * module that fails to load or an item list that throws starts nothing, and a loader that re-runs for a changed search
 * (`cause: 'stay'`) starts its items without waiting for them.
 */
export function routePrefetch<K extends PrefetchPackage, N extends keyof PrefetchModules[K]>(
  pkg: K,
  name: N,
) {
  type T = PrefetchOf<K, N>
  return ({
    context,
    deps,
    params,
    preload,
    cause,
  }: {
    context: { queryClient: QueryClient }
    deps: T['search'] & { network?: string | undefined; net?: string | undefined }
    params: T['params']
    preload: boolean
    cause?: 'preload' | 'enter' | 'stay'
  }) =>
    loadBehindFirstPaint(
      async (opts) => {
        const net = routeNetwork(deps)
        let items: PrefetchItem[]
        try {
          const m = (await loadModule(pkg)) as PrefetchModules[K]
          const prefetch = m[name] as unknown as (
            net: NetworkId,
            params: T['params'],
            search: T['search'],
          ) => PrefetchItem[]
          items = prefetch(net, params, deps)
        } catch {
          return
        }
        return prefetchForRoute(context.queryClient, net, items, opts)
      },
      { preload: preload || cause === 'stay' },
    )
}
