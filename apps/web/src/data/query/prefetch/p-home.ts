// P-HOME: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { isDevnet } from '@/lib/network'
import { peQueries } from '@/data/pe/queries'
import { sdkQueries } from '@/data/sdk/queries'
import { prefetchItem } from '../loader'
import type { NoParams, Prefetch, RouteSearch } from './types'

export interface PlatformHomeSearch extends RouteSearch {
  range: '24h' | '3d' | '1w' | '1m'
  rich: 'balance' | 'txs'
}

const NONE = {} as const

/**
 * The first screen only: the vital signs (four SDK reads, started only when the SDK is already connected) and the
 * indexer's pulse and newest lists. Charts, leaderboards and the chain cards load when they scroll near.
 */
export const platformHomePrefetch: Prefetch<NoParams, PlatformHomeSearch> = (net) => [
  prefetchItem('sdk', sdkQueries['epoch.current'](net, NONE)),
  prefetchItem('sdk', sdkQueries['system.totalCredits'](net, NONE)),
  prefetchItem('sdk', sdkQueries['protocol.versionUpgradeState'](net, NONE)),
  prefetchItem('sdk', sdkQueries['system.currentQuorumsInfo'](net, NONE)),
  ...(isDevnet(net)
    ? []
    : [
        prefetchItem('http', peQueries.status(net)),
        prefetchItem('http', peQueries.epoch(net)),
        prefetchItem('http', peQueries.latestBlocks(net, 5)),
        prefetchItem('http', peQueries.latestTransactions(net, 5)),
      ]),
]
