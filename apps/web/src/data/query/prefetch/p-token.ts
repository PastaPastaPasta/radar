// P-TOKEN: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface TokensSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  sort?: string | undefined
  owner?: string | undefined
  contract?: string | undefined
  q?: string | undefined
}

export function tokensPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: TokensSearch,
): PrefetchItem[] {
  return []
}

export interface TokenSearch extends RouteSearch {
  tab: 'overview' | 'definition' | 'activity' | 'holders' | 'distribution' | 'balance'
  who?: string | undefined
  page: number
}

export function tokenPrefetch(
  _net: NetworkId,
  _params: { id: string },
  _search: TokenSearch,
): PrefetchItem[] {
  return []
}

export interface TokenHoldersSearch extends RouteSearch {
  ids?: string[] | undefined
  page: number
}

export function tokenHoldersPrefetch(
  _net: NetworkId,
  _params: { id: string },
  _search: TokenHoldersSearch,
): PrefetchItem[] {
  return []
}

export interface PlatformAddressSearch extends RouteSearch {
  page: number
}

export function platformAddressPrefetch(
  _net: NetworkId,
  _params: { addr: string },
  _search: PlatformAddressSearch,
): PrefetchItem[] {
  return []
}
