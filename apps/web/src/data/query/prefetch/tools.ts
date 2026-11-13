// TOOLS: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { sdkQueries } from '@/data/sdk/queries'
import { isPlatformId } from '@/lib/base58'
import { systemContract } from '@/lib/well-known'
import { prefetchItem } from '../loader'
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface QuerySearch extends RouteSearch {
  q?: string | undefined
  contract?: string | undefined
}

/** The schema panel reads the contract the picker names, which is DPNS until another is chosen. */
export const queryPrefetch: Prefetch<NoParams, QuerySearch> = (net, _params, search) => {
  const id = search.contract ?? systemContract('dpns').id
  return isPlatformId(id) ? [prefetchItem('sdk', sdkQueries['contracts.fetch'](net, { id }))] : []
}

export interface DecoderSearch extends RouteSearch {
  contract?: string | undefined
  type?: string | undefined
  preset?: string | undefined
}

export const decoderPrefetch: Prefetch<{ decoder: string }, DecoderSearch> = (
  net,
  { decoder },
  search,
) =>
  decoder === 'document' && search.contract && isPlatformId(search.contract)
    ? [prefetchItem('sdk', sdkQueries['contracts.serialized'](net, { id: search.contract }))]
    : []

export type TransitionToolSearch = RouteSearch

export const transitionToolPrefetch: Prefetch<NoParams, TransitionToolSearch> = () => []

export interface SdkReferenceSearch extends RouteSearch {
  q?: string | undefined
}

export const sdkReferencePrefetch: Prefetch<NoParams, SdkReferenceSearch> = () => []
