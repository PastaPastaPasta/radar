// NET-A: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface NodesSearch extends RouteSearch {
  scope: 'all' | 'mn' | 'evo' | 'other'
  versions: 'now' | 'time'
  days: '1' | '7' | '30' | '90' | '365'
}

export const nodesPrefetch: Prefetch<NoParams, NodesSearch> = () => []

export type V24Search = RouteSearch

export const v24Prefetch: Prefetch<NoParams, V24Search> = () => []
