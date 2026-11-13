// P-ID: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { peQueries } from '@/data/pe/queries'
import type { PeQuery } from '@/data/pe/params'
import { sdkQueries } from '@/data/sdk/queries'
import { isPlatformId } from '@/lib/base58'
import { CREDITS_PER_DASH } from '@/lib/units'
import type { NumericRange } from '@/lib/search-schemas'
import { prefetchItem } from '../loader'
import type { NoParams, Prefetch, RouteSearch } from './types'

export type { NumericRange }

export interface IdentitiesFilters {
  page: number
  limit: number
  sort: string
  type?: string[] | undefined
  bal?: NumericRange | undefined
  txs?: NumericRange | undefined
  docs?: NumericRange | undefined
  contracts?: NumericRange | undefined
  from?: string | undefined
  to?: string | undefined
}

export const IDENTITY_TYPES = ['regular', 'masternode', 'masternode_voting', 'masternode_operator'] as const

/** Sorts the page offers: PE sorts by creation (its default), balance and transaction count. */
export const SORTS = ['created', 'balance', 'txs'] as const
export type SortId = (typeof SORTS)[number]

const ORDER_BY: Record<SortId, string | undefined> = {
  created: undefined,
  balance: 'balance',
  txs: 'tx_count',
}

export function parseIdentitySort(sort: string): { id: SortId; desc: boolean } {
  const id = sort.replace(/^-/, '')
  return (SORTS as readonly string[]).includes(id)
    ? { id: id as SortId, desc: sort.startsWith('-') }
    : { id: 'created', desc: true }
}

/** A DASH amount as credits, exactly: 1 DASH is 10¹¹ credits. */
export function dashToCredits(dash: number): string {
  return (BigInt(Math.round(dash * 1e8)) * (CREDITS_PER_DASH / 100_000_000n)).toString()
}

/** The query PE's `/identities` takes for this page's filters. */
export function peIdentitiesQuery(f: IdentitiesFilters, page = f.page): PeQuery {
  const { id, desc } = parseIdentitySort(f.sort)
  const q: Record<string, string | number> = { limit: f.limit, order: desc ? 'desc' : 'asc' }
  if (page > 1) q.page = page
  const orderBy = ORDER_BY[id]
  if (orderBy) q.order_by = orderBy
  const type = f.type?.[0]
  if (type && (IDENTITY_TYPES as readonly string[]).includes(type)) q.identity_type = type
  if (f.bal?.min !== undefined) q.balance_min = dashToCredits(f.bal.min)
  if (f.bal?.max !== undefined) q.balance_max = dashToCredits(f.bal.max)
  if (f.txs?.min !== undefined) q.tx_count_min = f.txs.min
  if (f.txs?.max !== undefined) q.tx_count_max = f.txs.max
  if (f.docs?.min !== undefined) q.documents_count_min = f.docs.min
  if (f.docs?.max !== undefined) q.documents_count_max = f.docs.max
  if (f.contracts?.min !== undefined) q.data_contracts_min = f.contracts.min
  if (f.contracts?.max !== undefined) q.data_contracts_max = f.contracts.max
  return q
}


export interface IdentitiesSearch extends RouteSearch, IdentitiesFilters {}

export const identitiesPrefetch: Prefetch<NoParams, IdentitiesSearch> = (net, _params, search) => [
  prefetchItem('http', peQueries.identities(net, peIdentitiesQuery(search)), { wait: true }),
]

export interface IdentitySearch extends RouteSearch {
  tab:
    | 'overview'
    | 'keys'
    | 'names'
    | 'tokens'
    | 'groups'
    | 'votes'
    | 'transactions'
    | 'contracts'
    | 'documents'
    | 'transfers'
    | 'advanced'
  page: number
  contract?: string | undefined
  type?: string | undefined
  tokens?: string[] | undefined
}

export const identityPrefetch: Prefetch<{ id: string }, IdentitySearch> = (net, { id }, search) =>
  search.tab !== 'overview' || !isPlatformId(id)
    ? []
    : [
        prefetchItem('http', peQueries.identity(net, id)),
        prefetchItem('sdk', sdkQueries['identities.balanceAndRevision'](net, { id })),
      ]

export interface IdentityLookupSearch extends RouteSearch {
  pkh?: string | undefined
  after?: string | undefined
}

export const identityLookupPrefetch: Prefetch<NoParams, IdentityLookupSearch> = (net, _params, search) =>
  search.pkh ? [prefetchItem('sdk', sdkQueries['identities.byPublicKeyHash'](net, { pkh: search.pkh }))] : []
