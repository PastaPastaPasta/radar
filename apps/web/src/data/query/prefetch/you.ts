// YOU: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface SavedSearch extends RouteSearch {
  scope: 'network' | 'all'
  kind?: ('identity' | 'contract' | 'token')[] | undefined
}

export const savedPrefetch: Prefetch<NoParams, SavedSearch> = () => []

export type AboutSearch = RouteSearch

export const aboutPrefetch: Prefetch<NoParams, AboutSearch> = () => []
