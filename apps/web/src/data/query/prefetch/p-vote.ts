// P-VOTE: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface NamesSearch extends RouteSearch {
  q?: string | undefined
  after?: string | undefined
}

export function namesPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: NamesSearch,
): PrefetchItem[] {
  return []
}

export type NameSearch = RouteSearch

export function namePrefetch(
  _net: NetworkId,
  _params: { label: string },
  _search: NameSearch,
): PrefetchItem[] {
  return []
}

export interface ContestsSearch extends RouteSearch {
  contract?: string | undefined
  type?: string | undefined
  status?: ('active' | 'won' | 'locked' | 'finished')[] | undefined
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  from?: string | undefined
  to?: string | undefined
  sort?: string | undefined
}

export function contestsPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: ContestsSearch,
): PrefetchItem[] {
  return []
}

export interface ContestSearch extends RouteSearch {
  contract?: string | undefined
  type?: string | undefined
  index?: string | undefined
  tab: 'tally' | 'votes' | 'raw'
  towards?: string | undefined
  page: number
}

export function contestPrefetch(
  _net: NetworkId,
  _params: { label: string },
  _search: ContestSearch,
): PrefetchItem[] {
  return []
}

export interface VotesSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  voter?: string | undefined
  towards?: string | undefined
  choice?: 'towards' | 'abstain' | 'lock' | undefined
  from?: string | undefined
  to?: string | undefined
}

export function votesPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: VotesSearch,
): PrefetchItem[] {
  return []
}

export interface PollsSearch extends RouteSearch {
  range: '24h' | '7d' | '30d' | '90d' | 'upcoming' | 'custom'
  from?: string | undefined
  to?: string | undefined
  dir: 'asc' | 'desc'
  page: number
}

export function pollsPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: PollsSearch,
): PrefetchItem[] {
  return []
}
