// P-HOME: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface PlatformHomeSearch extends RouteSearch {
  range: '24h' | '3d' | '1w' | '1m'
  rich: 'balance' | 'txs'
}

export function platformHomePrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: PlatformHomeSearch,
): PrefetchItem[] {
  return []
}
