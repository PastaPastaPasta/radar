// NET-B: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'
import type { NoParams, RouteSearch } from './types'

export interface MasternodesSearch extends RouteSearch {
  q?: string | undefined
  type?: ('regular' | 'evo')[] | undefined
  status?: ('enabled' | 'pose-banned')[] | undefined
  reach?: 'reachable' | 'unreachable' | undefined
  country?: string[] | undefined
  version?: string[] | undefined
  host?: string[] | undefined
  dkg?: string[] | undefined
  sort: string
  view: 'list' | 'platform'
  pf: 'all' | 'proposed' | 'not-in-set' | 'vote-not-counted'
  page: number
}

export function masternodesPrefetch(
  _net: NetworkId,
  _params: NoParams,
  _search: MasternodesSearch,
): PrefetchItem[] {
  return []
}
