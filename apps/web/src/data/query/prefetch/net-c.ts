// NET-C: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { prefetchItem } from '../loader'
import { isDevnet } from '@/lib/network'
import { radarQueries } from '@/data/radar/queries'
import type { Prefetch, RouteSearch } from './types'

export interface MnSearch extends RouteSearch {
  tab?: 'overview' | 'network' | 'platform' | 'history' | 'payments' | undefined
  epoch?: number | undefined
  before?: number | undefined
}

const PROTX = /^[0-9a-f]{64}$/i

export const mnPrefetch: Prefetch<{ protx: string }, MnSearch> = (net, { protx }) =>
  isDevnet(net) || !PROTX.test(protx)
    ? []
    : [prefetchItem('http', radarQueries.masternode(net, protx), { wait: true })]
