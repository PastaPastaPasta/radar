// P-DATA: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { peQueries } from '@/data/pe/queries'
import type { PeQuery } from '@/data/pe/params'
import { sdkQueries } from '@/data/sdk/queries'
import { isPlatformId } from '@/lib/base58'
import { isDevnet } from '@/lib/network'
import type { NumericRange, WhereClause } from '@/lib/search-schemas'
import { prefetchItem, type PrefetchItem } from '../loader'
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

/** The sorts the contracts list offers, and the field Platform Explorer sorts each by. */
export const SORT_FIELD = { created: 'block_height', docs: 'documents_count' } as const
export type SortName = keyof typeof SORT_FIELD

export function sortOf(sort: string): { name: SortName; desc: boolean } {
  const desc = sort.startsWith('-')
  const raw = desc ? sort.slice(1) : sort
  return { name: raw === 'docs' ? 'docs' : 'created', desc }
}

/** Platform Explorer's query for one page of the contracts list under the address's filters. */
export function contractsPeQuery(search: ContractsSearch, page: number, limit: number): PeQuery {
  const { name, desc } = sortOf(search.sort)
  return {
    page,
    limit,
    order: desc ? 'desc' : 'asc',
    order_by: SORT_FIELD[name],
    owner: search.owner,
    is_system: search.system === true ? 'true' : undefined,
    with_tokens: search.tokens === true ? 'true' : undefined,
    documents_count_min: search.docs?.min === undefined ? undefined : String(search.docs.min),
    documents_count_max: search.docs?.max === undefined ? undefined : String(search.docs.max),
    timestamp_start: search.from ? `${search.from}T00:00:00.000Z` : undefined,
    timestamp_end: search.to ? `${search.to}T23:59:59.999Z` : undefined,
  }
}

export const contractsPrefetch: Prefetch<NoParams, ContractsSearch> = (net, _params, search) =>
  isDevnet(net)
    ? []
    : [
        prefetchItem(
          'http',
          peQueries.dataContracts(net, contractsPeQuery(search, search.page, search.limit)),
          { wait: true },
        ),
      ]

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
  base?: number | undefined
  from?: string | undefined
  to?: string | undefined
}

export const contractPrefetch: Prefetch<{ id: string }, ContractSearch> = (net, { id }) => {
  if (!isPlatformId(id)) return []
  const items: PrefetchItem[] = [prefetchItem('sdk', sdkQueries['contracts.fetch'](net, { id }))]
  if (!isDevnet(net)) items.push(prefetchItem('http', peQueries.dataContract(net, id)))
  return items
}

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
> = (net, { id }) =>
  isPlatformId(id) ? [prefetchItem('sdk', sdkQueries['contracts.fetch'](net, { id }))] : []

export interface DocumentSearch extends RouteSearch {
  tab: 'data' | 'meta' | 'revisions' | 'provenance'
  page: number
}

export const documentPrefetch: Prefetch<
  { contract: string; type: string; id: string },
  DocumentSearch
> = (net, { contract, type, id }) =>
  isPlatformId(contract) && isPlatformId(id)
    ? [
        prefetchItem('sdk', sdkQueries['documents.get'](net, { contractId: contract, type, id })),
        prefetchItem('sdk', sdkQueries['contracts.fetch'](net, { id: contract })),
      ]
    : []

export type GroupsSearch = RouteSearch

export const groupsPrefetch: Prefetch<{ contract: string }, GroupsSearch> = (net, { contract }) =>
  isPlatformId(contract)
    ? [prefetchItem('sdk', sdkQueries['group.infos'](net, { contractId: contract }))]
    : []

export interface GroupSearch extends RouteSearch {
  tab: 'members' | 'actions'
  status: 'active' | 'closed'
}

export const groupPrefetch: Prefetch<{ contract: string; pos: string }, GroupSearch> = (
  net,
  { contract, pos },
) =>
  isPlatformId(contract) && /^\d+$/.test(pos)
    ? [
        prefetchItem(
          'sdk',
          sdkQueries['group.info'](net, { contractId: contract, position: Number(pos) }),
        ),
      ]
    : []
