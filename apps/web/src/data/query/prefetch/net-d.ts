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
  color: 'reach' | 'pose' | 'version' | 'type'
  hide?: string[] | undefined
  protx?: string | undefined
}

export const mapPrefetch: Prefetch<NoParams, MapSearch> = (net) =>
  isDevnet(net)
    ? []
    : [
        prefetchItem('http', radarQueries.masternodes(net), { wait: true }),
        prefetchItem('http', radarQueries.geo(net)),
      ]
