// P-TOKEN: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { peQueries } from '../../pe/queries'
import { tokensQuery } from '../../pe/tokens-query'
import { sdkQueries } from '../../sdk/queries'
import { isPlatformId } from '@/lib/base58'
import { isDevnet, type NetworkId } from '@/lib/network'
import { prefetchItem } from '../loader'
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface TokensSearch extends RouteSearch {
  page: number
  limit: 10 | 25 | 50 | 75 | 100
  sort?: string | undefined
  owner?: string | undefined
  contract?: string | undefined
  q?: string | undefined
}

/** The first page of the list as the page will ask for it. */
export const tokensPrefetch: Prefetch<NoParams, TokensSearch> = (net, _p, search) =>
  isDevnet(net)
    ? []
    : [
        prefetchItem(
          'http',
          peQueries.tokens(net, { ...tokensQuery(search), page: search.page, limit: search.limit }),
        ),
      ]

export interface TokenSearch extends RouteSearch {
  tab: 'overview' | 'definition' | 'activity' | 'holders' | 'distribution' | 'balance'
  who?: string | undefined
  page: number
}

const contractOf = (net: NetworkId, id: string) =>
  isPlatformId(id)
    ? [prefetchItem('sdk', sdkQueries['tokens.contractInfo'](net, { tokenId: id }))]
    : []

export const tokenPrefetch: Prefetch<{ id: string }, TokenSearch> = (net, { id }, search) => [
  ...(isPlatformId(id) && search.tab === 'overview' && !isDevnet(net)
    ? [prefetchItem('http', peQueries.token(net, id))]
    : []),
  ...contractOf(net, id),
]

export interface TokenHoldersSearch extends RouteSearch {
  ids?: string[] | undefined
  page: number
}

export const tokenHoldersPrefetch: Prefetch<{ id: string }, TokenHoldersSearch> = (net, { id }) =>
  contractOf(net, id)

export interface PlatformAddressSearch extends RouteSearch {
  page: number
}

export const platformAddressPrefetch: Prefetch<{ addr: string }, PlatformAddressSearch> = () => []
