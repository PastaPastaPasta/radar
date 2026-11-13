// P-TOKEN: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface TokensSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  sort?: string | undefined
  owner?: string | undefined
  contract?: string | undefined
  q?: string | undefined
}

export const tokensPrefetch: Prefetch<NoParams, TokensSearch> = () => []

export interface TokenSearch extends RouteSearch {
  tab: 'overview' | 'definition' | 'activity' | 'holders' | 'distribution' | 'balance'
  who?: string | undefined
  page: number
}

export const tokenPrefetch: Prefetch<{ id: string }, TokenSearch> = () => []

export interface TokenHoldersSearch extends RouteSearch {
  ids?: string[] | undefined
  page: number
}

export const tokenHoldersPrefetch: Prefetch<{ id: string }, TokenHoldersSearch> = () => []

export interface PlatformAddressSearch extends RouteSearch {
  page: number
}

export const platformAddressPrefetch: Prefetch<{ addr: string }, PlatformAddressSearch> = () => []
