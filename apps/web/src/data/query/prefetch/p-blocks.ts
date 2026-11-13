// P-BLOCKS: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { blocksQuery, HASH, heightLookup, needsUpperHeight, parseBlockRef } from '../../pe/blocks-query'
import { txsQuery } from '../../pe/transitions-query'
import { peQueries } from '../../pe/queries'
import type { NumericRange } from '@/lib/search-schemas'
import type { TransitionType } from '@/lib/tx-types'
import { prefetchItem } from '../loader'
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface PlatformBlocksSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  height?: NumericRange | undefined
  epoch?: NumericRange | undefined
  proposer?: string | undefined
  gas?: NumericRange | undefined
  txs?: NumericRange | undefined
  from?: string | undefined
  to?: string | undefined
  sort: string
}

/** The first page of the list as the page will ask for it; a date range needs a height the page works out first, so it waits. */
export const platformBlocksPrefetch: Prefetch<NoParams, PlatformBlocksSearch> = (net, _p, search) =>
  needsUpperHeight(search)
    ? []
    : [
        prefetchItem(
          'http',
          peQueries.blocks(net, { ...blocksQuery(search, undefined), page: search.page, limit: search.limit }),
        ),
      ]

export interface PlatformBlockSearch extends RouteSearch {
  tab: 'transitions' | 'quorum' | 'info'
  page: number
}

/** A block by its hash; a height is turned into a hash by the page, so its list lookup is started instead. */
export const platformBlockPrefetch: Prefetch<{ id: string }, PlatformBlockSearch> = (net, { id }) => {
  const ref = parseBlockRef(id)
  if (ref?.kind === 'hash') return [prefetchItem('http', peQueries.block(net, ref.hash))]
  if (ref?.kind === 'height') return [prefetchItem('http', peQueries.blocks(net, heightLookup(ref.height)))]
  return []
}

export interface PlatformTxsSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  type?: TransitionType[] | undefined
  batch?: string[] | undefined
  status?: 'success' | 'fail' | undefined
  gas?: NumericRange | undefined
  owner?: string | undefined
  from?: string | undefined
  to?: string | undefined
  sort: string
}

export const platformTxsPrefetch: Prefetch<NoParams, PlatformTxsSearch> = (net, _p, search) => [
  prefetchItem(
    'http',
    peQueries.transactions(net, { ...txsQuery(search), page: search.page, limit: search.limit }),
  ),
]

export interface PlatformTxSearch extends RouteSearch {
  raw: 'json' | 'hex' | 'base64'
}

export const platformTxPrefetch: Prefetch<{ hash: string }, PlatformTxSearch> = (net, { hash }) =>
  HASH.test(hash) ? [prefetchItem('http', peQueries.transaction(net, hash.toLowerCase()))] : []
