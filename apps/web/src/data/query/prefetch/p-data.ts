// P-DATA: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NumericRange, WhereClause } from '@/lib/search-schemas'
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface ContractsSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  sort: string
  owner?: string | undefined
  system?: true | undefined
  tokens?: true | undefined
  docs?: NumericRange | undefined
  from?: string | undefined
  to?: string | undefined
}

export const contractsPrefetch: Prefetch<NoParams, ContractsSearch> = () => []

export interface ContractSearch extends RouteSearch {
  tab:
    | 'overview'
    | 'schema'
    | 'types'
    | 'tokens'
    | 'groups'
    | 'history'
    | 'config'
    | 'transactions'
    | 'documents'
  type?: string | undefined
  owner?: string | undefined
  page: number
  rev?: number | undefined
  path?: string | undefined
}

export const contractPrefetch: Prefetch<{ id: string }, ContractSearch> = () => []

export interface ContractDocumentsSearch extends RouteSearch {
  where?: WhereClause[] | undefined
  order?: string[] | undefined
  limit: 10 | 25 | 50 | 100
  after?: string | undefined
  prev?: string[] | undefined
}

export const contractDocumentsPrefetch: Prefetch<
  { id: string; type: string },
  ContractDocumentsSearch
> = () => []

export interface DocumentSearch extends RouteSearch {
  tab: 'data' | 'meta' | 'revisions' | 'provenance'
  page: number
}

export const documentPrefetch: Prefetch<
  { contract: string; type: string; id: string },
  DocumentSearch
> = () => []

export type GroupsSearch = RouteSearch

export const groupsPrefetch: Prefetch<{ contract: string }, GroupsSearch> = () => []

export interface GroupSearch extends RouteSearch {
  tab: 'members' | 'actions'
  status: 'active' | 'closed'
}

export const groupPrefetch: Prefetch<{ contract: string; pos: string }, GroupSearch> = () => []
