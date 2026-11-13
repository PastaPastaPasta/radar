// NET-D: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface ChangesSearch extends RouteSearch {
  kind: 'all' | 'joins' | 'pose' | 'address' | 'keys'
}

export const changesPrefetch: Prefetch<NoParams, ChangesSearch> = () => []

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

export const mapPrefetch: Prefetch<NoParams, MapSearch> = () => []
