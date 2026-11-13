// P-VOTE: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface NamesSearch extends RouteSearch {
  q?: string | undefined
  after?: string | undefined
}

export const namesPrefetch: Prefetch<NoParams, NamesSearch> = () => []

export type NameSearch = RouteSearch

export const namePrefetch: Prefetch<{ label: string }, NameSearch> = () => []

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

export const contestsPrefetch: Prefetch<NoParams, ContestsSearch> = () => []

export interface ContestSearch extends RouteSearch {
  contract?: string | undefined
  type?: string | undefined
  index?: string | undefined
  tab: 'tally' | 'votes' | 'raw'
  towards?: string | undefined
  page: number
}

export const contestPrefetch: Prefetch<{ label: string }, ContestSearch> = () => []

export interface VotesSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  voter?: string | undefined
  towards?: string | undefined
  choice?: 'towards' | 'abstain' | 'lock' | undefined
  from?: string | undefined
  to?: string | undefined
}

export const votesPrefetch: Prefetch<NoParams, VotesSearch> = () => []

export interface PollsSearch extends RouteSearch {
  range: '24h' | '7d' | '30d' | '90d' | 'upcoming' | 'custom'
  from?: string | undefined
  to?: string | undefined
  dir: 'asc' | 'desc'
  page: number
}

export const pollsPrefetch: Prefetch<NoParams, PollsSearch> = () => []
