// TOOLS: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface QuerySearch extends RouteSearch {
  q?: string | undefined
  contract?: string | undefined
}

export const queryPrefetch: Prefetch<NoParams, QuerySearch> = () => []

export interface DecoderSearch extends RouteSearch {
  contract?: string | undefined
  type?: string | undefined
  preset?: string | undefined
}

export const decoderPrefetch: Prefetch<{ decoder: string }, DecoderSearch> = () => []

export type TransitionToolSearch = RouteSearch

export const transitionToolPrefetch: Prefetch<NoParams, TransitionToolSearch> = () => []

export interface SdkReferenceSearch extends RouteSearch {
  q?: string | undefined
}

export const sdkReferencePrefetch: Prefetch<NoParams, SdkReferenceSearch> = () => []
