// P-BLOCKS: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { NumericRange } from '@/lib/search-schemas'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

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

export function platformBlocksPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: PlatformBlocksSearch,
): PrefetchItem[] {
  return []
}

export interface PlatformBlockSearch extends RouteSearch {
  tab: 'transitions' | 'quorum' | 'info'
  page: number
}

export function platformBlockPrefetch(
  _net: NetworkId,
  _params: { id: string },
  _search: PlatformBlockSearch,
): PrefetchItem[] {
  return []
}

export interface PlatformTxsSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  type?:
    | (
        | 'data-contract-create'
        | 'data-contract-update'
        | 'batch'
        | 'identity-create'
        | 'identity-top-up'
        | 'identity-update'
        | 'identity-credit-transfer'
        | 'identity-credit-withdrawal'
        | 'masternode-vote'
        | 'address-funds-transfer'
        | 'address-funding-from-asset-lock'
        | 'address-credit-withdrawal'
        | 'shielded'
      )[]
    | undefined
  batch?: string[] | undefined
  status?: 'success' | 'fail' | undefined
  gas?: NumericRange | undefined
  owner?: string | undefined
  from?: string | undefined
  to?: string | undefined
  sort: string
}

export function platformTxsPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: PlatformTxsSearch,
): PrefetchItem[] {
  return []
}

export interface PlatformTxSearch extends RouteSearch {
  raw: 'json' | 'hex' | 'base64'
}

export function platformTxPrefetch(
  _net: NetworkId,
  _params: { hash: string },
  _search: PlatformTxSearch,
): PrefetchItem[] {
  return []
}
