// NET-C: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { Prefetch, RouteSearch } from './types'

export interface MnSearch extends RouteSearch {
  tab?: 'overview' | 'network' | 'platform' | 'history' | 'payments' | undefined
  epoch?: number | undefined
  before?: number | undefined
}

export const mnPrefetch: Prefetch<{ protx: string }, MnSearch> = () => []
