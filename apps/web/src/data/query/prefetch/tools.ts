// TOOLS: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface QuerySearch extends RouteSearch {
  q?: string | undefined
  contract?: string | undefined
}

export function queryPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: QuerySearch,
): PrefetchItem[] {
  return []
}

export interface DecoderSearch extends RouteSearch {
  contract?: string | undefined
  type?: string | undefined
  preset?: string | undefined
}

export function decoderPrefetch(
  _net: NetworkId,
  _params: { decoder: string },
  _search: DecoderSearch,
): PrefetchItem[] {
  return []
}

export type TransitionToolSearch = RouteSearch

export function transitionToolPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: TransitionToolSearch,
): PrefetchItem[] {
  return []
}

export interface SdkReferenceSearch extends RouteSearch {
  q?: string | undefined
}

export function sdkReferencePrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: SdkReferenceSearch,
): PrefetchItem[] {
  return []
}
