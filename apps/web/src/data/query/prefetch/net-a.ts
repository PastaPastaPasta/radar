// NET-A: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { radarQueries } from '@/data/radar/queries'
import { isDevnet } from '@/lib/network'
import { prefetchItem, type PrefetchItem } from '../loader'
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface NodesSearch extends RouteSearch {
  scope: 'all' | 'mn' | 'evo' | 'other'
  versions: 'now' | 'time'
  days: '1' | '7' | '30' | '90' | '365'
}

/** The census page's Radar documents; Radar offers no devnet, and the loader skips hosted items while the mode is on. */
export const nodesPrefetch: Prefetch<NoParams, NodesSearch> = (net, _params, search) => {
  if (isDevnet(net)) return []
  const days = Number(search.days) as 1 | 7 | 30 | 90 | 365
  const items: PrefetchItem[] = [
    prefetchItem('http', radarQueries.summary(net), { wait: true }),
    prefetchItem('http', radarQueries.status(net)),
    prefetchItem('http', radarQueries.releases()),
    prefetchItem('http', radarQueries.bench(net)),
    prefetchItem('http', radarQueries.history(net, { dim: 'totals', days })),
  ]
  if (search.versions === 'time') {
    const scope = search.scope === 'other' ? 'nonmn' : search.scope
    items.push(
      prefetchItem('http', radarQueries.history(net, { dim: 'version', scope, days, top: 8 })),
    )
  }
  return items
}

export type V24Search = RouteSearch

export const v24Prefetch: Prefetch<NoParams, V24Search> = (net) =>
  isDevnet(net) ? [] : [prefetchItem('http', radarQueries.activation(net), { wait: true })]
