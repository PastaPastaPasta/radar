// P-DATA: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { NumericRange, WhereClause } from '@/lib/search-schemas'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

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

export function contractsPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: ContractsSearch,
): PrefetchItem[] {
  return []
}

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

export function contractPrefetch(
  _net: NetworkId,
  _params: { id: string },
  _search: ContractSearch,
): PrefetchItem[] {
  return []
}

export interface ContractDocumentsSearch extends RouteSearch {
  where?: WhereClause[] | undefined
  order?: string[] | undefined
  limit: 10 | 25 | 50 | 100
  after?: string | undefined
  prev?: string[] | undefined
}

export function contractDocumentsPrefetch(
  _net: NetworkId,
  _params: { id: string; type: string },
  _search: ContractDocumentsSearch,
): PrefetchItem[] {
  return []
}

export interface DocumentSearch extends RouteSearch {
  tab: 'data' | 'meta' | 'revisions' | 'provenance'
  page: number
}

export function documentPrefetch(
  _net: NetworkId,
  _params: { contract: string; type: string; id: string },
  _search: DocumentSearch,
): PrefetchItem[] {
  return []
}

export type GroupsSearch = RouteSearch

export function groupsPrefetch(
  _net: NetworkId,
  _params: { contract: string },
  _search: GroupsSearch,
): PrefetchItem[] {
  return []
}

export interface GroupSearch extends RouteSearch {
  tab: 'members' | 'actions'
  status: 'active' | 'closed'
}

export function groupPrefetch(
  _net: NetworkId,
  _params: { contract: string; pos: string },
  _search: GroupSearch,
): PrefetchItem[] {
  return []
}
