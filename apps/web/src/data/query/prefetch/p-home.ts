// P-HOME: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface PlatformHomeSearch extends RouteSearch {
  range: '24h' | '3d' | '1w' | '1m'
  rich: 'balance' | 'txs'
}

export const platformHomePrefetch: Prefetch<NoParams, PlatformHomeSearch> = () => []
