// NET-D: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { radarQueries } from '@/data/radar/queries'
import { isDevnet } from '@/lib/network'
import { prefetchItem } from '../loader'
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface ChangesSearch extends RouteSearch {
  kind: 'all' | 'joins' | 'pose' | 'address' | 'keys'
}

/** Radar offers no devnet, and the loader skips hosted items while Decentralized only mode is on. */
export const changesPrefetch: Prefetch<NoParams, ChangesSearch> = (net) =>
  isDevnet(net) ? [] : [prefetchItem('http', radarQueries.changes(net), { wait: true })]

export type ApiSearch = RouteSearch

export const apiPrefetch: Prefetch<NoParams, ApiSearch> = () => []

export interface MapSearch extends RouteSearch {
  q?: string | undefined
  type?: ('regular' | 'evo')[] | undefined
  status?: ('enabled' | 'pose-banned')[] | undefined
  reach?: 'reachable' | 'unreachable' | undefined
  country?: string[] | undefined
  version?: string[] | undefined
  host?: string[] | undefined
  dkg?: string[] | undefined
  layer: 'mn' | 'nodes'
  place?: string | undefined
  region?: 'europe' | 'americas' | 'asia' | undefined
  protx?: string | undefined
  color?: 'reach' | 'pose' | 'version' | 'type' | undefined
  hide?: string[] | undefined
}

/** The masternodes' map reads Radar's list; every reachable node's, the geo document and the summary. */
export const mapPrefetch: Prefetch<NoParams, MapSearch> = (net, _params, search) =>
  isDevnet(net)
    ? []
    : search.layer === 'nodes'
      ? [
          prefetchItem('http', radarQueries.geo(net), { wait: true }),
          prefetchItem('http', radarQueries.summary(net)),
        ]
      : [prefetchItem('http', radarQueries.masternodes(net), { wait: true })]
