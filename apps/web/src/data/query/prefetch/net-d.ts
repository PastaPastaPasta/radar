// NET-D: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface ChangesSearch extends RouteSearch {
  kind: 'all' | 'joins' | 'pose' | 'address' | 'keys'
}

export function changesPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: ChangesSearch,
): PrefetchItem[] {
  return []
}

export type ApiSearch = RouteSearch

export function apiPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: ApiSearch,
): PrefetchItem[] {
  return []
}

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

export function mapPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: MapSearch,
): PrefetchItem[] {
  return []
}
