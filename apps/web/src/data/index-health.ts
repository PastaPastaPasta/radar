import { useQuery } from '@tanstack/react-query'
import { endpoint } from './endpoints'
import { useDecentralizedOnly, useNetworkSourceHealth, type SourceHealth } from './health'
import { indexedLagDetail } from './health-lag'
import { healthQueries } from './health-queries'
import type { IndexState } from './index-state'
import { isDevnet, type NetworkId } from '@/lib/network'

/** What is known of one index: how far it has indexed and how it stands against the chain. */
export interface IndexFacts {
  state: IndexState | 'unknown'
  indexedHeight?: number
  behind?: number
  /** "indexed to block 1,577,999 (18 days behind)", for notices. */
  lag?: string
}

export interface IndexHealth extends IndexFacts {
  /** True while a page should wait to learn which index to read, instead of starting a Hyphen read it may drop. */
  pending: boolean
  /** Where the reads Insight can answer go: Insight while Hyphen's index is stale and Insight is offered. */
  readFrom: 'hyphen' | 'insight'
  /** Hyphen answered its status probe. */
  probed: boolean
  /** Insight's own standing, measured once a page reads from it (`insight: true`, or while it is the source in use). */
  insight: IndexFacts
  /** Decentralized only mode is on: no index is probed or read, and a page shows its unavailable state instead. */
  off: boolean
}

function factsOf(indexedHeight: number | undefined, health: SourceHealth): IndexFacts {
  if (indexedHeight === undefined) return { state: 'unknown' }
  return {
    state: health.index ?? 'unknown',
    indexedHeight,
    behind: health.lag?.blocks,
    lag: health.lag?.detail ?? indexedLagDetail(indexedHeight, 0),
  }
}

/**
 * The one place that decides whether Hyphen's index can be read for a network (§4.7 rule 3). The probe compares the
 * lowest height Hyphen has indexed with DAPI's best height (Radar's crawled height where DAPI has none) and
 * leaves the gap in the health registry, which applies the stale and fresh thresholds to it (`index-state.ts`), so a
 * page whose requests all succeed still learns that what it reads is old. A probe with nothing to measure against
 * leaves the earlier answer standing.
 *
 * `insight: true` also probes Insight, for a page that may read it while Hyphen is fresh; Insight is probed
 * whenever it is the source in use. In Decentralized only mode neither index is probed and nothing is known of either.
 */
export function useIndexHealth(net: NetworkId, opts: { insight?: boolean } = {}): IndexHealth {
  const off = useDecentralizedOnly()
  const enabled = !isDevnet(net) && !off
  const probe = useQuery({ ...healthQueries.hyphen(net), enabled })
  const health = useNetworkSourceHealth(net, 'hyphen')
  const hyphen = factsOf(probe.data?.height, health)
  const insightOffered = enabled && endpoint(net, 'insight') !== null
  const readFrom = hyphen.state === 'stale' && insightOffered ? 'insight' : 'hyphen'
  const insightProbe = useQuery({
    ...healthQueries.insight(net),
    enabled: insightOffered && (readFrom === 'insight' || opts.insight === true),
  })
  const insight = factsOf(insightProbe.data?.height, useNetworkSourceHealth(net, 'insight'))
  return {
    ...hyphen,
    pending: enabled && probe.isPending,
    readFrom,
    probed: enabled && probe.isSuccess,
    insight,
    off,
  }
}
