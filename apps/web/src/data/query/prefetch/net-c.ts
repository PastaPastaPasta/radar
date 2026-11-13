// NET-C: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { coreQueries } from '@/data/core/queries'
import { radarQueries } from '@/data/radar/queries'
import { sdkQueries } from '@/data/sdk/queries'
import { isDevnet } from '@/lib/network'
import { prefetchItem, type PrefetchItem } from '../loader'
import type { Prefetch, RouteSearch } from './types'

export interface MnSearch extends RouteSearch {
  tab?: 'overview' | 'network' | 'platform' | 'history' | 'payments' | undefined
  epoch?: number | undefined
  before?: number | undefined
}

const PROTX = /^[0-9a-f]{64}$/i
const PAYMENTS_PAGE = 25

export const mnPrefetch: Prefetch<{ protx: string }, MnSearch> = (net, { protx }, search) => {
  if (isDevnet(net) || !PROTX.test(protx)) return []
  const items: PrefetchItem[] = [
    prefetchItem('http', radarQueries.masternode(net, protx), { wait: true }),
    prefetchItem('dapi', coreQueries.masternodeList(net), { detail: true }),
  ]
  if (search.tab === 'network') items.push(prefetchItem('http', radarQueries.mnBench(net, protx)))
  if (search.tab === 'payments' && search.before !== undefined) {
    items.push(
      prefetchItem(
        'http',
        radarQueries.payments(net, protx, { before: search.before, limit: PAYMENTS_PAGE }),
      ),
    )
  }
  if (search.tab === 'platform') {
    items.push(prefetchItem('sdk', sdkQueries['epoch.current'](net, {})))
  }
  return items
}
