// P-CHAIN: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface EpochsSearch extends RouteSearch {
  from?: number | undefined
  to?: number | undefined
}

export function epochsPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: EpochsSearch,
): PrefetchItem[] {
  return []
}

export interface EpochSearch extends RouteSearch {
  sort: string
}

export function epochPrefetch(
  _net: NetworkId,
  _params: { n: string },
  _search: EpochSearch,
): PrefetchItem[] {
  return []
}

export interface ProtocolSearch extends RouteSearch {
  sort: string
}

export function protocolPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: ProtocolSearch,
): PrefetchItem[] {
  return []
}

export interface QuorumsSearch extends RouteSearch {
  q?: string | undefined
  type?: string[] | undefined
}

export function quorumsPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: QuorumsSearch,
): PrefetchItem[] {
  return []
}

export interface CreditsSearch extends RouteSearch {
  id?: string | undefined
}

export function creditsPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: CreditsSearch,
): PrefetchItem[] {
  return []
}

export interface ShieldedSearch extends RouteSearch {
  range: '24h' | '3d' | '1w' | '1m'
  nf?: string | undefined
}

export function shieldedPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: ShieldedSearch,
): PrefetchItem[] {
  return []
}
