// P-CHAIN: what each route reads before its page renders (ARCHITECTURE §6.3, §11.5). Loaded on demand by the route's loader.
import { peQueries } from '@/data/pe/queries'
import { radarQueries } from '@/data/radar/queries'
import { sdkQueries } from '@/data/sdk/queries'
import { base58Encode, isPlatformId } from '@/lib/base58'
import { hexToBytes, isHex, normalizeHex } from '@/lib/hex'
import { isDevnet } from '@/lib/network'
import { prefetchItem } from '../loader'
import type { NoParams, Prefetch, RouteSearch } from './types'

const NONE = {} as const

export interface EpochsSearch extends RouteSearch {
  from?: number | undefined
  to?: number | undefined
}

export const epochsPrefetch: Prefetch<NoParams, EpochsSearch> = (net) => [
  prefetchItem('sdk', sdkQueries['epoch.current'](net, NONE)),
  ...(isDevnet(net) ? [] : [prefetchItem('http', radarQueries.platform(net))]),
]

export interface EpochSearch extends RouteSearch {
  sort: string
}

/** Only the tip: whether the epoch is past, current or ahead decides what else is asked, so the page asks for it. */
export const epochPrefetch: Prefetch<{ n: string }, EpochSearch> = (net) => [
  prefetchItem('sdk', sdkQueries['epoch.current'](net, NONE)),
]

export interface ProtocolSearch extends RouteSearch {
  sort: string
}

export const protocolPrefetch: Prefetch<NoParams, ProtocolSearch> = (net) => [
  prefetchItem('sdk', sdkQueries['protocol.versionUpgradeState'](net, NONE)),
  ...(isDevnet(net) ? [] : [prefetchItem('http', radarQueries.platform(net))]),
]

export interface QuorumsSearch extends RouteSearch {
  q?: string | undefined
  type?: string[] | undefined
}

export const quorumsPrefetch: Prefetch<NoParams, QuorumsSearch> = (net) => [
  prefetchItem('sdk', sdkQueries['system.currentQuorumsInfo'](net, NONE)),
]

export interface CreditsSearch extends RouteSearch {
  id?: string | undefined
}

const platformIdOf = (input: string | undefined): string | undefined => {
  if (input === undefined) return undefined
  const text = input.trim()
  if (isPlatformId(text)) return text
  const hex = normalizeHex(text)
  return isHex(hex, 32) ? base58Encode(hexToBytes(hex)) : undefined
}

export const creditsPrefetch: Prefetch<NoParams, CreditsSearch> = (net, _params, search) => {
  const id = platformIdOf(search.id)
  return [
    prefetchItem('sdk', sdkQueries['system.totalCredits'](net, NONE)),
    ...(id
      ? [prefetchItem('sdk', sdkQueries['system.prefundedSpecializedBalance'](net, { id }))]
      : []),
  ]
}

export interface ShieldedSearch extends RouteSearch {
  range: '24h' | '3d' | '1w' | '1m'
  nf?: string | undefined
}

export const shieldedPrefetch: Prefetch<NoParams, ShieldedSearch> = (net, _params, search) => {
  const nf = search.nf === undefined ? undefined : normalizeHex(search.nf)
  return [
    prefetchItem('sdk', sdkQueries['shielded.poolState'](net, NONE)),
    prefetchItem('sdk', sdkQueries['shielded.mostRecentAnchor'](net, NONE)),
    ...(nf !== undefined && isHex(nf, 32)
      ? [prefetchItem('sdk', sdkQueries['shielded.nullifiers'](net, { nullifiers: [nf] }))]
      : []),
    ...(isDevnet(net)
      ? []
      : [
          prefetchItem('http', peQueries.shieldHistory(net, search.range)),
          prefetchItem('http', peQueries.unshieldHistory(net, search.range)),
        ]),
  ]
}
