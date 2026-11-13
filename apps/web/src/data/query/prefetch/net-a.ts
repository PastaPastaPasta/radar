// NET-A: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface NodesSearch extends RouteSearch {
  scope: 'all' | 'mn' | 'evo' | 'other'
  versions: 'now' | 'time'
  days: '1' | '7' | '30' | '90' | '365'
}

export function nodesPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: NodesSearch,
): PrefetchItem[] {
  return []
}

export type V24Search = RouteSearch

export function v24Prefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: V24Search,
): PrefetchItem[] {
  return []
}
