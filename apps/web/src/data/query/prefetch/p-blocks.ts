// P-BLOCKS: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NumericRange } from '@/lib/search-schemas'
import type { TransitionType } from '@/lib/tx-types'
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface PlatformBlocksSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  height?: NumericRange | undefined
  epoch?: NumericRange | undefined
  proposer?: string | undefined
  gas?: NumericRange | undefined
  txs?: NumericRange | undefined
  from?: string | undefined
  to?: string | undefined
  sort: string
}

export const platformBlocksPrefetch: Prefetch<NoParams, PlatformBlocksSearch> = () => []

export interface PlatformBlockSearch extends RouteSearch {
  tab: 'transitions' | 'quorum' | 'info'
  page: number
}

export const platformBlockPrefetch: Prefetch<{ id: string }, PlatformBlockSearch> = () => []

export interface PlatformTxsSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  type?: TransitionType[] | undefined
  batch?: string[] | undefined
  status?: 'success' | 'fail' | undefined
  gas?: NumericRange | undefined
  owner?: string | undefined
  from?: string | undefined
  to?: string | undefined
  sort: string
}

export const platformTxsPrefetch: Prefetch<NoParams, PlatformTxsSearch> = () => []

export interface PlatformTxSearch extends RouteSearch {
  raw: 'json' | 'hex' | 'base64'
}

export const platformTxPrefetch: Prefetch<{ hash: string }, PlatformTxSearch> = () => []
