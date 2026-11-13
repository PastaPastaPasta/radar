// YOU: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface SavedSearch extends RouteSearch {
  scope: 'network' | 'all'
  kind?: ('identity' | 'contract' | 'token')[] | undefined
}

export function savedPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: SavedSearch,
): PrefetchItem[] {
  return []
}

export type AboutSearch = RouteSearch

export function aboutPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: AboutSearch,
): PrefetchItem[] {
  return []
}
