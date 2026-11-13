// P-ID: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { NumericRange } from '@/lib/search-schemas'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface IdentitiesSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  sort: string
  type?: string[] | undefined
  bal?: NumericRange | undefined
  txs?: NumericRange | undefined
  docs?: NumericRange | undefined
  contracts?: NumericRange | undefined
  from?: string | undefined
  to?: string | undefined
}

export function identitiesPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: IdentitiesSearch,
): PrefetchItem[] {
  return []
}

export interface IdentitySearch extends RouteSearch {
  tab:
    | 'overview'
    | 'keys'
    | 'names'
    | 'tokens'
    | 'groups'
    | 'votes'
    | 'transactions'
    | 'contracts'
    | 'documents'
    | 'transfers'
    | 'advanced'
  page: number
  contract?: string | undefined
  type?: string | undefined
  tokens?: string[] | undefined
}

export function identityPrefetch(
  _net: NetworkId,
  _params: { id: string },
  _search: IdentitySearch,
): PrefetchItem[] {
  return []
}

export interface IdentityLookupSearch extends RouteSearch {
  pkh?: string | undefined
  after?: string | undefined
}

export function identityLookupPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: IdentityLookupSearch,
): PrefetchItem[] {
  return []
}
