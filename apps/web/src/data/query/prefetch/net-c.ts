// NET-C: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { RouteSearch } from './types'

export interface MnSearch extends RouteSearch {
  tab?: 'overview' | 'network' | 'platform' | 'history' | 'payments' | undefined
  epoch?: number | undefined
  before?: number | undefined
}

export function mnPrefetch(
  _net: NetworkId,
  _params: { protx: string },
  _search: MnSearch,
): PrefetchItem[] {
  return []
}
