// P-ID: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NumericRange } from '@/lib/search-schemas'
import type { NoParams, Prefetch, RouteSearch } from './types'

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

export const identitiesPrefetch: Prefetch<NoParams, IdentitiesSearch> = () => []

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

export const identityPrefetch: Prefetch<{ id: string }, IdentitySearch> = () => []

export interface IdentityLookupSearch extends RouteSearch {
  pkh?: string | undefined
  after?: string | undefined
}

export const identityLookupPrefetch: Prefetch<NoParams, IdentityLookupSearch> = () => []
