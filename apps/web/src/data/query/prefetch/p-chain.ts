// P-CHAIN: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface EpochsSearch extends RouteSearch {
  from?: number | undefined
  to?: number | undefined
}

export const epochsPrefetch: Prefetch<NoParams, EpochsSearch> = () => []

export interface EpochSearch extends RouteSearch {
  sort: string
}

export const epochPrefetch: Prefetch<{ n: string }, EpochSearch> = () => []

export interface ProtocolSearch extends RouteSearch {
  sort: string
}

export const protocolPrefetch: Prefetch<NoParams, ProtocolSearch> = () => []

export interface QuorumsSearch extends RouteSearch {
  q?: string | undefined
  type?: string[] | undefined
}

export const quorumsPrefetch: Prefetch<NoParams, QuorumsSearch> = () => []

export interface CreditsSearch extends RouteSearch {
  id?: string | undefined
}

export const creditsPrefetch: Prefetch<NoParams, CreditsSearch> = () => []

export interface ShieldedSearch extends RouteSearch {
  range: '24h' | '3d' | '1w' | '1m'
  nf?: string | undefined
}

export const shieldedPrefetch: Prefetch<NoParams, ShieldedSearch> = () => []
