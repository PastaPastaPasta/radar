import { useQuery } from '@tanstack/react-query'
import { endpoint } from './endpoints'
import { useSourceHealth } from './health'
import { healthQueries } from './health-queries'
import { settleIndexState, type IndexState } from './index-state'
import { isDevnet, type NetworkId } from '@/lib/network'

export interface IndexHealth {
  /** `unknown` until Hyphen's status has answered and a chain tip to measure it against was found. */
  state: IndexState | 'unknown'
  /** True while a page should wait to learn which index to read, instead of starting a Hyphen read it may drop. */
  pending: boolean
  /** Where the reads Insight can answer go: Insight while Hyphen's index is stale and Insight is offered. */
  readFrom: 'hyphen' | 'insight'
  /** Hyphen answered its status probe. */
  probed: boolean
  indexedHeight?: number
  behind?: number
  /** "indexed to block 1,577,999 (18 days behind)", for notices. */
  lag?: string
}

/**
 * The one place that decides whether Hyphen's index can be read for a network (§4.7 rule 3). The probe compares the
 * lowest height Hyphen has indexed with DAPI's best height (Radar's crawled height where DAPI has none) and
 * leaves the gap in the health registry; this applies the stale and fresh thresholds to it, so a page whose
 * requests all succeed still learns that what it reads is old.
 */
export function useIndexHealth(net: NetworkId): IndexHealth {
  const enabled = !isDevnet(net)
  const probe = useQuery({ ...healthQueries.hyphen(net), enabled })
  const lag = useSourceHealth('hyphen').lag
  const pending = enabled && probe.isPending
  const indexed = probe.data?.height
  if (!enabled || indexed === undefined || lag?.blocks === undefined) {
    return {
      state: 'unknown',
      pending,
      readFrom: 'hyphen',
      probed: probe.isSuccess,
      indexedHeight: indexed,
    }
  }
  const state = settleIndexState(net, lag.blocks)
  return {
    state,
    pending: false,
    readFrom: state === 'stale' && endpoint(net, 'insight') !== null ? 'insight' : 'hyphen',
    probed: true,
    indexedHeight: indexed,
    behind: lag.blocks,
    lag: lag.detail,
  }
}
